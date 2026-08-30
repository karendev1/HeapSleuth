import type { Diagnosis } from "../schemas/diagnosis.js";
import {
  approachEvaluationSummarySchema,
  changelogEvidenceSchema,
  evaluationComparisonSchema,
  perCaseEvaluationSchema,
  type ApproachEvaluationSummary,
  type ChangelogEvidence,
  type EvaluationApproach,
  type EvaluationCohortEntry,
  type EvaluationComparison,
  type PerCaseEvaluation,
} from "../schemas/evaluation.js";
import type { GroundTruthDataset } from "../schemas/ground-truth.js";
import type {
  InvestigatorBrowserEvidence,
  InvestigatorFailure,
} from "../schemas/investigator.js";
import type { BaselineFailure } from "../schemas/baseline.js";
import type { RunMetadata } from "../schemas/run-metadata.js";

type GroundTruthEntry = GroundTruthDataset[number];

export type LoadedEvaluationRun = {
  cohortEntry: EvaluationCohortEntry;
  metadata: RunMetadata;
  diagnosis?: Diagnosis;
  failure?: BaselineFailure | InvestigatorFailure;
  browserEvidence?: InvestigatorBrowserEvidence;
};

const mechanismStopWords = new Set([
  "a",
  "an",
  "by",
  "cleanup",
  "leak",
  "memory",
  "retained",
  "retention",
  "the",
  "without",
]);

function canonicalWords(value: string): string[] {
  const withCamelBoundaries = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const words = withCamelBoundaries
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      if (["timer", "timers"].includes(word)) return "interval";
      if (["cache", "caches", "map", "maps"].includes(word)) {
        return "collection";
      }
      if (["callbacks", "closures"].includes(word)) {
        return word.slice(0, -1);
      }
      if (word.startsWith("subscrib")) return "subscription";
      if (word === "listeners") return "listener";
      if (word === "observers") return "observer";
      if (word === "js") return "javascript";
      return word;
    });
  if (/never\s+evict|not\s+evict|without\s+evict/i.test(value)) {
    words.push("unbounded");
  }
  return words;
}

export function mechanismMatches(
  mechanism: string | null,
  acceptedMechanisms: readonly string[],
): boolean {
  if (mechanism === null) return false;
  const observed = new Set(canonicalWords(mechanism));
  return acceptedMechanisms.some((accepted) => {
    const required = canonicalWords(accepted).filter(
      (word) => !mechanismStopWords.has(word),
    );
    return required.length > 0 && required.every((word) => observed.has(word));
  });
}

function hasEvidenceSource(
  diagnosis: Diagnosis,
  ...sources: Diagnosis["evidence"][number]["source"][]
): boolean {
  return diagnosis.evidence.some(({ source }) => sources.includes(source));
}

function listenerDelta(evidence: InvestigatorBrowserEvidence): number {
  return Object.values(evidence.listeners.deltaByType).reduce(
    (total, value) => total + value,
    0,
  );
}

function representedEvidenceCategories(input: {
  diagnosis: Diagnosis;
  browserEvidence?: InvestigatorBrowserEvidence;
  groundTruth: GroundTruthEntry;
}): Set<GroundTruthEntry["requiredEvidenceCategories"][number]> {
  const represented = new Set<
    GroundTruthEntry["requiredEvidenceCategories"][number]
  >();
  const evidence = input.browserEvidence;
  if (evidence === undefined) return represented;

  const retained = evidence.deltas.retainedResources > 0;
  const citesRuntime = hasEvidenceSource(input.diagnosis, "runtime");
  const citesHeap = hasEvidenceSource(input.diagnosis, "heap");
  const citesRuntimeOrHeap = citesRuntime || citesHeap;

  if (citesRuntime && retained) represented.add("runtime-retention");
  if (
    citesHeap &&
    retained &&
    (evidence.deltas.usedHeapBytes > 0 ||
      evidence.deltas.backingStorageBytes > 0)
  ) {
    represented.add("heap-retention");
  }
  if (citesRuntimeOrHeap && retained && evidence.deltas.domNodes > 0) {
    represented.add("dom-retention");
  }
  if (citesRuntimeOrHeap && listenerDelta(evidence) > 0) {
    represented.add("listener-retention");
  }
  if (
    hasEvidenceSource(input.diagnosis, "runtime", "heap", "source") &&
    evidence.samples.final.garbageCollection.forced &&
    evidence.deltas.activeResources === 0 &&
    evidence.deltas.retainedResources === 0 &&
    evidence.deltas.releasedResources > 0 &&
    listenerDelta(evidence) <= 0
  ) {
    represented.add("cleanup-after-gc");
  }
  return represented;
}

