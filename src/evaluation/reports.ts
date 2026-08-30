import type {
  EvaluationComparison,
  PerCaseEvaluation,
} from "../schemas/evaluation.js";

function formatRate(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`;
}

function formatNullable(value: string | number | boolean | null): string {
  return value === null ? "N/A" : String(value);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderCaseReport(evaluation: PerCaseEvaluation): string {
  const observed = evaluation.observedDiagnosis;
  const failure = evaluation.failure;
  return `# ${evaluation.caseId}: ${evaluation.approach} evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | ${evaluation.runId} |
| Status | ${evaluation.status} |
| Observed verdict | ${formatNullable(observed?.verdict ?? null)} |
| Observed mechanism | ${escapeTable(formatNullable(observed?.mechanism ?? null))} |
| Root-cause file | ${escapeTable(formatNullable(observed?.rootCauseFile ?? null))} |
| Root-cause symbol | ${escapeTable(formatNullable(observed?.rootCauseSymbol ?? null))} |
| Verdict correct | ${evaluation.checks.verdictCorrect} |
| Mechanism correct | ${evaluation.checks.mechanismCorrect} |
| Localization correct | ${formatNullable(evaluation.checks.localizationCorrect)} |
| RCLA correct | ${evaluation.checks.rclaCorrect} |
| Evidence-grounding score | ${evaluation.evidenceGrounding.score}/3 |
| Runtime | ${evaluation.durationMs === null ? "N/A" : `${evaluation.durationMs} ms`} |
| Total tokens | ${evaluation.usage?.totalTokens ?? "N/A"} |
| Human time | N/A |
| Estimated list cost | N/A |
| Actual billed cost | N/A |
| Failure category | ${failure?.category ?? "N/A"} |
| Failure stage | ${failure?.stage ?? "N/A"} |

## Evidence-grounding assessment

${evaluation.evidenceGrounding.explanation}

- Required categories represented: ${evaluation.evidenceGrounding.representedCategoryCount}/${evaluation.evidenceGrounding.requiredCategoryCount}
- Structured evidence supports the verdict: ${evaluation.evidenceGrounding.supportsVerdict}
- Limitations acknowledged: ${evaluation.evidenceGrounding.hasLimitations}

## Limitations

${evaluation.limitations.map((limitation) => `- ${limitation}`).join("\n")}

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
`;
}

export function renderComparisonReport(
  comparison: EvaluationComparison,
): string {
  const rows = comparison.cases
    .map(({ caseId, baseline, solution }) => {
      const baselineMechanism = baseline.observedDiagnosis?.mechanism ?? "N/A";
      const solutionMechanism = solution.observedDiagnosis?.mechanism ?? "N/A";
      return `| ${caseId} | ${baseline.status} | ${baseline.observedDiagnosis?.verdict ?? "N/A"} | ${escapeTable(baselineMechanism)} | ${baseline.checks.rclaCorrect} | ${baseline.evidenceGrounding.score} | ${solution.status} | ${solution.observedDiagnosis?.verdict ?? "N/A"} | ${escapeTable(solutionMechanism)} | ${solution.checks.rclaCorrect} | ${solution.evidenceGrounding.score} |`;
    })
    .join("\n");

  return `# HeapSleuth Frozen MVP Evaluation

## Primary result

| Approach | RCLA | Correct cases | Runtime | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| Baseline | ${formatRate(comparison.baseline.rcla.rate)} | ${comparison.baseline.rcla.numerator}/${comparison.baseline.rcla.denominator} | ${comparison.baseline.totalDurationMs} ms | ${comparison.baseline.totalUsage.totalTokens} |
| Solution | ${formatRate(comparison.solution.rcla.rate)} | ${comparison.solution.rcla.numerator}/${comparison.solution.rcla.denominator} | ${comparison.solution.totalDurationMs} ms | ${comparison.solution.totalUsage.totalTokens} |

RCLA change: ${formatRate(comparison.delta.rclaRate)} percentage-point equivalent. Primary metric improved: ${comparison.primaryMetricImproved}.

## Secondary metrics

| Metric | Baseline | Solution | Delta |
| --- | ---: | ---: | ---: |
| Leak detection accuracy | ${formatRate(comparison.baseline.leakDetectionAccuracy.rate)} | ${formatRate(comparison.solution.leakDetectionAccuracy.rate)} | ${formatRate(comparison.delta.leakDetectionAccuracyRate)} |
| False-positive rate | ${formatRate(comparison.baseline.falsePositiveRate.rate)} | ${formatRate(comparison.solution.falsePositiveRate.rate)} | ${formatRate(comparison.delta.falsePositiveRate)} |
| Mechanism classification accuracy | ${formatRate(comparison.baseline.mechanismClassificationAccuracy.rate)} | ${formatRate(comparison.solution.mechanismClassificationAccuracy.rate)} | ${formatRate(comparison.delta.mechanismClassificationAccuracyRate)} |
| Source localization accuracy | ${formatRate(comparison.baseline.sourceLocalizationAccuracy.rate)} | ${formatRate(comparison.solution.sourceLocalizationAccuracy.rate)} | ${formatRate(comparison.delta.sourceLocalizationAccuracyRate)} |
| Inconclusive-result rate | ${formatRate(comparison.baseline.inconclusiveResultRate.rate)} | ${formatRate(comparison.solution.inconclusiveResultRate.rate)} | N/A |
| Mean evidence-grounding score | ${comparison.baseline.meanEvidenceGroundingScore.toFixed(2)} | ${comparison.solution.meanEvidenceGroundingScore.toFixed(2)} | ${comparison.delta.meanEvidenceGroundingScore.toFixed(2)} |
| Mean runtime | ${formatNullable(comparison.baseline.meanDurationMs)} ms | ${formatNullable(comparison.solution.meanDurationMs)} ms | N/A |
| Mean tokens with usage | ${formatNullable(comparison.baseline.meanTokensPerCaseWithUsage)} | ${formatNullable(comparison.solution.meanTokensPerCaseWithUsage)} | N/A |
| Human time | N/A | N/A | N/A |
| Estimated list cost | N/A | N/A | N/A |
| Actual billed cost | N/A | N/A | N/A |

## Per-case comparison

| Case | Baseline status | Baseline verdict | Baseline mechanism | Baseline RCLA | Baseline evidence | Solution status | Solution verdict | Solution mechanism | Solution RCLA | Solution evidence |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: |
${rows}

## Method boundaries

${comparison.limitations.map((limitation) => `- ${limitation}`).join("\n")}

The cohort hash is \`${comparison.cohortSha256}\`. Detailed machine-readable values and denominators are available in \`comparison.json\`.
`;
}
