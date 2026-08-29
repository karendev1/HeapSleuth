import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  runBaselineBatch,
  sanitizeErrorMessage,
} from "../src/baseline/runner.js";
import type {
  ModelProvider,
  ModelProviderRequest,
  ModelProviderResponse,
} from "../src/model/model-provider.js";
import { ProviderRequestError } from "../src/model/model-provider.js";
import { baselineFailureSchema } from "../src/schemas/baseline.js";
import { diagnosisSchema } from "../src/schemas/diagnosis.js";
import { runMetadataSchema } from "../src/schemas/run-metadata.js";

const expectedCaseIds = [
  "event-listener",
  "interval",
  "resize-observer",
  "detached-dom",
  "global-cache",
  "closure-registry",
  "event-bus",
  "healthy-control",
];

function validDiagnosis(caseId: string) {
  return JSON.stringify({
    caseId,
    verdict: "inconclusive",
    mechanism: null,
    rootCause: null,
    evidence: [
      {
        source: "source",
        claim: "The supplied source requires static review.",
      },
    ],
    confidence: 0.5,
    recommendedFix: null,
    limitations: ["No runtime evidence is available."],
  });
}

class FakeProvider implements ModelProvider {
  readonly kind = "test-fixture-provider";
  readonly model = "test-model";
  readonly settings = {
    temperature: 0,
    maxOutputTokens: 1_200,
    store: false,
    toolsEnabled: false,
  };
  readonly requests: ModelProviderRequest[] = [];

  constructor(
    private readonly respond: (
      request: ModelProviderRequest,
    ) => ModelProviderResponse | Promise<ModelProviderResponse>,
  ) {}

  async generate(
    request: ModelProviderRequest,
  ): Promise<ModelProviderResponse> {
    this.requests.push(request);
    return this.respond(request);
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

describe("static baseline runner", () => {
  let resultsRoot: string;

  beforeEach(async () => {
    resultsRoot = await mkdtemp(
      path.join(tmpdir(), "heapsleuth-baseline-test-"),
    );
  });

  afterEach(async () => {
    await rm(resultsRoot, { recursive: true, force: true });
  });

  it("runs all eight cases once in dataset order and validates saved results", async () => {
    const provider = new FakeProvider(({ caseId }) => ({
      text: validDiagnosis(caseId),
      responseId: `response-${caseId}`,
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    }));

    const execution = await runBaselineBatch({ provider, resultsRoot });

    expect(execution.succeeded).toBe(true);
    expect(execution.successCount).toBe(8);
    expect(execution.failureCount).toBe(0);
    expect(provider.requests.map(({ caseId }) => caseId)).toEqual(
      expectedCaseIds,
    );
    expect(new Set(provider.requests.map(({ caseId }) => caseId)).size).toBe(8);

    for (const caseId of expectedCaseIds) {
      const caseDirectory = path.join(resultsRoot, "baseline", caseId);
      const savedDiagnosis = await readJson(
        path.join(caseDirectory, "result.json"),
      );
      expect(() => diagnosisSchema.parse(savedDiagnosis)).not.toThrow();
      const metadata = runMetadataSchema.parse(
        await readJson(path.join(caseDirectory, "run-metadata.json")),
      );
      expect(metadata).toMatchObject({
        caseId,
        status: "succeeded",
        attemptCount: 1,
        provider: "test-fixture-provider",
        model: "test-model",
        usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
      });
      const manifestText = await readFile(
        path.join(caseDirectory, "input-manifest.json"),
        "utf8",
      );
      expect(manifestText).not.toContain("GEMINI_API_KEY");
      expect(manifestText).not.toContain("ground-truth");
      expect(manifestText).not.toContain("acceptedMechanisms");
    }
  });

  it("paces a full batch between cases without adding model attempts", async () => {
    const provider = new FakeProvider(({ caseId }) => ({
      text: validDiagnosis(caseId),
    }));
    const delays: number[] = [];

    const execution = await runBaselineBatch({
      provider,
      resultsRoot,
      interCaseDelayMs: 15_000,
      delay: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });

    expect(execution.succeeded).toBe(true);
    expect(provider.requests).toHaveLength(8);
    expect(delays).toEqual(Array.from({ length: 7 }, () => 15_000));
  });

  it("supports one selected case and rejects an unknown ID before a request", async () => {
    const provider = new FakeProvider(({ caseId }) => ({
      text: validDiagnosis(caseId),
    }));

    const selected = await runBaselineBatch({
      provider,
      resultsRoot,
      selectedCaseId: "healthy-control",
    });

    expect(selected.cases.map(({ caseId }) => caseId)).toEqual([
      "healthy-control",
    ]);
    expect(provider.requests).toHaveLength(1);
    await expect(
      runBaselineBatch({
        provider,
        resultsRoot,
        selectedCaseId: "unknown-case",
      }),
    ).rejects.toThrow("Unknown baseline case ID");
    expect(provider.requests).toHaveLength(1);
  });

  it("records malformed JSON and continues the remaining batch", async () => {
    const provider = new FakeProvider(({ caseId }) => ({
      text: caseId === "event-listener" ? "not-json" : validDiagnosis(caseId),
    }));

    const execution = await runBaselineBatch({ provider, resultsRoot });

    expect(execution.succeeded).toBe(false);
    expect(execution.successCount).toBe(7);
    expect(execution.failureCount).toBe(1);
    expect(provider.requests).toHaveLength(8);
    const failure = baselineFailureSchema.parse(
      await readJson(
        path.join(resultsRoot, "baseline", "event-listener", "failure.json"),
      ),
    );
    expect(failure).toMatchObject({
      category: "malformed-json",
      attemptCount: 1,
    });
  });

  it("records provider and diagnosis-schema failures without retrying", async () => {
    const provider = new FakeProvider(({ caseId }) => {
      if (caseId === "event-listener") {
        throw new ProviderRequestError("Provider unavailable.");
      }
      if (caseId === "interval") {
        return {
          text: JSON.stringify({
            ...JSON.parse(validDiagnosis(caseId)),
            confidence: 2,
          }),
        };
      }
      return { text: validDiagnosis(caseId) };
    });

    const execution = await runBaselineBatch({ provider, resultsRoot });

    expect(execution.failureCount).toBe(2);
    expect(provider.requests).toHaveLength(8);
    expect(execution.cases[0]).toMatchObject({
      caseId: "event-listener",
      status: "failed",
      errorCategory: "provider",
      attemptCount: 1,
    });
    expect(execution.cases[1]).toMatchObject({
      caseId: "interval",
      status: "failed",
      errorCategory: "schema-validation",
      attemptCount: 1,
    });
  });

  it("rejects runtime claims in an otherwise valid static diagnosis", async () => {
    const provider = new FakeProvider(({ caseId }) => ({
      text: JSON.stringify({
        ...JSON.parse(validDiagnosis(caseId)),
        evidence: [{ source: "runtime", claim: "A measured value grew." }],
      }),
    }));

    const execution = await runBaselineBatch({
      provider,
      resultsRoot,
      selectedCaseId: "event-listener",
    });

    expect(execution.cases[0]).toMatchObject({
      status: "failed",
      errorCategory: "schema-validation",
    });
  });

  it("redacts credentials and authorization values from failure text", () => {
    const secret = "secret-value-123";
    const sanitized = sanitizeErrorMessage(
      `Request used Bearer token-value and ${secret} with sk-example-secret.`,
      [secret],
    );

    expect(sanitized).not.toContain(secret);
    expect(sanitized).not.toContain("token-value");
    expect(sanitized).not.toContain("sk-example-secret");
    expect(sanitized).toContain("[REDACTED]");
  });
});
