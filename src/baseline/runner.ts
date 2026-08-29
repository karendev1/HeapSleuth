import { fileURLToPath } from "node:url";

import { ZodError } from "zod";

import { loadBenchmarkCases } from "../dataset/load-cases.js";
import type {
  ModelProvider,
  ModelProviderResponse,
} from "../model/model-provider.js";
import { ProviderRequestError } from "../model/model-provider.js";
import {
  baselineFailureSchema,
  baselineInputManifestSchema,
  type BaselineInputManifest,
} from "../schemas/baseline.js";
import type { BenchmarkCase } from "../schemas/case.js";
import { diagnosisSchema, type Diagnosis } from "../schemas/diagnosis.js";
import type { RunMetadata } from "../schemas/run-metadata.js";
import {
  completeRunMetadata,
  createRunMetadata,
} from "../telemetry/run-metadata.js";
import {
  PersistenceError,
  persistBaselineFailure,
  persistBaselineSuccess,
} from "./artifacts.js";
import {
  BASELINE_PROMPT_VERSION,
  buildBaselinePrompt,
  hashPrompt,
  loadBaselinePromptTemplate,
} from "./prompt.js";
import {
  loadAllowedSourceFiles,
  SourceBoundaryError,
  type LoadedSourceFile,
} from "./source-loader.js";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

type FailureCategory = RunMetadata["errorCategory"] & string;

class BaselineOutputError extends Error {
  override readonly name = "BaselineOutputError";

  constructor(
    readonly category: "malformed-json" | "schema-validation",
    message: string,
  ) {
    super(message);
  }
}

export type BaselineCaseExecution = {
  caseId: string;
  status: "succeeded" | "failed";
  attemptCount: number;
  outputDirectory: string;
  errorCategory?: FailureCategory;
};

export type BaselineBatchExecution = {
  cases: BaselineCaseExecution[];
  successCount: number;
  failureCount: number;
  succeeded: boolean;
};

export type BaselineRunnerOptions = {
  provider: ModelProvider;
  resultsRoot: string;
  selectedCaseId?: string;
  projectRoot?: string;
  sensitiveValues?: readonly string[];
  interCaseDelayMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
};

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function sanitizeErrorMessage(
  message: string,
  sensitiveValues: readonly string[] = [],
): string {
  let sanitized = message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]");

  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      sanitized = sanitized.split(sensitiveValue).join("[REDACTED]");
    }
  }

  return sanitized.slice(0, 1_000) || "Baseline execution failed.";
}

function parseDiagnosis(text: string, expectedCaseId: string): Diagnosis {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BaselineOutputError(
      "malformed-json",
      "The model response was not valid JSON.",
    );
  }

  let diagnosis: Diagnosis;
  try {
    diagnosis = diagnosisSchema.parse(payload);
  } catch {
    throw new BaselineOutputError(
      "schema-validation",
      "The model response did not match the diagnosis schema.",
    );
  }

  if (diagnosis.caseId !== expectedCaseId) {
    throw new BaselineOutputError(
      "schema-validation",
      `The model returned case ID ${diagnosis.caseId} instead of ${expectedCaseId}.`,
    );
  }
  if (diagnosis.evidence.some(({ source }) => source !== "source")) {
    throw new BaselineOutputError(
      "schema-validation",
      "Static baseline evidence must cite supplied source code only.",
    );
  }

  return diagnosis;
}

function classifyError(error: unknown): FailureCategory {
  if (error instanceof SourceBoundaryError) return "source-boundary";
  if (error instanceof ProviderRequestError) return "provider";
  if (error instanceof BaselineOutputError) return error.category;
  if (error instanceof PersistenceError) return "persistence";
  if (error instanceof ZodError) return "schema-validation";
  return "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createManifest(
  benchmarkCase: BenchmarkCase,
  sources: readonly LoadedSourceFile[],
  promptSha256: string | null,
): BaselineInputManifest {
  const loadedByPath = new Map(sources.map((source) => [source.path, source]));
  return baselineInputManifestSchema.parse({
    schemaVersion: 1,
    caseId: benchmarkCase.id,
    approach: "baseline",
    description: benchmarkCase.description,
    sources: benchmarkCase.sourceFiles.map((sourcePath) => ({
      path: sourcePath,
      byteCount: loadedByPath.get(sourcePath)?.byteCount ?? null,
    })),
    prompt: {
      version: BASELINE_PROMPT_VERSION,
      sha256: promptSha256,
    },
  });
}

