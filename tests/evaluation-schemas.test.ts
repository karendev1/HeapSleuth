import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  evaluationCohortEntrySchema,
  evaluationCohortSchema,
} from "../src/schemas/evaluation.js";

function solutionEntry() {
  return {
    caseId: "event-listener",
    approach: "solution" as const,
    runId: randomUUID(),
    runStatus: "succeeded" as const,
    model: "gemini-3.6-flash",
    provider: "gemini-interactions",
    promptVersion: "investigator-v1+verifier-v1",
    requestSettings: {
      temperature: null,
      maxOutputTokens: 1_200,
      store: false,
      toolsEnabled: false,
      seed: 0,
      thinkingLevel: "low" as const,
    },
    attemptCount: 2,
    promptSha256: "a".repeat(64),
    selectionReason: "Select the active run.",
    artifacts: {
      metadata: "results/solution/event-listener/run-metadata.json",
      manifest: "results/solution/event-listener/input-manifest.json",
      result: "results/solution/event-listener/result.json",
      failure: null,
      browserEvidence: "results/solution/event-listener/browser-evidence.json",
      investigatorResult:
        "results/solution/event-listener/investigator-result.json",
      verification: "results/solution/event-listener/verification.json",
      trajectory: "trajectories/event-listener/run.jsonl",
    },
  };
}

describe("evaluation schemas", () => {
  it("requires verification and trajectory artifacts for a successful solution", () => {
    expect(() =>
      evaluationCohortEntrySchema.parse({
        ...solutionEntry(),
        artifacts: { ...solutionEntry().artifacts, verification: null },
      }),
    ).toThrow();

    const entries = Array.from({ length: 16 }, (_, index) => ({
      ...solutionEntry(),
      caseId: `case-${index}`,
      approach: index % 2 === 0 ? "baseline" : "solution",
    }));
    expect(() =>
      evaluationCohortSchema.parse({
        schemaVersion: 1,
        createdAt: "2026-08-29T12:00:00.000Z",
        frozenProtocol: {
          diagnosisProtocolCommit: "c5043e3",
          datasetSha256: "a".repeat(64),
          caseIds: Array.from({ length: 8 }, (_, index) => `case-${index}`),
          model: "gemini-3.6-flash",
          provider: "gemini-interactions",
          baselinePromptVersion: "baseline-v1",
          solutionPromptVersion: "investigator-v1+verifier-v1",
          selectionRule: "Select active runs.",
          scorer: "deterministic-ground-truth-v1",
        },
        entries,
      }),
    ).toThrow();
  });

  it("rejects absolute and traversing artifact paths", () => {
    for (const metadata of [
      "C:/secret.json",
      "../secret.json",
      "/secret.json",
    ]) {
      expect(() =>
        evaluationCohortEntrySchema.parse({
          ...solutionEntry(),
          artifacts: { ...solutionEntry().artifacts, metadata },
        }),
      ).toThrow();
    }
  });
});