function browserEvidenceSupportsVerdict(
  diagnosis: Diagnosis,
  evidence: InvestigatorBrowserEvidence | undefined,
): boolean {
  if (evidence === undefined) return false;
  if (diagnosis.verdict === "leak") {
    return (
      evidence.deltas.activeResources > 0 &&
      evidence.deltas.retainedResources > 0
    );
  }
  if (diagnosis.verdict === "no-leak") {
    return (
      evidence.deltas.activeResources === 0 &&
      evidence.deltas.retainedResources === 0 &&
      evidence.deltas.releasedResources > 0 &&
      listenerDelta(evidence) <= 0
    );
  }
  return false;
}

export function scoreEvidenceGrounding(input: {
  diagnosis?: Diagnosis;
  browserEvidence?: InvestigatorBrowserEvidence;
  groundTruth: GroundTruthEntry;
  failed: boolean;
}): PerCaseEvaluation["evidenceGrounding"] {
  const requiredCategoryCount =
    input.groundTruth.requiredEvidenceCategories.length;
  if (
    input.failed ||
    input.diagnosis === undefined ||
    input.diagnosis.verdict === "inconclusive" ||
    input.diagnosis.evidence.length === 0
  ) {
    return {
      score: 0,
      requiredCategoryCount,
      representedCategoryCount: 0,
      supportsVerdict: false,
      hasLimitations: (input.diagnosis?.limitations.length ?? 0) > 0,
      explanation:
        "No completed, conclusive diagnosis with usable evidence was available.",
    };
  }

  const represented = representedEvidenceCategories({
    diagnosis: input.diagnosis,
    ...(input.browserEvidence === undefined
      ? {}
      : { browserEvidence: input.browserEvidence }),
    groundTruth: input.groundTruth,
  });
  const representedCategoryCount =
    input.groundTruth.requiredEvidenceCategories.filter((category) =>
      represented.has(category),
    ).length;
  const supportsVerdict = browserEvidenceSupportsVerdict(
    input.diagnosis,
    input.browserEvidence,
  );
  const hasLimitations = input.diagnosis.limitations.length > 0;
  const allRequiredRepresented =
    representedCategoryCount === requiredCategoryCount;

  if (!allRequiredRepresented || !supportsVerdict) {
    return {
      score: 1,
      requiredCategoryCount,
      representedCategoryCount,
      supportsVerdict,
      hasLimitations,
      explanation:
        "Evidence is present, but the required runtime category or structured support is incomplete.",
    };
  }
  if (!hasLimitations) {
    return {
      score: 2,
      requiredCategoryCount,
      representedCategoryCount,
      supportsVerdict,
      hasLimitations,
      explanation:
        "Required evidence supports the verdict, but limitations are not acknowledged.",
    };
  }
  return {
    score: 3,
    requiredCategoryCount,
    representedCategoryCount,
    supportsVerdict,
    hasLimitations,
    explanation:
      "Required structured evidence supports the verdict and limitations are acknowledged.",
  };
}

function failureStage(
  approach: EvaluationApproach,
  failure: BaselineFailure | InvestigatorFailure | undefined,
): "baseline" | "investigator" | "verifier" {
  if (approach === "baseline") return "baseline";
  return failure !== undefined &&
    "stage" in failure &&
    failure.stage === "verifier"
    ? "verifier"
    : "investigator";
}

