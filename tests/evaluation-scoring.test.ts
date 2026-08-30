import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildChangelogEvidence,
  buildEvaluationComparison,
  mechanismMatches,
  scoreEvaluationCase,
  scoreEvidenceGrounding,
  summarizeApproach,
  type LoadedEvaluationRun,
} from "../src/evaluation/scoring.js";
import {
  renderCaseReport,
  renderComparisonReport,
} from "../src/evaluation/reports.js";
import type { Diagnosis } from "../src/schemas/diagnosis.js";
import type {
  EvaluationApproach,
  EvaluationCohortEntry,
} from "../src/schemas/evaluation.js";
import type { GroundTruthDataset } from "../src/schemas/ground-truth.js";
import type { RunMetadata } from "../src/schemas/run-metadata.js";
import { createInvestigatorEvidence } from "./investigator-test-fixture.js";

const caseIds = [
  "event-listener",
  "interval",
  "resize-observer",
  "detached-dom",
  "global-cache",
  "closure-registry",
  "event-bus",
  "healthy-control",
] as const;

const truth = caseIds.map((caseId) => {
  const control = caseId === "healthy-control";
  const symbol = caseId
    .split("-")
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join("");
  return {
    caseId,
    expectedVerdict: control ? ("no-leak" as const) : ("leak" as const),
    acceptedMechanisms: [
      control ? "temporary_allocation_released" : `${caseId}_mechanism`,
    ],
    acceptedSourceFiles: [`benchmark/src/cases/${symbol}.tsx`],
    acceptedSymbols: [symbol],
    requiredEvidenceCategories: control
      ? (["cleanup-after-gc"] as const)
      : (["runtime-retention"] as const),
    evaluatorNotes: "Evaluator-only fixture note.",
  };
}) as GroundTruthDataset;

function diagnosis(input: {
  caseId: string;
  verdict?: Diagnosis["verdict"];
  mechanism?: string | null;
  file?: string;
  symbol?: string;
  limitations?: string[];
  evidence?: Diagnosis["evidence"];
}): Diagnosis {
  const entry = truth.find(({ caseId }) => caseId === input.caseId)!;
  const verdict = input.verdict ?? entry.expectedVerdict;
  return {
    caseId: input.caseId,
    verdict,
    mechanism:
      input.mechanism === undefined
        ? verdict === "no-leak"
          ? null
          : entry.acceptedMechanisms[0]!
        : input.mechanism,
    rootCause:
      verdict === "no-leak"
        ? null
        : {
            file: input.file ?? entry.acceptedSourceFiles[0]!,
            symbol: input.symbol ?? entry.acceptedSymbols[0]!,
          },
    evidence: input.evidence ?? [
      { source: "runtime", claim: "Resources remain after collection." },
      { source: "heap", claim: "Retained storage remains reachable." },
    ],
    confidence: 0.9,
    recommendedFix: verdict === "leak" ? "Add cleanup." : null,
    limitations: input.limitations ?? ["Synthetic fixture."],
  };
}

function cohortEntry(
  caseId: string,
  approach: EvaluationApproach,
  status: "succeeded" | "failed" = "succeeded",
): EvaluationCohortEntry {
  return {
    caseId,
    approach,
    runId: randomUUID(),
    runStatus: status,
    model: "gemini-3.6-flash",
    provider: "gemini-interactions",
    promptVersion:
      approach === "baseline" ? "baseline-v1" : "investigator-v1+verifier-v1",
    requestSettings: {
      temperature: null,
      maxOutputTokens: 1_200,
      store: false,
      toolsEnabled: false,
      seed: 0,
      thinkingLevel: "low",
    },
    attemptCount: approach === "baseline" ? 1 : 2,
    promptSha256: "a".repeat(64),
    selectionReason: "Active run fixture.",
    artifacts: {
      metadata: `results/${approach}/${caseId}/run-metadata.json`,
      manifest: `results/${approach}/${caseId}/input-manifest.json`,
      result:
        status === "succeeded"
          ? `results/${approach}/${caseId}/result.json`
          : null,
      failure:
        status === "failed"
          ? `results/${approach}/${caseId}/failure.json`
          : null,
      browserEvidence:
        approach === "solution"
          ? `results/solution/${caseId}/browser-evidence.json`
          : null,
      investigatorResult:
        approach === "solution" && status === "succeeded"
          ? `results/solution/${caseId}/investigator-result.json`
          : null,
      verification:
        approach === "solution" && status === "succeeded"
          ? `results/solution/${caseId}/verification.json`
          : null,
      trajectory:
        approach === "solution" && status === "succeeded"
          ? `trajectories/${caseId}/${randomUUID()}.jsonl`
          : null,
    },
  };
}

