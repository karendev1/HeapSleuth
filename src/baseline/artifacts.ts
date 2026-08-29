import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