export function scoreEvaluationCase(input: {
  run: LoadedEvaluationRun;
  groundTruth: GroundTruthEntry;
}): PerCaseEvaluation {
  const { run, groundTruth } = input;
  const diagnosis = run.diagnosis;
  const failed = run.metadata.status === "failed" || diagnosis === undefined;
  const inconclusive = !failed && diagnosis.verdict === "inconclusive";
  const status = failed
    ? "failed"
    : inconclusive
      ? "inconclusive"
      : "succeeded";
  const verdictCorrect =
    !failed &&
    !inconclusive &&
    diagnosis.verdict === groundTruth.expectedVerdict;
  const mechanismCorrect =
    !failed && !inconclusive && groundTruth.expectedVerdict === "no-leak"
      ? verdictCorrect
      : !failed &&
        !inconclusive &&
        mechanismMatches(diagnosis.mechanism, groundTruth.acceptedMechanisms);
  const localizationCorrect =
    groundTruth.expectedVerdict === "no-leak"
      ? null
      : !failed &&
        !inconclusive &&
        diagnosis.rootCause !== null &&
        (groundTruth.acceptedSourceFiles.includes(diagnosis.rootCause.file) ||
          groundTruth.acceptedSymbols.includes(diagnosis.rootCause.symbol));
  const rclaCorrect =
    verdictCorrect &&
    mechanismCorrect &&
    (localizationCorrect === null || localizationCorrect);
  const evidenceGrounding = scoreEvidenceGrounding({
    ...(diagnosis === undefined ? {} : { diagnosis }),
    ...(run.browserEvidence === undefined
      ? {}
      : { browserEvidence: run.browserEvidence }),
    groundTruth,
    failed,
  });

  return perCaseEvaluationSchema.parse({
    schemaVersion: 1,
    caseId: run.cohortEntry.caseId,
    approach: run.cohortEntry.approach,
    runId: run.cohortEntry.runId,
    status,
    observedDiagnosis:
      diagnosis === undefined
        ? null
        : {
            verdict: diagnosis.verdict,
            mechanism: diagnosis.mechanism,
            rootCauseFile: diagnosis.rootCause?.file ?? null,
            rootCauseSymbol: diagnosis.rootCause?.symbol ?? null,
            confidence: diagnosis.confidence,
          },
    checks: {
      verdictCorrect,
      mechanismCorrect,
      localizationCorrect,
      rclaCorrect,
    },
    evidenceGrounding,
    durationMs: run.metadata.durationMs ?? null,
    humanTimeMs: null,
    usage: run.metadata.usage ?? null,
    estimatedListCostUsd: null,
    actualBilledCostUsd: null,
    failure:
      failed && run.failure !== undefined
        ? {
            category: run.failure.category,
            stage: failureStage(run.cohortEntry.approach, run.failure),
          }
        : null,
    limitations: [
      ...(diagnosis?.limitations ?? []),
      "Human time and monetary cost are unavailable from validated run artifacts.",
      ...(run.cohortEntry.approach === "baseline"
        ? [
            "The baseline receives source code only, so runtime evidence categories are not represented.",
          ]
        : []),
    ],
    rawArtifacts: run.cohortEntry.artifacts,
  });
}

