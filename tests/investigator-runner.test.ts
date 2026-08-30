import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runInvestigatorCase } from "../src/investigator/runner.js";
import type {
  ModelProvider,
  ModelProviderRequest,
} from "../src/model/model-provider.js";
import { diagnosisSchema } from "../src/schemas/diagnosis.js";
import {
  investigatorBrowserEvidenceSchema,
  investigatorFailureSchema,
  investigatorInputManifestSchema,
} from "../src/schemas/investigator.js";
import { runMetadataSchema } from "../src/schemas/run-metadata.js";
import { trajectoryEventSchema } from "../src/schemas/trajectory.js";
import { verificationSchema } from "../src/schemas/verification.js";
import { createInvestigatorEvidence } from "./investigator-test-fixture.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function validDiagnosis(
  rootCauseFile = "benchmark/src/cases/EventListenerCase.tsx",
) {
  return JSON.stringify({
    caseId: "event-listener",
    verdict: "leak",
    mechanism: "A window event listener retains its closure after unmount.",
    rootCause: { file: rootCauseFile, symbol: "EventListenerCase" },
    evidence: [
      { source: "runtime", claim: "Three resources remain after forced GC." },
      {
        source: "heap",
        claim: "The target listener count increased by three.",
      },
      { source: "source", claim: "The effect has no cleanup function." },
    ],
    confidence: 0.95,
    recommendedFix: "Return cleanup that removes the event listener.",
    limitations: ["This is a synthetic benchmark."],
  });
}

function acceptedVerification() {
  return JSON.stringify({
    decision: "accept",
    issues: [],
    revisedDiagnosis: null,
    verificationSummary:
      "The diagnosis is supported by current-run listener and source evidence.",
  });
}

class QueueFakeProvider implements ModelProvider {
  readonly kind = "test-provider";
  readonly model = "test-model";
  readonly settings = {
    temperature: null,
    maxOutputTokens: 1_200,
    store: false,
    toolsEnabled: false,
    seed: 0,
    thinkingLevel: "low" as const,
  };
  readonly requests: ModelProviderRequest[] = [];

  constructor(private readonly responseTexts: readonly string[]) {}

