import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ZodType } from "zod";

import {
  baselineFailureSchema,
  baselineInputManifestSchema,
  type BaselineFailure,
  type BaselineInputManifest,
} from "../schemas/baseline.js";
import { diagnosisSchema, type Diagnosis } from "../schemas/diagnosis.js";
import {
  runMetadataSchema,
  type RunMetadata,
} from "../schemas/run-metadata.js";

export class PersistenceError extends Error {
  override readonly name = "PersistenceError";
}

async function writeAndValidate<T>(
  filePath: string,
  value: T,
  schema: ZodType<T>,
): Promise<void> {
  try {
    const validated = schema.parse(value);
    await writeFile(
      filePath,
      `${JSON.stringify(validated, null, 2)}\n`,
      "utf8",
    );
    const savedPayload: unknown = JSON.parse(await readFile(filePath, "utf8"));
    schema.parse(savedPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PersistenceError(
      `Could not persist and validate ${path.basename(filePath)}: ${message}`,
    );
  }
}

async function prepareCaseDirectory(
  resultsRoot: string,
  caseId: string,
): Promise<string> {
  const caseDirectory = path.join(resultsRoot, "baseline", caseId);
  await mkdir(caseDirectory, { recursive: true });
  return caseDirectory;
}

const baselineArtifactNames = [
  "failure.json",
  "input-manifest.json",
  "metrics.json",
  "report.md",
  "result.json",
  "run-metadata.json",
] as const;

export async function archiveExistingBaselineArtifacts(
  resultsRoot: string,
  caseId: string,
): Promise<string | undefined> {
  const caseDirectory = path.join(resultsRoot, "baseline", caseId);
  let metadata: RunMetadata;
  try {
    metadata = runMetadataSchema.parse(
      JSON.parse(
        await readFile(path.join(caseDirectory, "run-metadata.json"), "utf8"),
      ),
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new PersistenceError(
      `Could not validate existing baseline artifacts before archiving: ${message}`,
    );
  }
  if (metadata.caseId !== caseId || metadata.approach !== "baseline") {
    throw new PersistenceError(
      "Existing baseline metadata does not match the requested case.",
    );
  }
  const archiveDirectory = path.join(
    resultsRoot,
    "baseline",
    "attempts",
    caseId,
    metadata.runId,
  );
  await mkdir(archiveDirectory, { recursive: true });
  for (const artifactName of baselineArtifactNames) {
    try {
      await copyFile(
        path.join(caseDirectory, artifactName),
        path.join(archiveDirectory, artifactName),
      );
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new PersistenceError(
        `Could not archive existing baseline ${artifactName}: ${message}`,
      );
    }
  }
  return archiveDirectory;
}

async function removeStaleEvaluationArtifacts(
  caseDirectory: string,
): Promise<void> {
  await rm(path.join(caseDirectory, "metrics.json"), { force: true });
  await rm(path.join(caseDirectory, "report.md"), { force: true });
}

export async function persistBaselineSuccess(input: {
  resultsRoot: string;
  diagnosis: Diagnosis;
  metadata: RunMetadata;
  manifest: BaselineInputManifest;
}): Promise<string> {
  const caseDirectory = await prepareCaseDirectory(
    input.resultsRoot,
    input.diagnosis.caseId,
  );
  await removeStaleEvaluationArtifacts(caseDirectory);
  await rm(path.join(caseDirectory, "failure.json"), { force: true });
  await writeAndValidate(
    path.join(caseDirectory, "input-manifest.json"),
    input.manifest,
    baselineInputManifestSchema,
  );
  await writeAndValidate(
    path.join(caseDirectory, "result.json"),
    input.diagnosis,
    diagnosisSchema,
  );
  await writeAndValidate(
    path.join(caseDirectory, "run-metadata.json"),
    input.metadata,
    runMetadataSchema,
  );
  return caseDirectory;
}

export async function persistBaselineFailure(input: {
  resultsRoot: string;
  failure: BaselineFailure;
  metadata: RunMetadata;
  manifest: BaselineInputManifest;
}): Promise<string> {
  const caseDirectory = await prepareCaseDirectory(
    input.resultsRoot,
    input.failure.caseId,
  );
  await removeStaleEvaluationArtifacts(caseDirectory);
  await rm(path.join(caseDirectory, "result.json"), { force: true });
  await writeAndValidate(
    path.join(caseDirectory, "input-manifest.json"),
    input.manifest,
    baselineInputManifestSchema,
  );
  await writeAndValidate(
    path.join(caseDirectory, "failure.json"),
    input.failure,
    baselineFailureSchema,
  );
  await writeAndValidate(
    path.join(caseDirectory, "run-metadata.json"),
    input.metadata,
    runMetadataSchema,
  );
  return caseDirectory;
}
