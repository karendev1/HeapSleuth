import { fileURLToPath } from "node:url";

import { ZodError } from "zod";

import { PersistenceError } from "../baseline/artifacts.js";
import { SourceBoundaryError } from "../baseline/source-loader.js";
import { loadBenchmarkCases } from "../dataset/load-cases.js";
import type {
  ModelProvider,
  ModelProviderResponse,
} from "../model/model-provider.js";
import { ProviderRequestError } from "../model/model-provider.js";
import {
  investigatorFailureSchema,
  investigatorInputManifestSchema,
  type InvestigatorBrowserEvidence,
  type InvestigatorInputManifest,
} from "../schemas/investigator.js";
import type { RunMetadata } from "../schemas/run-metadata.js";
import {
  completeRunMetadata,
  createRunMetadata,
} from "../telemetry/run-metadata.js";
import {
  archiveExistingInvestigatorArtifacts,
  persistInvestigatorFailure,
  persistInvestigatorSuccess,
} from "./artifacts.js";
import {
  BrowserEvidenceError,
  collectInvestigatorBrowserEvidence,
  type BrowserToolObservation,
} from "./browser-tools.js";
import {
  buildInvestigatorPrompt,
  hashInvestigatorValue,
  INVESTIGATOR_PROMPT_VERSION,
  loadInvestigatorPromptTemplate,
} from "./prompt.js";
import {
  readInvestigatorSources,
  type InvestigatorSourceFile,
  type SourceToolObservation,
} from "./source-tools.js";
import {
  InvestigatorTrajectory,
  TrajectoryPersistenceError,
} from "./trajectory.js";
import {
  InvestigatorOutputError,
  parseInvestigatorDiagnosis,
} from "./validation.js";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

type FailureCategory = RunMetadata["errorCategory"] & string;
type ToolObservation = BrowserToolObservation | SourceToolObservation;

export type InvestigatorExecution = {
  caseId: string;
  status: "succeeded" | "failed";
  attemptCount: number;
  outputDirectory: string;
  trajectoryPath: string;
  browserEvidence?: InvestigatorBrowserEvidence;
  errorCategory?: FailureCategory;
};

export type InvestigatorRunnerOptions = {
  caseId: string;
  provider: ModelProvider;
  resultsRoot: string;
  trajectoriesRoot: string;
  headless: boolean;
  projectRoot?: string;
  sensitiveValues?: readonly string[];
  collectBrowserEvidence?: typeof collectInvestigatorBrowserEvidence;
};

export function sanitizeInvestigatorError(
  message: string,
  sensitiveValues: readonly string[] = [],
): string {
  let sanitized = message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|AIza)[A-Za-z0-9_-]+\b/g, "[REDACTED]");
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      sanitized = sanitized.split(sensitiveValue).join("[REDACTED]");
    }
  }
  return sanitized.slice(0, 1_000) || "Investigator execution failed.";
}

function classifyError(error: unknown): FailureCategory {
  if (error instanceof SourceBoundaryError) return "source-boundary";
  if (error instanceof BrowserEvidenceError) return "browser-evidence";
  if (error instanceof ProviderRequestError) return "provider";
  if (error instanceof InvestigatorOutputError) return error.category;
  if (error instanceof TrajectoryPersistenceError) return "trajectory";
  if (error instanceof PersistenceError) return "persistence";
  if (error instanceof ZodError) return "schema-validation";
  return "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createManifest(input: {
  caseId: string;
  description: string;
  route: string;
  expectedSourcePaths: readonly string[];
  sources: readonly InvestigatorSourceFile[];
  browserEvidence?: InvestigatorBrowserEvidence;
  promptSha256: string | null;
}): InvestigatorInputManifest {
  const loadedByPath = new Map(
    input.sources.map((source) => [source.path, source]),
  );
  return investigatorInputManifestSchema.parse({
    schemaVersion: 1,
    caseId: input.caseId,
    approach: "solution",
    description: input.description,
    route: input.route,
    sources: input.expectedSourcePaths.map((sourcePath) => {
      const source = loadedByPath.get(sourcePath);
      return {
        path: sourcePath,
        byteCount: source?.byteCount ?? null,
        sha256: source?.sha256 ?? null,
      };
    }),
    browserEvidenceSha256:
      input.browserEvidence === undefined
        ? null
        : hashInvestigatorValue(JSON.stringify(input.browserEvidence)),
    prompt: {
      version: INVESTIGATOR_PROMPT_VERSION,
      sha256: input.promptSha256,
    },
  });
}

function recordToolObservation(
  trajectory: InvestigatorTrajectory,
  observation: ToolObservation,
): void {
  trajectory.add(observation.type, observation.summary, {
    tool: observation.tool,
    ...(observation.data ?? {}),
  });
}

