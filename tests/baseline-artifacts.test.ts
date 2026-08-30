import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveExistingBaselineArtifacts } from "../src/baseline/artifacts.js";
import {
  completeRunMetadata,
  createRunMetadata,
} from "../src/telemetry/run-metadata.js";

describe("baseline artifact archiving", () => {
  let resultsRoot: string;

  beforeEach(async () => {
    resultsRoot = await mkdtemp(
      path.join(tmpdir(), "heapsleuth-baseline-archive-"),
    );
  });

  afterEach(async () => {
    await rm(resultsRoot, { recursive: true, force: true });
  });

  it("preserves raw and generated evaluation artifacts before replacement", async () => {
    const caseDirectory = path.join(resultsRoot, "baseline", "event-listener");
    await mkdir(caseDirectory, { recursive: true });
    const metadata = completeRunMetadata(
      createRunMetadata({
        approach: "baseline",
        caseId: "event-listener",
        attemptCount: 1,
      }),
      "succeeded",
      { attemptCount: 1 },
    );
    await writeFile(
      path.join(caseDirectory, "run-metadata.json"),
      `${JSON.stringify(metadata)}\n`,
      "utf8",
    );
    await writeFile(path.join(caseDirectory, "result.json"), "{}\n", "utf8");
    await writeFile(path.join(caseDirectory, "metrics.json"), "{}\n", "utf8");
    await writeFile(path.join(caseDirectory, "report.md"), "report\n", "utf8");

    const archiveDirectory = await archiveExistingBaselineArtifacts(
      resultsRoot,
      "event-listener",
    );

    expect(archiveDirectory).toBe(
      path.join(
        resultsRoot,
        "baseline",
        "attempts",
        "event-listener",
        metadata.runId,
      ),
    );
    await expect(
      readFile(path.join(archiveDirectory!, "metrics.json"), "utf8"),
    ).resolves.toBe("{}\n");
    await expect(
      readFile(path.join(archiveDirectory!, "report.md"), "utf8"),
    ).resolves.toBe("report\n");
  });
});
