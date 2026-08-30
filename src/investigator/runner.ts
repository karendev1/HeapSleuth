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
import type { ModelUsage } from "../model/types.js";
import type { Diagnosis } from "../schemas/diagnosis.js";
import {
  investigatorFailureSchema,
  investigatorInputManifestSchema,
  type InvestigatorBrowserEvidence,
  type InvestigatorInputManifest,
} from "../schemas/investigator.js";
import type { AgentRunMetadata, RunMetadata } from "../schemas/run-metadata.js";
import type { Verification } from "../schemas/verification.js";
import {
  completeRunMetadata,
  createRunMetadata,
} from "../telemetry/run-metadata.js";
import {
  buildVerifierPrompt,
  hashVerifierValue,
  loadVerifierPromptTemplate,
  VERIFIER_PROMPT_VERSION,
} from "../verifier/prompt.js";
import {
  parseVerifierOutput,
  resolveVerifiedDiagnosis,
  VerifierOutputError,
} from "../verifier/validation.js";
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
  type EvidenceSource,
  InvestigatorOutputError,
  parseInvestigatorDiagnosis,
} from "./validation.js";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

const availableEvidenceSources = new Set<EvidenceSource>([
  "runtime",
  "heap",
  "source",
  "console",
]);

type FailureCategory = RunMetadata["errorCategory"] & string;
type ToolObservation = BrowserToolObservation | SourceToolObservation;
type Agent = AgentRunMetadata["agent"];

export type InvestigatorExecution = {
  caseId: string;
  status: "succeeded" | "failed";
  attemptCount: number;
  investigatorAttemptCount: number;
  verifierAttemptCount: number;
  outputDirectory: string;
  trajectoryPath: string;
  browserEvidence?: InvestigatorBrowserEvidence;
  verificationDecision?: Verification["decision"];
  finalDiagnosis?: Diagnosis;
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
  return sanitized.slice(0, 1_000) || "Solution execution failed.";
}