export async function runInvestigatorCase(
  options: InvestigatorRunnerOptions,
): Promise<InvestigatorExecution> {
  const root = options.projectRoot ?? projectRoot;
  const benchmarkCase = (await loadBenchmarkCases()).find(
    ({ id }) => id === options.caseId,
  );
  if (benchmarkCase === undefined) {
    throw new Error(`Unknown Investigator case ID: ${options.caseId}`);
  }
  await archiveExistingInvestigatorArtifacts(
    options.resultsRoot,
    benchmarkCase.id,
  );

  const trajectory = new InvestigatorTrajectory(benchmarkCase.id);
  trajectory.add(
    "instruction",
    "Use the versioned Investigator protocol and only case-scoped evidence.",
    { promptVersion: INVESTIGATOR_PROMPT_VERSION },
  );
  trajectory.add("input", "Loaded neutral benchmark metadata.", {
    description: benchmarkCase.description,
    route: benchmarkCase.route,
    scenario: benchmarkCase.scenario,
    allowedSourcePaths: benchmarkCase.sourceFiles,
  });

  let sources: InvestigatorSourceFile[] = [];
  let browserEvidence: InvestigatorBrowserEvidence | undefined;
  let promptSha256: string | null = null;
  let attemptCount = 0;
  let providerResponse: ModelProviderResponse | undefined;
  const startedMetadata = createRunMetadata({
    approach: "solution",
    caseId: benchmarkCase.id,
    model: options.provider.model,
    provider: options.provider.kind,
    promptVersion: INVESTIGATOR_PROMPT_VERSION,
    requestSettings: options.provider.settings,
    attemptCount: 0,
  });

  try {
    sources = await readInvestigatorSources({
      projectRoot: root,
      allowedPaths: benchmarkCase.sourceFiles,
      observe: (observation) => recordToolObservation(trajectory, observation),
    });
    browserEvidence = await (
      options.collectBrowserEvidence ?? collectInvestigatorBrowserEvidence
    )({
      benchmarkCase,
      headless: options.headless,
      observe: (observation) => recordToolObservation(trajectory, observation),
    });
    const template = await loadInvestigatorPromptTemplate(root);
    const prompt = buildInvestigatorPrompt({
      template,
      benchmarkCase,
      sources,
      browserEvidence,
    });
    promptSha256 = hashInvestigatorValue(prompt);
    trajectory.add(
      "decision-summary",
      "Validated the bounded evidence and prepared one model request.",
      {
        promptSha256,
        evidenceSchemaVersion: browserEvidence.schemaVersion,
        evidenceCategories: ["runtime", "heap", "source", "console"],
      },
    );
    trajectory.add("tool-call", "Request one structured diagnosis.", {
      tool: "model_provider.generate",
      provider: options.provider.kind,
      model: options.provider.model,
    });
    attemptCount = 1;
    providerResponse = await options.provider.generate({
      caseId: benchmarkCase.id,
      prompt,
    });
    trajectory.add("tool-result", "Received the model response.", {
      tool: "model_provider.generate",
      responseId: providerResponse.responseId ?? null,
      usage: providerResponse.usage ?? null,
    });
    const diagnosis = parseInvestigatorDiagnosis({
      text: providerResponse.text,
      expectedCaseId: benchmarkCase.id,
      allowedSourcePaths: benchmarkCase.sourceFiles,
      availableEvidenceSources: new Set([
        "runtime",
        "heap",
        "source",
        "console",
      ]),
    });
    trajectory.add(
      "decision-summary",
      "The diagnosis passed schema and evidence-boundary validation.",
      { verdict: diagnosis.verdict, confidence: diagnosis.confidence },
    );
    const metadata = completeRunMetadata(startedMetadata, "succeeded", {
      attemptCount,
      ...(providerResponse.usage === undefined
        ? {}
        : { usage: providerResponse.usage }),
      ...(providerResponse.responseId === undefined
        ? {}
        : { providerResponseId: providerResponse.responseId }),
    });
    const manifest = createManifest({
      caseId: benchmarkCase.id,
      description: benchmarkCase.description,
      route: benchmarkCase.route,
      expectedSourcePaths: benchmarkCase.sourceFiles,
      sources,
      browserEvidence,
      promptSha256,
    });
    const outputDirectory = await persistInvestigatorSuccess({
      resultsRoot: options.resultsRoot,
      diagnosis,
      metadata,
      manifest,
      browserEvidence,
    });
    trajectory.add("final-result", "Saved the validated Investigator result.", {
      status: "succeeded",
      verdict: diagnosis.verdict,
      result: diagnosis,
    });
    const trajectoryPath = await trajectory.persist(
      options.trajectoriesRoot,
      metadata.runId,
    );
    return {
      caseId: benchmarkCase.id,
      status: "succeeded",
      attemptCount,
      outputDirectory,
      trajectoryPath,
      browserEvidence,
    };
  } catch (error) {
    const category = classifyError(error);
    const message = sanitizeInvestigatorError(
      errorMessage(error),
      options.sensitiveValues,
    );
    const failure = investigatorFailureSchema.parse({
      schemaVersion: 1,
      caseId: benchmarkCase.id,
      status: "failed",
      category,
      message,
      attemptCount,
    });
    const metadata = completeRunMetadata(startedMetadata, "failed", {
      attemptCount,
      error: message,
      errorCategory: category,
      ...(providerResponse?.usage === undefined
        ? {}
        : { usage: providerResponse.usage }),
      ...(providerResponse?.responseId === undefined
        ? {}
        : { providerResponseId: providerResponse.responseId }),
    });
    const manifest = createManifest({
      caseId: benchmarkCase.id,
      description: benchmarkCase.description,
      route: benchmarkCase.route,
      expectedSourcePaths: benchmarkCase.sourceFiles,
      sources,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
      promptSha256,
    });
    const outputDirectory = await persistInvestigatorFailure({
      resultsRoot: options.resultsRoot,
      failure,
      metadata,
      manifest,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
    });
    trajectory.add("final-result", "Saved the failed Investigator run.", {
      status: "failed",
      category,
      message,
      attemptCount,
    });
    const trajectoryPath = await trajectory.persist(
      options.trajectoriesRoot,
      metadata.runId,
    );
    return {
      caseId: benchmarkCase.id,
      status: "failed",
      attemptCount,
      outputDirectory,
      trajectoryPath,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
      errorCategory: category,
    };
  }
}
