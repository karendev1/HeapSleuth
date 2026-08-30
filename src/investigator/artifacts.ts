import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ZodType } from "zod";

import { PersistenceError } from "../baseline/artifacts.js";
import { diagnosisSchema, type Diagnosis } from "../schemas/diagnosis.js";
import {
  investigatorBrowserEvidenceSchema,
  investigatorFailureSchema,
  investigatorInputManifestSchema,
  type InvestigatorBrowserEvidence,
  type InvestigatorFailure,
  type InvestigatorInputManifest,
} from "../schemas/investigator.js";
import {
  runMetadataSchema,
  type RunMetadata,
} from "../schemas/run-metadata.js";
import {
  verificationSchema,
  type Verification,
} from "../schemas/verification.js";

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
  const directory = path.join(resultsRoot, "solution", caseId);
  await mkdir(directory, { recursive: true });
  return directory;
}

const investigatorArtifactNames = [
  "browser-evidence.json",
  "failure.json",
  "input-manifest.json",
  "investigator-result.json",
  "metrics.json",
  "report.md",
  "result.json",
  "run-metadata.json",
  "verification.json",
] as const;

export async function archiveExistingInvestigatorArtifacts(
  resultsRoot: string,
  caseId: string,
): Promise<string | undefined> {
  const caseDirectory = path.join(resultsRoot, "solution", caseId);
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
      `Could not validate existing Investigator artifacts before archiving: ${message}`,
    );
  }
  if (metadata.caseId !== caseId || metadata.approach !== "solution") {
    throw new PersistenceError(
      "Existing Investigator metadata does not match the requested solution case.",
    );
  }

  const archiveDirectory = path.join(
    resultsRoot,
    "solution",
    "attempts",
    caseId,
    metadata.runId,
  );
  await mkdir(archiveDirectory, { recursive: true });
  for (const artifactName of investigatorArtifactNames) {
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
        `Could not archive existing ${artifactName}: ${message}`,
      );
    }
  }
  return archiveDirectory;
}

async function persistShared(input: {
  directory: string;
  metadata: RunMetadata;
  manifest: InvestigatorInputManifest;
  browserEvidence?: InvestigatorBrowserEvidence;
}): Promise<void> {
  await writeAndValidate(
    path.join(input.directory, "input-manifest.json"),
    input.manifest,
    investigatorInputManifestSchema,
  );
  await writeAndValidate(
    path.join(input.directory, "run-metadata.json"),
    input.metadata,
    runMetadataSchema,
  );
  if (input.browserEvidence === undefined) {
    await rm(path.join(input.directory, "browser-evidence.json"), {
      force: true,
    });
  } else {
    await writeAndValidate(
      path.join(input.directory, "browser-evidence.json"),
      input.browserEvidence,
      investigatorBrowserEvidenceSchema,
    );
  }
}

export async function persistInvestigatorSuccess(input: {
  resultsRoot: string;
  investigatorDiagnosis: Diagnosis;
  verification: Verification;
  finalDiagnosis: Diagnosis;
  metadata: RunMetadata;
  manifest: InvestigatorInputManifest;
  browserEvidence: InvestigatorBrowserEvidence;
}): Promise<string> {
  const directory = await prepareCaseDirectory(
    input.resultsRoot,
    input.finalDiagnosis.caseId,
  );
  await rm(path.join(directory, "metrics.json"), { force: true });
  await rm(path.join(directory, "report.md"), { force: true });
  await rm(path.join(directory, "failure.json"), { force: true });
  await persistShared({
    directory,
    metadata: input.metadata,
    manifest: input.manifest,
    browserEvidence: input.browserEvidence,
  });
  await writeAndValidate(
    path.join(directory, "investigator-result.json"),
    input.investigatorDiagnosis,
    diagnosisSchema,
  );
  await writeAndValidate(
    path.join(directory, "verification.json"),
    input.verification,
    verificationSchema,
  );
  await writeAndValidate(
    path.join(directory, "result.json"),
    input.finalDiagnosis,
    diagnosisSchema,
  );
  return directory;
}

export async function persistInvestigatorFailure(input: {
  resultsRoot: string;
  failure: InvestigatorFailure;
  metadata: RunMetadata;
  manifest: InvestigatorInputManifest;
  browserEvidence?: InvestigatorBrowserEvidence;
  investigatorDiagnosis?: Diagnosis;
  verification?: Verification;
}): Promise<string> {
  const directory = await prepareCaseDirectory(
    input.resultsRoot,
    input.failure.caseId,
  );
  await rm(path.join(directory, "metrics.json"), { force: true });
  await rm(path.join(directory, "report.md"), { force: true });
  await rm(path.join(directory, "result.json"), { force: true });
  if (input.investigatorDiagnosis === undefined) {
    await rm(path.join(directory, "investigator-result.json"), { force: true });
  } else {
    await writeAndValidate(
      path.join(directory, "investigator-result.json"),
      input.investigatorDiagnosis,
      diagnosisSchema,
    );
  }
  if (input.verification === undefined) {
    await rm(path.join(directory, "verification.json"), { force: true });
  } else {
    await writeAndValidate(
      path.join(directory, "verification.json"),
      input.verification,
      verificationSchema,
    );
  }
  await persistShared({
    directory,
    metadata: input.metadata,
    manifest: input.manifest,
    ...(input.browserEvidence === undefined
      ? {}
      : { browserEvidence: input.browserEvidence }),
  });
  await writeAndValidate(
    path.join(directory, "failure.json"),
    input.failure,
    investigatorFailureSchema,
  );
  return directory;
}