function classifyError(error: unknown): FailureCategory {
  if (error instanceof SourceBoundaryError) return "source-boundary";
  if (error instanceof BrowserEvidenceError) return "browser-evidence";
  if (error instanceof ProviderRequestError) return "provider";
  if (error instanceof InvestigatorOutputError) return error.category;
  if (error instanceof VerifierOutputError) return error.category;
  if (error instanceof TrajectoryPersistenceError) return "trajectory";
  if (error instanceof PersistenceError) return "persistence";
  if (error instanceof ZodError) return "schema-validation";
  return "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addUsage(
  responses: readonly (ModelProviderResponse | undefined)[],
): ModelUsage | undefined {
  const usage = responses.flatMap((response) =>
    response?.usage === undefined ? [] : [response.usage],
  );
  if (usage.length === 0) return undefined;
  return usage.reduce(
    (total, value) => ({
      inputTokens: total.inputTokens + value.inputTokens,
      outputTokens: total.outputTokens + value.outputTokens,
      totalTokens: total.totalTokens + value.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function completeAgentRun(input: {
  agent: Agent;
  promptVersion: string;
  startedAt: Date;
  status: "succeeded" | "failed";
  attemptCount: number;
  response?: ModelProviderResponse;
  category?: FailureCategory;
  error?: string;
  completedAt?: Date;
}): AgentRunMetadata {
  const completedAt = input.completedAt ?? new Date();
  return {
    agent: input.agent,
    status: input.status,
    promptVersion: input.promptVersion,
    startedAt: input.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - input.startedAt.getTime()),
    attemptCount: input.attemptCount,
    ...(input.response?.responseId === undefined
      ? {}
      : { providerResponseId: input.response.responseId }),
    ...(input.response?.usage === undefined
      ? {}
      : { usage: input.response.usage }),
    ...(input.category === undefined ? {} : { errorCategory: input.category }),
    ...(input.error === undefined ? {} : { error: input.error }),
  };
}

function createManifest(input: {
  caseId: string;
  description: string;
  route: string;
  expectedSourcePaths: readonly string[];
  sources: readonly InvestigatorSourceFile[];
  browserEvidence?: InvestigatorBrowserEvidence;
  investigatorPromptSha256: string | null;
  verifierPromptSha256: string | null;
  investigatorDiagnosis?: Diagnosis;
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
      sha256: input.investigatorPromptSha256,
    },
    verifier:
      input.investigatorDiagnosis === undefined
        ? null
        : {
            promptVersion: VERIFIER_PROMPT_VERSION,
            promptSha256: input.verifierPromptSha256,
            investigatorDiagnosisSha256: hashVerifierValue(
              JSON.stringify(input.investigatorDiagnosis),
            ),
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
    throw new Error(`Unknown solution case ID: ${options.caseId}`);
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
  let investigatorPromptSha256: string | null = null;
  let verifierPromptSha256: string | null = null;
  let investigatorDiagnosis: Diagnosis | undefined;
  let verification: Verification | undefined;
  let investigatorResponse: ModelProviderResponse | undefined;
  let verifierResponse: ModelProviderResponse | undefined;
  let investigatorStartedAt: Date | undefined;
  let verifierStartedAt: Date | undefined;
  let investigatorAttemptCount = 0;
  let verifierAttemptCount = 0;
  let failureStage: Agent = "investigator";
  const agentRuns: AgentRunMetadata[] = [];
  const startedMetadata = createRunMetadata({
    approach: "solution",
    caseId: benchmarkCase.id,
    model: options.provider.model,
    provider: options.provider.kind,
    promptVersion: `${INVESTIGATOR_PROMPT_VERSION}+${VERIFIER_PROMPT_VERSION}`,
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
    const investigatorTemplate = await loadInvestigatorPromptTemplate(root);
    const investigatorPrompt = buildInvestigatorPrompt({
      template: investigatorTemplate,
      benchmarkCase,
      sources,
      browserEvidence,
    });
    investigatorPromptSha256 = hashInvestigatorValue(investigatorPrompt);
    trajectory.add(
      "decision-summary",
      "Validated the bounded evidence and prepared one Investigator request.",
      {
        promptSha256: investigatorPromptSha256,
        evidenceSchemaVersion: browserEvidence.schemaVersion,
        evidenceCategories: [...availableEvidenceSources],
      },
    );
    trajectory.add("tool-call", "Request one structured diagnosis.", {
      tool: "model_provider.generate",
      responseFormat: "diagnosis",
      provider: options.provider.kind,
      model: options.provider.model,
    });
    investigatorStartedAt = new Date();
    investigatorAttemptCount = 1;
    investigatorResponse = await options.provider.generate({
      caseId: benchmarkCase.id,
      prompt: investigatorPrompt,
      responseFormat: "diagnosis",
    });
    trajectory.add("tool-result", "Received the Investigator response.", {
      tool: "model_provider.generate",
      responseId: investigatorResponse.responseId ?? null,
      usage: investigatorResponse.usage ?? null,
    });
    investigatorDiagnosis = parseInvestigatorDiagnosis({
      text: investigatorResponse.text,
      expectedCaseId: benchmarkCase.id,
      allowedSourcePaths: benchmarkCase.sourceFiles,
      availableEvidenceSources,
    });
    agentRuns.push(
      completeAgentRun({
        agent: "investigator",
        promptVersion: INVESTIGATOR_PROMPT_VERSION,
        startedAt: investigatorStartedAt,
        status: "succeeded",
        attemptCount: investigatorAttemptCount,
        response: investigatorResponse,
      }),
    );
    trajectory.add(
      "decision-summary",
      "The Investigator diagnosis passed schema and grounding validation.",
      {
        verdict: investigatorDiagnosis.verdict,
        confidence: investigatorDiagnosis.confidence,
      },
    );

    failureStage = "verifier";
    const verifierTemplate = await loadVerifierPromptTemplate(root);
    const verifierPrompt = buildVerifierPrompt({
      template: verifierTemplate,
      benchmarkCase,
      sources,
      browserEvidence,
      investigatorDiagnosis,
    });
    verifierPromptSha256 = hashVerifierValue(verifierPrompt);
    trajectory.addFor(
      "verifier",
      "instruction",
      "Use the independent skeptical Verifier protocol.",
      {
        promptVersion: VERIFIER_PROMPT_VERSION,
        promptSha256: verifierPromptSha256,
      },
    );
    trajectory.addFor(
      "verifier",
      "input",
      "Received the validated Investigator handoff and bounded evidence.",
      {
        investigatorDiagnosisSha256: hashVerifierValue(
          JSON.stringify(investigatorDiagnosis),
        ),
        browserEvidenceSha256: hashVerifierValue(
          JSON.stringify(browserEvidence),
        ),
        allowedSourcePaths: benchmarkCase.sourceFiles,
        evidenceCategories: [...availableEvidenceSources],
      },
    );
    trajectory.addFor(
      "verifier",
      "tool-call",
      "Request one structured skeptical verification.",
      {
        tool: "model_provider.generate",
        responseFormat: "verification",
        provider: options.provider.kind,
        model: options.provider.model,
      },
    );
    verifierStartedAt = new Date();
    verifierAttemptCount = 1;
    verifierResponse = await options.provider.generate({
      caseId: benchmarkCase.id,
      prompt: verifierPrompt,
      responseFormat: "verification",
    });
    trajectory.addFor(
      "verifier",
      "tool-result",
      "Received the Verifier response.",
      {
        tool: "model_provider.generate",
        responseId: verifierResponse.responseId ?? null,
        usage: verifierResponse.usage ?? null,
      },
    );
    verification = parseVerifierOutput({
      text: verifierResponse.text,
      expectedCaseId: benchmarkCase.id,
      allowedSourcePaths: benchmarkCase.sourceFiles,
      availableEvidenceSources,
    });
    agentRuns.push(
      completeAgentRun({
        agent: "verifier",
        promptVersion: VERIFIER_PROMPT_VERSION,
        startedAt: verifierStartedAt,
        status: "succeeded",
        attemptCount: verifierAttemptCount,
        response: verifierResponse,
      }),
    );
    const finalDiagnosis = resolveVerifiedDiagnosis(
      investigatorDiagnosis,
      verification,
    );
    trajectory.addFor(
      "verifier",
      "decision-summary",
      "The Verifier output passed schema and grounding validation.",
      {
        decision: verification.decision,
        issues: verification.issues,
        verificationSummary: verification.verificationSummary,
        finalVerdict: finalDiagnosis.verdict,
      },
    );

    const attemptCount = investigatorAttemptCount + verifierAttemptCount;
    const usage = addUsage([investigatorResponse, verifierResponse]);
    const metadata = completeRunMetadata(startedMetadata, "succeeded", {
      attemptCount,
      agentRuns,
      ...(usage === undefined ? {} : { usage }),
    });
    const manifest = createManifest({
      caseId: benchmarkCase.id,
      description: benchmarkCase.description,
      route: benchmarkCase.route,
      expectedSourcePaths: benchmarkCase.sourceFiles,
      sources,
      browserEvidence,
      investigatorPromptSha256,
      verifierPromptSha256,
      investigatorDiagnosis,
    });
    const outputDirectory = await persistInvestigatorSuccess({
      resultsRoot: options.resultsRoot,
      investigatorDiagnosis,
      verification,
      finalDiagnosis,
      metadata,
      manifest,
      browserEvidence,
    });
    trajectory.addFor(
      "verifier",
      "final-result",
      "Saved the final verified solution result.",
      {
        status: "succeeded",
        decision: verification.decision,
        result: finalDiagnosis,
      },
    );
    const trajectoryPath = await trajectory.persist(
      options.trajectoriesRoot,
      metadata.runId,
    );
    return {
      caseId: benchmarkCase.id,
      status: "succeeded",
      attemptCount,
      investigatorAttemptCount,
      verifierAttemptCount,
      outputDirectory,
      trajectoryPath,
      browserEvidence,
      verificationDecision: verification.decision,
      finalDiagnosis,
    };
  } catch (error) {
    const category = classifyError(error);
    const message = sanitizeInvestigatorError(
      errorMessage(error),
      options.sensitiveValues,
    );
    if (
      failureStage === "investigator" &&
      investigatorStartedAt !== undefined &&
      !agentRuns.some(({ agent }) => agent === "investigator")
    ) {
      agentRuns.push(
        completeAgentRun({
          agent: "investigator",
          promptVersion: INVESTIGATOR_PROMPT_VERSION,
          startedAt: investigatorStartedAt,
          status: "failed",
          attemptCount: investigatorAttemptCount,
          ...(investigatorResponse === undefined
            ? {}
            : { response: investigatorResponse }),
          category,
          error: message,
        }),
      );
    }
    if (
      failureStage === "verifier" &&
      verifierStartedAt !== undefined &&
      !agentRuns.some(({ agent }) => agent === "verifier")
    ) {
      agentRuns.push(
        completeAgentRun({
          agent: "verifier",
          promptVersion: VERIFIER_PROMPT_VERSION,
          startedAt: verifierStartedAt,
          status: "failed",
          attemptCount: verifierAttemptCount,
          ...(verifierResponse === undefined
            ? {}
            : { response: verifierResponse }),
          category,
          error: message,
        }),
      );
    }

    const attemptCount = investigatorAttemptCount + verifierAttemptCount;
    const failure = investigatorFailureSchema.parse({
      schemaVersion: 1,
      caseId: benchmarkCase.id,
      status: "failed",
      category,
      message,
      attemptCount,
      stage: failureStage,
    });
    const usage = addUsage([investigatorResponse, verifierResponse]);
    const metadata = completeRunMetadata(startedMetadata, "failed", {
      attemptCount,
      error: message,
      errorCategory: category,
      agentRuns,
      ...(usage === undefined ? {} : { usage }),
    });
    const manifest = createManifest({
      caseId: benchmarkCase.id,
      description: benchmarkCase.description,
      route: benchmarkCase.route,
      expectedSourcePaths: benchmarkCase.sourceFiles,
      sources,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
      investigatorPromptSha256,
      verifierPromptSha256,
      ...(investigatorDiagnosis === undefined ? {} : { investigatorDiagnosis }),
    });
    const outputDirectory = await persistInvestigatorFailure({
      resultsRoot: options.resultsRoot,
      failure,
      metadata,
      manifest,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
      ...(investigatorDiagnosis === undefined ? {} : { investigatorDiagnosis }),
      ...(verification === undefined ? {} : { verification }),
    });
    trajectory.addFor(
      failureStage,
      "final-result",
      "Saved the failed integrated solution run.",
      {
        status: "failed",
        stage: failureStage,
        category,
        message,
        attemptCount,
      },
    );
    const trajectoryPath = await trajectory.persist(
      options.trajectoriesRoot,
      metadata.runId,
    );
    return {
      caseId: benchmarkCase.id,
      status: "failed",
      attemptCount,
      investigatorAttemptCount,
      verifierAttemptCount,
      outputDirectory,
      trajectoryPath,
      ...(browserEvidence === undefined ? {} : { browserEvidence }),
      errorCategory: category,
    };
  }
}
