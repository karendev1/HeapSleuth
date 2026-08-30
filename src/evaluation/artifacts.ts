import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ZodType } from "zod";

import { resolveVerifiedDiagnosis } from "../verifier/validation.js";
import { loadBenchmarkCases } from "../dataset/load-cases.js";
import {
  baselineFailureSchema,
  baselineInputManifestSchema,
} from "../schemas/baseline.js";
import { diagnosisSchema } from "../schemas/diagnosis.js";
import {
  evaluationCohortSchema,
  type EvaluationCohort,
  type EvaluationCohortEntry,
} from "../schemas/evaluation.js";
import {
  investigatorBrowserEvidenceSchema,
  investigatorFailureSchema,
  investigatorInputManifestSchema,
} from "../schemas/investigator.js";
import { runMetadataSchema } from "../schemas/run-metadata.js";
import { trajectoryEventSchema } from "../schemas/trajectory.js";
import { verificationSchema } from "../schemas/verification.js";
import type { LoadedEvaluationRun } from "./scoring.js";

export const FROZEN_DIAGNOSIS_PROTOCOL_COMMIT = "c5043e3";
export const FROZEN_MODEL = "gemini-3.6-flash";
export const FROZEN_PROVIDER = "gemini-interactions";
export const FROZEN_BASELINE_PROMPT_VERSION = "baseline-v1";
export const FROZEN_SOLUTION_PROMPT_VERSION = "investigator-v1+verifier-v1";
export const ACTIVE_RUN_SELECTION_RULE =
  "Select the active per-case run present when evaluation starts; never search archived attempts for a better result.";

const summaryArtifactNames = [
  "evaluation-cohort.json",
  "comparison.json",
  "comparison.md",
  "changelog-evidence.json",
] as const;

function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function parseFile<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  try {
    return schema.parse(await readJson(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid evaluation input ${filePath}: ${message}`);
  }
}

export async function writeValidatedJson<T>(input: {
  filePath: string;
  value: T;
  schema: ZodType<T>;
}): Promise<void> {
  await mkdir(path.dirname(input.filePath), { recursive: true });
  const validated = input.schema.parse(input.value);
  await writeFile(
    input.filePath,
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );
  input.schema.parse(await readJson(input.filePath));
}

export async function archiveExistingEvaluationSummary(
  resultsRoot: string,
  archiveId: string,
): Promise<string | undefined> {
  const summaryRoot = path.join(resultsRoot, "summary");
  const existing = [];
  for (const name of summaryArtifactNames) {
    if (await exists(path.join(summaryRoot, name))) existing.push(name);
  }
  if (existing.length === 0) return undefined;

  const archiveDirectory = path.join(summaryRoot, "attempts", archiveId);
  await mkdir(archiveDirectory, { recursive: true });
  for (const name of existing) {
    await rename(
      path.join(summaryRoot, name),
      path.join(archiveDirectory, name),
    );
  }
  return archiveDirectory;
}

function relativeArtifactPath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Evaluation artifact is outside the workspace: ${filePath}`,
    );
  }
  return slashPath(relative);
}

async function loadBaselineRun(input: {
  projectRoot: string;
  resultsRoot: string;
  caseId: string;
}): Promise<LoadedEvaluationRun> {
  const directory = path.join(input.resultsRoot, "baseline", input.caseId);
  const metadata = await parseFile(
    path.join(directory, "run-metadata.json"),
    runMetadataSchema,
  );
  const manifest = await parseFile(
    path.join(directory, "input-manifest.json"),
    baselineInputManifestSchema,
  );
  if (
    metadata.caseId !== input.caseId ||
    metadata.approach !== "baseline" ||
    manifest.caseId !== input.caseId
  ) {
    throw new Error(`Baseline artifacts do not match case ${input.caseId}.`);
  }
  const resultPath = path.join(directory, "result.json");
  const failurePath = path.join(directory, "failure.json");
  const diagnosis =
    metadata.status === "succeeded"
      ? await parseFile(resultPath, diagnosisSchema)
      : undefined;
  const failure =
    metadata.status === "failed"
      ? await parseFile(failurePath, baselineFailureSchema)
      : undefined;
  if (metadata.status === "running") {
    throw new Error(`Baseline run ${metadata.runId} is still running.`);
  }
  if (diagnosis !== undefined && diagnosis.caseId !== input.caseId) {
    throw new Error(`Baseline result does not match case ${input.caseId}.`);
  }
  const cohortEntry: EvaluationCohortEntry = {
    caseId: input.caseId,
    approach: "baseline",
    runId: metadata.runId,
    runStatus: metadata.status,
    model: metadata.model ?? "unrecorded",
    provider: metadata.provider ?? "unrecorded",
    promptVersion: metadata.promptVersion ?? "unrecorded",
    requestSettings: metadata.requestSettings ?? {
      temperature: null,
      maxOutputTokens: 1,
      store: false,
      toolsEnabled: false,
    },
    attemptCount: metadata.attemptCount ?? 0,
    promptSha256: manifest.prompt.sha256,
    selectionReason: ACTIVE_RUN_SELECTION_RULE,
    artifacts: {
      metadata: relativeArtifactPath(
        input.projectRoot,
        path.join(directory, "run-metadata.json"),
      ),
      manifest: relativeArtifactPath(
        input.projectRoot,
        path.join(directory, "input-manifest.json"),
      ),
      result:
        diagnosis === undefined
          ? null
          : relativeArtifactPath(input.projectRoot, resultPath),
      failure:
        failure === undefined
          ? null
          : relativeArtifactPath(input.projectRoot, failurePath),
      browserEvidence: null,
      investigatorResult: null,
      verification: null,
      trajectory: null,
    },
  };
  return {
    cohortEntry,
    metadata,
    ...(diagnosis === undefined ? {} : { diagnosis }),
    ...(failure === undefined ? {} : { failure }),
  };
}