function metadata(
  entry: EvaluationCohortEntry,
  status: "succeeded" | "failed" = "succeeded",
): RunMetadata {
  return {
    runId: entry.runId,
    caseId: entry.caseId,
    approach: entry.approach,
    status,
    startedAt: "2026-08-29T12:00:00.000Z",
    completedAt: "2026-08-29T12:00:01.000Z",
    durationMs: 1_000,
    runtime: {
      nodeVersion: "v20.19.0",
      platform: "win32",
      architecture: "x64",
    },
    model: "gemini-3.6-flash",
    provider: "gemini-interactions",
    promptVersion: entry.promptVersion,
    requestSettings: entry.requestSettings,
    attemptCount: entry.attemptCount,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  };
}

function successfulRun(input: {
  caseId: string;
  approach?: EvaluationApproach;
  diagnosis?: Diagnosis;
}): LoadedEvaluationRun {
  const approach = input.approach ?? "solution";
  const entry = cohortEntry(input.caseId, approach);
  return {
    cohortEntry: entry,
    metadata: metadata(entry),
    diagnosis: input.diagnosis ?? diagnosis({ caseId: input.caseId }),
    ...(approach === "solution"
      ? {
          browserEvidence: createInvestigatorEvidence(
            input.caseId,
            input.caseId !== "healthy-control",
          ),
        }
      : {}),
  };
}

function score(run: LoadedEvaluationRun) {
  return scoreEvaluationCase({
    run,
    groundTruth: truth.find(({ caseId }) => caseId === run.cohortEntry.caseId)!,
  });
}