function fraction(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function summarizeApproach(
  approach: EvaluationApproach,
  cases: readonly PerCaseEvaluation[],
  groundTruth: GroundTruthDataset,
): ApproachEvaluationSummary {
  if (cases.length !== 8 || cases.some((item) => item.approach !== approach)) {
    throw new Error(
      `${approach} summary requires exactly eight matching cases.`,
    );
  }
  const truthByCase = new Map(
    groundTruth.map((entry) => [entry.caseId, entry]),
  );
  const leakCases = cases.filter(
    ({ caseId }) => truthByCase.get(caseId)?.expectedVerdict === "leak",
  );
  const controlCases = cases.filter(
    ({ caseId }) => truthByCase.get(caseId)?.expectedVerdict === "no-leak",
  );
  const durations = cases.flatMap(({ durationMs }) =>
    durationMs === null ? [] : [durationMs],
  );
  const usage = cases.flatMap((item) =>
    item.usage === null ? [] : [item.usage],
  );
  const totalUsage = usage.reduce(
    (total, item) => ({
      inputTokens: total.inputTokens + item.inputTokens,
      outputTokens: total.outputTokens + item.outputTokens,
      totalTokens: total.totalTokens + item.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  return approachEvaluationSummarySchema.parse({
    approach,
    totalCases: 8,
    succeededCases: cases.filter(({ status }) => status === "succeeded").length,
    failedCases: cases.filter(({ status }) => status === "failed").length,
    inconclusiveCases: cases.filter(({ status }) => status === "inconclusive")
      .length,
    rcla: fraction(
      cases.filter(({ checks }) => checks.rclaCorrect).length,
      cases.length,
    ),
    leakDetectionAccuracy: fraction(
      cases.filter(({ checks }) => checks.verdictCorrect).length,
      cases.length,
    ),
    falsePositiveRate: fraction(
      controlCases.filter(
        ({ observedDiagnosis }) => observedDiagnosis?.verdict === "leak",
      ).length,
      controlCases.length,
    ),
    mechanismClassificationAccuracy: fraction(
      leakCases.filter(({ checks }) => checks.mechanismCorrect).length,
      leakCases.length,
    ),
    sourceLocalizationAccuracy: fraction(
      leakCases.filter(({ checks }) => checks.localizationCorrect === true)
        .length,
      leakCases.length,
    ),
    inconclusiveResultRate: fraction(
      cases.filter(({ status }) => status === "inconclusive").length,
      cases.length,
    ),
    meanEvidenceGroundingScore:
      cases.reduce((total, item) => total + item.evidenceGrounding.score, 0) /
      cases.length,
    totalDurationMs: durations.reduce((total, value) => total + value, 0),
    meanDurationMs: mean(durations),
    totalUsage,
    casesWithUsage: usage.length,
    meanTokensPerCaseWithUsage: mean(
      usage.map(({ totalTokens }) => totalTokens),
    ),
    totalHumanTimeMs: null,
    estimatedListCostUsd: null,
    actualBilledCostUsd: null,
  });
}

function subtractNullable(
  solution: number | null,
  baseline: number | null,
): number | null {
  return solution === null || baseline === null ? null : solution - baseline;
}

export function buildEvaluationComparison(input: {
  generatedAt: string;
  cohortSha256: string;
  caseOrder: readonly string[];
  baselineCases: readonly PerCaseEvaluation[];
  solutionCases: readonly PerCaseEvaluation[];
  groundTruth: GroundTruthDataset;
}): EvaluationComparison {
  const baselineByCase = new Map(
    input.baselineCases.map((item) => [item.caseId, item]),
  );
  const solutionByCase = new Map(
    input.solutionCases.map((item) => [item.caseId, item]),
  );
  const baseline = summarizeApproach(
    "baseline",
    input.baselineCases,
    input.groundTruth,
  );
  const solution = summarizeApproach(
    "solution",
    input.solutionCases,
    input.groundTruth,
  );
  return evaluationComparisonSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    cohortSha256: input.cohortSha256,
    caseOrder: input.caseOrder,
    cases: input.caseOrder.map((caseId) => {
      const baselineCase = baselineByCase.get(caseId);
      const solutionCase = solutionByCase.get(caseId);
      if (baselineCase === undefined || solutionCase === undefined) {
        throw new Error(`Missing paired evaluation case: ${caseId}`);
      }
      return { caseId, baseline: baselineCase, solution: solutionCase };
    }),
    baseline,
    solution,
    delta: {
      rclaRate: subtractNullable(solution.rcla.rate, baseline.rcla.rate),
      leakDetectionAccuracyRate: subtractNullable(
        solution.leakDetectionAccuracy.rate,
        baseline.leakDetectionAccuracy.rate,
      ),
      falsePositiveRate: subtractNullable(
        solution.falsePositiveRate.rate,
        baseline.falsePositiveRate.rate,
      ),
      mechanismClassificationAccuracyRate: subtractNullable(
        solution.mechanismClassificationAccuracy.rate,
        baseline.mechanismClassificationAccuracy.rate,
      ),
      sourceLocalizationAccuracyRate: subtractNullable(
        solution.sourceLocalizationAccuracy.rate,
        baseline.sourceLocalizationAccuracy.rate,
      ),
      meanEvidenceGroundingScore:
        solution.meanEvidenceGroundingScore -
        baseline.meanEvidenceGroundingScore,
      totalDurationMs: solution.totalDurationMs - baseline.totalDurationMs,
      totalTokens:
        solution.totalUsage.totalTokens - baseline.totalUsage.totalTokens,
    },
    primaryMetricImproved:
      solution.rcla.rate !== null &&
      baseline.rcla.rate !== null &&
      solution.rcla.rate > baseline.rcla.rate,
    limitations: [
      "The eight cases are synthetic and do not establish performance on arbitrary production applications.",
      "The Investigator and Verifier use separate requests to the same Gemini model family.",
      "Human time and monetary cost are unavailable; runtime and token usage are reported directly from metadata.",
      "Evidence grounding uses a conservative deterministic proxy for the qualitative rubric.",
    ],
  });
}

export function buildChangelogEvidence(
  comparison: EvaluationComparison,
): ChangelogEvidence {
  const solutionCases = comparison.cases.map(({ solution }) => solution);
  const counts = {
    providerOrExecution: solutionCases.filter(
      ({ status }) => status === "failed",
    ).length,
    inconclusive: solutionCases.filter(
      ({ status }) => status === "inconclusive",
    ).length,
    verdict: solutionCases.filter(
      ({ status, checks }) => status === "succeeded" && !checks.verdictCorrect,
    ).length,
    mechanism: solutionCases.filter(
      ({ status, checks }) =>
        status === "succeeded" &&
        checks.verdictCorrect &&
        !checks.mechanismCorrect,
    ).length,
    localization: solutionCases.filter(
      ({ status, checks }) =>
        status === "succeeded" &&
        checks.verdictCorrect &&
        checks.mechanismCorrect &&
        checks.localizationCorrect === false,
    ).length,
  };
  const candidate =
    counts.providerOrExecution > 0
      ? "Solution reliability failures are the first candidate for Block 8 investigation."
      : counts.inconclusive > 0
        ? "Inconclusive solution results are the first candidate for Block 8 investigation."
        : counts.verdict > 0
          ? "Incorrect solution verdicts are the first candidate for Block 8 investigation."
          : counts.mechanism > 0
            ? "Mechanism classification is the first candidate for Block 8 investigation."
            : counts.localization > 0
              ? "Source localization is the first candidate for Block 8 investigation."
              : solutionCases.some(
                    ({ evidenceGrounding }) => evidenceGrounding.score < 3,
                  )
                ? "Evidence grounding below score 3 is the first candidate for Block 8 investigation."
                : "No solution correctness failure was observed; Block 8 should test robustness without changing the frozen result claim.";

  return changelogEvidenceSchema.parse({
    schemaVersion: 1,
    generatedAt: comparison.generatedAt,
    cohortSha256: comparison.cohortSha256,
    baselineRcla: comparison.baseline.rcla,
    solutionRcla: comparison.solution.rcla,
    rclaRateDelta: comparison.delta.rclaRate,
    primaryMetricImproved: comparison.primaryMetricImproved,
    solutionFailureCounts: counts,
    candidateBlock8FailureMode: candidate,
    claimBoundary:
      "This comparison supports claims only for the frozen eight-case synthetic MVP cohort.",
  });
}
