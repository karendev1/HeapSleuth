import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveExistingInvestigatorArtifacts } from "../src/investigator/artifacts.js";
import {
  completeRunMetadata,
  createRunMetadata,
} from "../src/telemetry/run-metadata.js";

describe("Investigator artifact archiving", () => {
  let resultsRoot: string;

  beforeEach(async () => {
    resultsRoot = await mkdtemp(
      path.join(tmpdir(), "heapsleuth-investigator-artifacts-"),
    );
  });

  afterEach(async () => {
    await rm(resultsRoot, { recursive: true, force: true });
  });

  it("preserves a previous failed run before active artifacts are replaced", async () => {
    const caseDirectory = path.join(resultsRoot, "solution", "event-listener");
    await mkdir(caseDirectory, { recursive: true });
    const metadata = completeRunMetadata(
      createRunMetadata({
        approach: "solution",
        caseId: "event-listener",
        attemptCount: 1,
      }),
      "failed",
      { attemptCount: 1, error: "Quota failure", errorCategory: "provider" },
    );
    await writeFile(
      path.join(caseDirectory, "run-metadata.json"),
      `${JSON.stringify(metadata)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(caseDirectory, "failure.json"),
      '{"status":"failed"}\n',
      "utf8",
    );

    const archiveDirectory = await archiveExistingInvestigatorArtifacts(
      resultsRoot,
      "event-listener",
    );

    expect(archiveDirectory).toBe(
      path.join(
        resultsRoot,
        "solution",
        "attempts",
        "event-listener",
        metadata.runId,
      ),
    );
    await expect(
      readFile(path.join(archiveDirectory!, "failure.json"), "utf8"),
    ).resolves.toContain("failed");
  });

  it("does nothing when no previous active run exists", async () => {
    await expect(
      archiveExistingInvestigatorArtifacts(resultsRoot, "healthy-control"),
    ).resolves.toBeUndefined();
  });
});