describe("deterministic evaluation scoring", () => {
  it("matches normalized mechanism labels without requiring exact prose", () => {
    expect(
      mechanismMatches("A repeating timer is never cleared", [
        "interval_without_cleanup",
      ]),
    ).toBe(true);
    expect(
      mechanismMatches("An event listener remains registered", [
        "interval_without_cleanup",
      ]),
    ).toBe(false);
  });

  it("requires verdict, mechanism, and leak localization for RCLA", () => {
    const correct = score(successfulRun({ caseId: "event-listener" }));
    expect(correct.checks).toEqual({
      verdictCorrect: true,
      mechanismCorrect: true,
      localizationCorrect: true,
      rclaCorrect: true,
    });

    const wrongVerdict = score(
      successfulRun({
        caseId: "event-listener",
        diagnosis: diagnosis({ caseId: "event-listener", verdict: "no-leak" }),
      }),
    );
    expect(wrongVerdict.checks.rclaCorrect).toBe(false);

    const wrongMechanism = score(
      successfulRun({
        caseId: "interval",
        diagnosis: diagnosis({
          caseId: "interval",
          mechanism: "event listener",
        }),
      }),
    );
    expect(wrongMechanism.checks).toMatchObject({
      verdictCorrect: true,
      mechanismCorrect: false,
      rclaCorrect: false,
    });

    const wrongLocation = score(
      successfulRun({
        caseId: "interval",
        diagnosis: diagnosis({
          caseId: "interval",
          file: "benchmark/src/cases/Other.tsx",
          symbol: "Other",
        }),
      }),
    );
    expect(wrongLocation.checks).toMatchObject({
      mechanismCorrect: true,
      localizationCorrect: false,
      rclaCorrect: false,
    });
  });

  it("scores evidence grounding from 0 through 3 conservatively", () => {
    const eventTruth = {
      ...truth[0]!,
      acceptedMechanisms: ["event_listener_without_cleanup"],
      requiredEvidenceCategories: [
        "listener-retention" as const,
        "runtime-retention" as const,
      ],
    };
    const supported = diagnosis({ caseId: "event-listener" });
    const evidence = createInvestigatorEvidence("event-listener", true);

    expect(
      scoreEvidenceGrounding({
        groundTruth: eventTruth,
        failed: true,
      }).score,
    ).toBe(0);
    expect(
      scoreEvidenceGrounding({
        diagnosis: supported,
        groundTruth: eventTruth,
        failed: false,
      }).score,
    ).toBe(1);
    expect(
      scoreEvidenceGrounding({
        diagnosis: { ...supported, limitations: [] },
        browserEvidence: evidence,
        groundTruth: eventTruth,
        failed: false,
      }).score,
    ).toBe(2);
    expect(
      scoreEvidenceGrounding({
        diagnosis: supported,
        browserEvidence: evidence,
        groundTruth: eventTruth,
        failed: false,
      }).score,
    ).toBe(3);
  });

  it("records failed and inconclusive runs as not RCLA-correct", () => {
    const failedEntry = cohortEntry("event-listener", "solution", "failed");
    const failed = score({
      cohortEntry: failedEntry,
      metadata: metadata(failedEntry, "failed"),
      failure: {
        schemaVersion: 1,
        caseId: "event-listener",
        status: "failed",
        category: "provider",
        message: "Provider unavailable.",
        attemptCount: 1,
        stage: "investigator",
      },
    });
    expect(failed).toMatchObject({
      status: "failed",
      checks: { rclaCorrect: false },
      evidenceGrounding: { score: 0 },
    });

    const inconclusive = score(
      successfulRun({
        caseId: "event-listener",
        diagnosis: diagnosis({
          caseId: "event-listener",
          verdict: "inconclusive",
          mechanism: null,
        }),
      }),
    );
    expect(inconclusive).toMatchObject({
      status: "inconclusive",
      checks: { rclaCorrect: false },
    });
  });

  it("uses all eight cases and the healthy control in secondary denominators", () => {
    const cases = caseIds.map((caseId) =>
      score(
        successfulRun({
          caseId,
          ...(caseId === "healthy-control"
            ? {
                diagnosis: diagnosis({
                  caseId,
                  verdict: "leak",
                  mechanism: "healthy-control mechanism",
                }),
              }
            : {}),
        }),
      ),
    );
    const summary = summarizeApproach("solution", cases, truth);
    expect(summary.rcla).toEqual({ numerator: 7, denominator: 8, rate: 0.875 });
    expect(summary.leakDetectionAccuracy).toEqual({
      numerator: 7,
      denominator: 8,
      rate: 0.875,
    });
    expect(summary.falsePositiveRate).toEqual({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(summary.mechanismClassificationAccuracy.denominator).toBe(7);
    expect(summary.sourceLocalizationAccuracy.denominator).toBe(7);
  });

  it("builds paired summaries in stable dataset order and renders from the same objects", () => {
    const baselineCases = caseIds.map((caseId) =>
      score(successfulRun({ caseId, approach: "baseline" })),
    );
    const solutionCases = caseIds.map((caseId) =>
      score(successfulRun({ caseId })),
    );
    const comparison = buildEvaluationComparison({
      generatedAt: "2026-08-29T12:00:00.000Z",
      cohortSha256: "b".repeat(64),
      caseOrder: caseIds,
      baselineCases,
      solutionCases,
      groundTruth: truth,
    });
    expect(comparison.cases.map(({ caseId }) => caseId)).toEqual(caseIds);
    expect(comparison.solution.rcla.denominator).toBe(8);
    expect(comparison.delta.totalTokens).toBe(0);
    const markdown = renderComparisonReport(comparison);
    expect(markdown).toContain(
      `| Baseline | 100.0% | 8/8 | ${comparison.baseline.totalDurationMs} ms |`,
    );
    expect(markdown).toContain("| healthy-control |");
    expect(renderCaseReport(solutionCases[0]!)).toContain(
      `| RCLA correct | ${solutionCases[0]!.checks.rclaCorrect} |`,
    );
    expect(buildChangelogEvidence(comparison).baselineRcla).toEqual(
      comparison.baseline.rcla,
    );
  });
});