async function loadTrajectory(filePath: string): Promise<void> {
  const lines = (await readFile(filePath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error(`Empty trajectory: ${filePath}`);
  const events = lines.map((line) =>
    trajectoryEventSchema.parse(JSON.parse(line)),
  );
  const agents = new Set(events.map(({ agent }) => agent));
  if (!agents.has("investigator") || !agents.has("verifier")) {
    throw new Error(
      `Successful solution trajectory lacks both agents: ${filePath}`,
    );
  }
}

async function loadSolutionRun(input: {
  projectRoot: string;
  resultsRoot: string;
  caseId: string;
}): Promise<LoadedEvaluationRun> {
  const directory = path.join(input.resultsRoot, "solution", input.caseId);
  const metadata = await parseFile(
    path.join(directory, "run-metadata.json"),
    runMetadataSchema,
  );
  const manifest = await parseFile(
    path.join(directory, "input-manifest.json"),
    investigatorInputManifestSchema,
  );
  if (
    metadata.caseId !== input.caseId ||
    metadata.approach !== "solution" ||
    manifest.caseId !== input.caseId
  ) {
    throw new Error(`Solution artifacts do not match case ${input.caseId}.`);
  }
  if (metadata.status === "running") {
    throw new Error(`Solution run ${metadata.runId} is still running.`);
  }

  const browserEvidencePath = path.join(directory, "browser-evidence.json");
  const browserEvidence = (await exists(browserEvidencePath))
    ? await parseFile(browserEvidencePath, investigatorBrowserEvidenceSchema)
    : undefined;
  let diagnosis;
  let failure;
  if (metadata.status === "succeeded") {
    const investigatorDiagnosis = await parseFile(
      path.join(directory, "investigator-result.json"),
      diagnosisSchema,
    );
    const verification = await parseFile(
      path.join(directory, "verification.json"),
      verificationSchema,
    );
    diagnosis = await parseFile(
      path.join(directory, "result.json"),
      diagnosisSchema,
    );
    const expected = resolveVerifiedDiagnosis(
      investigatorDiagnosis,
      verification,
    );
    if (JSON.stringify(expected) !== JSON.stringify(diagnosis)) {
      throw new Error(`Verified final result mismatch for ${input.caseId}.`);
    }
    if (
      metadata.attemptCount !== 2 ||
      metadata.agentRuns?.length !== 2 ||
      metadata.agentRuns.some(
        (agentRun) =>
          agentRun.status !== "succeeded" || agentRun.attemptCount !== 1,
      )
    ) {
      throw new Error(
        `Successful solution run is not a clean 1+1 run: ${input.caseId}.`,
      );
    }
  } else {
    failure = await parseFile(
      path.join(directory, "failure.json"),
      investigatorFailureSchema,
    );
  }
  if (diagnosis !== undefined && diagnosis.caseId !== input.caseId) {
    throw new Error(`Solution result does not match case ${input.caseId}.`);
  }
  if (
    browserEvidence !== undefined &&
    browserEvidence.caseId !== input.caseId
  ) {
    throw new Error(`Browser evidence does not match case ${input.caseId}.`);
  }

  const trajectoryRelative = slashPath(
    path.join("trajectories", input.caseId, `${metadata.runId}.jsonl`),
  );
  const trajectoryPath = path.join(input.projectRoot, trajectoryRelative);
  const hasTrajectory = await exists(trajectoryPath);
  if (metadata.status === "succeeded") {
    if (!hasTrajectory)
      throw new Error(`Missing trajectory for ${input.caseId}.`);
    await loadTrajectory(trajectoryPath);
  }

  const cohortEntry: EvaluationCohortEntry = {
    caseId: input.caseId,
    approach: "solution",
    runId: metadata.runId,
    runStatus: metadata.status,
    model: metadata.model ?? "unrecorded",
    provider: metadata.provider ?? "unrecorded",
    promptVersion: metadata.promptVersion ?? "unrecorded",
    requestSettings: metadata.requestSettings ?? {
      temperature: null,
      maxOutputTokens: 1,
      store: false,
      toolsEnabled: false,
    },
    attemptCount: metadata.attemptCount ?? 0,
    promptSha256: manifest.prompt.sha256,
    selectionReason: ACTIVE_RUN_SELECTION_RULE,
    artifacts: {
      metadata: relativeArtifactPath(
        input.projectRoot,
        path.join(directory, "run-metadata.json"),
      ),
      manifest: relativeArtifactPath(
        input.projectRoot,
        path.join(directory, "input-manifest.json"),
      ),
      result:
        diagnosis === undefined
          ? null
          : relativeArtifactPath(
              input.projectRoot,
              path.join(directory, "result.json"),
            ),
      failure:
        failure === undefined
          ? null
          : relativeArtifactPath(
              input.projectRoot,
              path.join(directory, "failure.json"),
            ),
      browserEvidence:
        browserEvidence === undefined
          ? null
          : relativeArtifactPath(input.projectRoot, browserEvidencePath),
      investigatorResult:
        metadata.status === "succeeded"
          ? relativeArtifactPath(
              input.projectRoot,
              path.join(directory, "investigator-result.json"),
            )
          : null,
      verification:
        metadata.status === "succeeded"
          ? relativeArtifactPath(
              input.projectRoot,
              path.join(directory, "verification.json"),
            )
          : null,
      trajectory: hasTrajectory ? trajectoryRelative : null,
    },
  };
  return {
    cohortEntry,
    metadata,
    ...(diagnosis === undefined ? {} : { diagnosis }),
    ...(failure === undefined ? {} : { failure }),
    ...(browserEvidence === undefined ? {} : { browserEvidence }),
  };
}

function assertFrozenEntry(entry: EvaluationCohortEntry): void {
  if (
    entry.model !== FROZEN_MODEL ||
    entry.provider !== FROZEN_PROVIDER ||
    (entry.approach === "baseline"
      ? entry.promptVersion !== FROZEN_BASELINE_PROMPT_VERSION
      : entry.promptVersion !== FROZEN_SOLUTION_PROMPT_VERSION)
  ) {
    throw new Error(
      `Active run ${entry.runId} for ${entry.approach}/${entry.caseId} does not match the frozen protocol.`,
    );
  }
  if (
    entry.requestSettings.maxOutputTokens !== 1_200 ||
    entry.requestSettings.store ||
    entry.requestSettings.toolsEnabled ||
    entry.requestSettings.seed !== 0 ||
    entry.requestSettings.thinkingLevel !== "low"
  ) {
    throw new Error(
      `Active run ${entry.runId} has non-frozen request settings.`,
    );
  }
}

export async function createActiveEvaluationCohort(input: {
  projectRoot: string;
  resultsRoot: string;
  createdAt?: Date;
}): Promise<{ cohort: EvaluationCohort; runs: LoadedEvaluationRun[] }> {
  const cases = await loadBenchmarkCases();
  const runs: LoadedEvaluationRun[] = [];
  for (const benchmarkCase of cases) {
    runs.push(
      await loadBaselineRun({
        projectRoot: input.projectRoot,
        resultsRoot: input.resultsRoot,
        caseId: benchmarkCase.id,
      }),
    );
    runs.push(
      await loadSolutionRun({
        projectRoot: input.projectRoot,
        resultsRoot: input.resultsRoot,
        caseId: benchmarkCase.id,
      }),
    );
  }
  for (const run of runs) assertFrozenEntry(run.cohortEntry);

  const datasetText = await readFile(
    path.join(input.projectRoot, "dataset", "cases.json"),
    "utf8",
  );
  const cohort = evaluationCohortSchema.parse({
    schemaVersion: 1,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    frozenProtocol: {
      diagnosisProtocolCommit: FROZEN_DIAGNOSIS_PROTOCOL_COMMIT,
      datasetSha256: createHash("sha256").update(datasetText).digest("hex"),
      caseIds: cases.map(({ id }) => id),
      model: FROZEN_MODEL,
      provider: FROZEN_PROVIDER,
      baselinePromptVersion: FROZEN_BASELINE_PROMPT_VERSION,
      solutionPromptVersion: FROZEN_SOLUTION_PROMPT_VERSION,
      selectionRule: ACTIVE_RUN_SELECTION_RULE,
      scorer: "deterministic-ground-truth-v1",
    },
    entries: runs.map(({ cohortEntry }) => cohortEntry),
  });
  return { cohort, runs };
}