async function runCase(input: {
  benchmarkCase: BenchmarkCase;
  promptTemplate: string;
  options: BaselineRunnerOptions;
}): Promise<BaselineCaseExecution> {
  const caseId = input.benchmarkCase.id;
  const sourceRoot = input.options.projectRoot ?? projectRoot;
  let sources: LoadedSourceFile[] = [];
  let promptSha256: string | null = null;
  let attemptCount = 0;
  let providerResponse: ModelProviderResponse | undefined;
  const startedMetadata = createRunMetadata({
    approach: "baseline",
    caseId,
    model: input.options.provider.model,
    provider: input.options.provider.kind,
    promptVersion: BASELINE_PROMPT_VERSION,
    requestSettings: input.options.provider.settings,
    attemptCount: 0,
  });

  try {
    sources = await loadAllowedSourceFiles({
      projectRoot: sourceRoot,
      allowedPaths: input.benchmarkCase.sourceFiles,
    });
    const prompt = buildBaselinePrompt({
      template: input.promptTemplate,
      caseId,
      description: input.benchmarkCase.description,
      sources,
    });
    promptSha256 = hashPrompt(prompt);
    attemptCount = 1;
    providerResponse = await input.options.provider.generate({
      caseId,
      prompt,
    });
    const diagnosis = parseDiagnosis(providerResponse.text, caseId);
    const metadata = completeRunMetadata(startedMetadata, "succeeded", {
      attemptCount,
      ...(providerResponse.usage === undefined
        ? {}
        : { usage: providerResponse.usage }),
      ...(providerResponse.responseId === undefined
        ? {}
        : { providerResponseId: providerResponse.responseId }),
    });
    const outputDirectory = await persistBaselineSuccess({
      resultsRoot: input.options.resultsRoot,
      diagnosis,
      metadata,
      manifest: createManifest(input.benchmarkCase, sources, promptSha256),
    });

    return { caseId, status: "succeeded", attemptCount, outputDirectory };
  } catch (error) {
    const category = classifyError(error);
    const message = sanitizeErrorMessage(
      errorMessage(error),
      input.options.sensitiveValues,
    );
    const failure = baselineFailureSchema.parse({
      schemaVersion: 1,
      caseId,
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
    const outputDirectory = await persistBaselineFailure({
      resultsRoot: input.options.resultsRoot,
      failure,
      metadata,
      manifest: createManifest(input.benchmarkCase, sources, promptSha256),
    });

    return {
      caseId,
      status: "failed",
      attemptCount,
      outputDirectory,
      errorCategory: category,
    };
  }
}

export async function runBaselineBatch(
  options: BaselineRunnerOptions,
): Promise<BaselineBatchExecution> {
  const interCaseDelayMs = options.interCaseDelayMs ?? 0;
  if (!Number.isInteger(interCaseDelayMs) || interCaseDelayMs < 0) {
    throw new Error("interCaseDelayMs must be a nonnegative integer.");
  }
  const cases = await loadBenchmarkCases();
  const selectedCases =
    options.selectedCaseId === undefined
      ? cases
      : cases.filter(({ id }) => id === options.selectedCaseId);

  if (selectedCases.length === 0) {
    throw new Error(`Unknown baseline case ID: ${options.selectedCaseId}`);
  }

  const promptTemplate = await loadBaselinePromptTemplate(
    options.projectRoot ?? projectRoot,
  );
  const executions: BaselineCaseExecution[] = [];
  for (const benchmarkCase of selectedCases) {
    if (executions.length > 0 && interCaseDelayMs > 0) {
      await (options.delay ?? defaultDelay)(interCaseDelayMs);
    }
    executions.push(await runCase({ benchmarkCase, promptTemplate, options }));
  }

  const successCount = executions.filter(
    ({ status }) => status === "succeeded",
  ).length;
  const failureCount = executions.length - successCount;
  return {
    cases: executions,
    successCount,
    failureCount,
    succeeded: failureCount === 0,
  };
}