  generate(request: ModelProviderRequest) {
    this.requests.push(request);
    const responseText = this.responseTexts[this.requests.length - 1];
    if (responseText === undefined) {
      throw new Error("Unexpected extra model request.");
    }
    return Promise.resolve({
      text: responseText,
      responseId: `response-${this.requests.length}`,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

describe("Investigator runner", () => {
  let temporaryRoot: string;
  let resultsRoot: string;
  let trajectoriesRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(
      path.join(tmpdir(), "heapsleuth-investigator-test-"),
    );
    resultsRoot = path.join(temporaryRoot, "results");
    trajectoriesRoot = path.join(temporaryRoot, "trajectories");
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("runs one Investigator and one Verifier request and saves distinct validated artifacts", async () => {
    const provider = new QueueFakeProvider([
      validDiagnosis(),
      acceptedVerification(),
    ]);
    const execution = await runInvestigatorCase({
      caseId: "event-listener",
      provider,
      resultsRoot,
      trajectoriesRoot,
      headless: true,
      projectRoot: repositoryRoot,
      collectBrowserEvidence: async ({ benchmarkCase, observe }) => {
        observe?.({
          type: "tool-call",
          tool: "run_scenario",
          summary: "Run fixture scenario.",
        });
        observe?.({
          type: "tool-result",
          tool: "run_scenario",
          summary: "Fixture scenario completed.",
          data: { completedCycles: 3 },
        });
        return createInvestigatorEvidence(benchmarkCase.id, true);
      },
    });

    expect(execution.status).toBe("succeeded");
    expect(execution).toMatchObject({
      attemptCount: 2,
      investigatorAttemptCount: 1,
      verifierAttemptCount: 1,
      verificationDecision: "accept",
      finalDiagnosis: { verdict: "leak" },
    });
    expect(provider.requests).toHaveLength(2);
    expect(
      provider.requests.map(({ responseFormat }) => responseFormat),
    ).toEqual(["diagnosis", "verification"]);
    expect(provider.requests[0]?.prompt).toContain(
      "Validated browser evidence",
    );
    expect(provider.requests[0]?.prompt).toContain("EventListenerCase");
    expect(provider.requests[0]?.prompt).not.toContain("acceptedMechanisms");
    expect(provider.requests[1]?.prompt).toContain(
      "Validated Investigator diagnosis to challenge",
    );
    expect(provider.requests[1]?.prompt).not.toContain("acceptedMechanisms");

    const caseDirectory = path.join(resultsRoot, "solution", "event-listener");
    const investigatorDiagnosis = diagnosisSchema.parse(
      await readJson(path.join(caseDirectory, "investigator-result.json")),
    );
    const finalDiagnosis = diagnosisSchema.parse(
      await readJson(path.join(caseDirectory, "result.json")),
    );
    expect(finalDiagnosis).toEqual(investigatorDiagnosis);
    verificationSchema.parse(
      await readJson(path.join(caseDirectory, "verification.json")),
    );
    diagnosisSchema.parse(
      await readJson(path.join(caseDirectory, "result.json")),
    );
    investigatorBrowserEvidenceSchema.parse(
      await readJson(path.join(caseDirectory, "browser-evidence.json")),
    );
    investigatorInputManifestSchema.parse(
      await readJson(path.join(caseDirectory, "input-manifest.json")),
    );
    const metadata = runMetadataSchema.parse(
      await readJson(path.join(caseDirectory, "run-metadata.json")),
    );
    expect(metadata).toMatchObject({
      approach: "solution",
      status: "succeeded",
      attemptCount: 2,
      usage: { totalTokens: 300 },
    });
    expect(metadata.agentRuns).toMatchObject([
      { agent: "investigator", status: "succeeded", attemptCount: 1 },
      { agent: "verifier", status: "succeeded", attemptCount: 1 },
    ]);

    const trajectoryText = await readFile(execution.trajectoryPath, "utf8");
    const events = trajectoryText
      .trim()
      .split("\n")
      .map((line) => trajectoryEventSchema.parse(JSON.parse(line)));
    expect(events.some(({ type }) => type === "instruction")).toBe(true);
    expect(events.some(({ type }) => type === "tool-call")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      agent: "verifier",
      type: "final-result",
      data: { status: "succeeded" },
    });
    expect(new Set(events.map(({ agent }) => agent))).toEqual(
      new Set(["investigator", "verifier"]),
    );
    expect(trajectoryText).not.toContain("test-secret");
    expect(trajectoryText).not.toContain("acceptedMechanisms");
  });

  it("saves a schema failure without retrying or retaining a result", async () => {
    const provider = new QueueFakeProvider([
      validDiagnosis("dataset/ground-truth.json"),
    ]);
    const execution = await runInvestigatorCase({
      caseId: "event-listener",
      provider,
      resultsRoot,
      trajectoriesRoot,
      headless: true,
      projectRoot: repositoryRoot,
      collectBrowserEvidence: async ({ benchmarkCase }) =>
        createInvestigatorEvidence(benchmarkCase.id, true),
    });

    expect(execution).toMatchObject({
      status: "failed",
      attemptCount: 1,
      investigatorAttemptCount: 1,
      verifierAttemptCount: 0,
      errorCategory: "schema-validation",
    });
    expect(provider.requests).toHaveLength(1);
    const caseDirectory = path.join(resultsRoot, "solution", "event-listener");
    expect(
      investigatorFailureSchema.parse(
        await readJson(path.join(caseDirectory, "failure.json")),
      ),
    ).toMatchObject({ category: "schema-validation", attemptCount: 1 });
    await expect(
      readFile(path.join(caseDirectory, "result.json")),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(caseDirectory, "verification.json")),
    ).rejects.toThrow();
  });

  it("fails closed when the Verifier output is invalid and preserves only the Investigator handoff", async () => {
    const provider = new QueueFakeProvider([
      validDiagnosis(),
      JSON.stringify({
        decision: "accept",
        issues: ["An accept decision cannot report unresolved issues."],
        revisedDiagnosis: null,
        verificationSummary: "Invalid combination for a deliberate test.",
      }),
    ]);
    const execution = await runInvestigatorCase({
      caseId: "event-listener",
      provider,
      resultsRoot,
      trajectoriesRoot,
      headless: true,
      projectRoot: repositoryRoot,
      collectBrowserEvidence: async ({ benchmarkCase }) =>
        createInvestigatorEvidence(benchmarkCase.id, true),
    });

    expect(execution).toMatchObject({
      status: "failed",
      attemptCount: 2,
      investigatorAttemptCount: 1,
      verifierAttemptCount: 1,
      errorCategory: "schema-validation",
    });
    expect(provider.requests).toHaveLength(2);
    const caseDirectory = path.join(resultsRoot, "solution", "event-listener");
    diagnosisSchema.parse(
      await readJson(path.join(caseDirectory, "investigator-result.json")),
    );
    expect(
      investigatorFailureSchema.parse(
        await readJson(path.join(caseDirectory, "failure.json")),
      ),
    ).toMatchObject({ stage: "verifier", attemptCount: 2 });
    await expect(
      readFile(path.join(caseDirectory, "result.json")),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(caseDirectory, "verification.json")),
    ).rejects.toThrow();
  });
});
