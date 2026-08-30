import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";
import {
  changelogEvidenceSchema,
  evaluationCohortSchema,
  evaluationComparisonSchema,
  perCaseEvaluationSchema,
  type PerCaseEvaluation,
} from "../schemas/evaluation.js";
import {
  archiveExistingEvaluationSummary,
  createActiveEvaluationCohort,
  writeValidatedJson,
} from "./artifacts.js";
import { loadEvaluatorGroundTruth } from "./ground-truth-loader.js";
import { renderCaseReport, renderComparisonReport } from "./reports.js";
import {
  buildChangelogEvidence,
  buildEvaluationComparison,
  scoreEvaluationCase,
} from "./scoring.js";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function resolveResultsRoot(relativePath: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, resolved);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("RESULTS_DIR must resolve inside the project workspace.");
  }
  return resolved;
}

function safeArchiveId(date: Date): string {
  return date.toISOString().replaceAll(":", "-");
}

async function writeReport(filePath: string, markdown: string): Promise<void> {
  await writeFile(filePath, markdown, "utf8");
  const saved = await readFile(filePath, "utf8");
  if (saved !== markdown) {
    throw new Error(`Saved report did not round-trip exactly: ${filePath}`);
  }
}

export async function runEvaluation(input: {
  projectRoot: string;
  resultsRoot: string;
  now?: Date;
}): Promise<ReturnType<typeof buildEvaluationComparison>> {
  const now = input.now ?? new Date();
  const { cohort, runs } = await createActiveEvaluationCohort({
    projectRoot: input.projectRoot,
    resultsRoot: input.resultsRoot,
    createdAt: now,
  });
  const summaryRoot = path.join(input.resultsRoot, "summary");
  await archiveExistingEvaluationSummary(input.resultsRoot, safeArchiveId(now));
  const cohortPath = path.join(summaryRoot, "evaluation-cohort.json");
  await writeValidatedJson({
    filePath: cohortPath,
    value: cohort,
    schema: evaluationCohortSchema,
  });

  // Ground truth is intentionally loaded only after the cohort is frozen on disk.
  const groundTruth = await loadEvaluatorGroundTruth(input.projectRoot);
  const truthByCase = new Map(
    groundTruth.map((entry) => [entry.caseId, entry]),
  );
  const evaluations: PerCaseEvaluation[] = [];
  for (const run of runs) {
    const truth = truthByCase.get(run.cohortEntry.caseId);
    if (truth === undefined) {
      throw new Error(`Missing evaluator truth for ${run.cohortEntry.caseId}.`);
    }
    evaluations.push(scoreEvaluationCase({ run, groundTruth: truth }));
  }

  for (const evaluation of evaluations) {
    const caseRoot = path.join(
      input.resultsRoot,
      evaluation.approach,
      evaluation.caseId,
    );
    await writeValidatedJson({
      filePath: path.join(caseRoot, "metrics.json"),
      value: evaluation,
      schema: perCaseEvaluationSchema,
    });
    await writeReport(
      path.join(caseRoot, "report.md"),
      renderCaseReport(evaluation),
    );
  }

  const cohortText = await readFile(cohortPath, "utf8");
  const cohortSha256 = createHash("sha256").update(cohortText).digest("hex");
  const baselineCases = evaluations.filter(
    ({ approach }) => approach === "baseline",
  );
  const solutionCases = evaluations.filter(
    ({ approach }) => approach === "solution",
  );
  const comparison = buildEvaluationComparison({
    generatedAt: now.toISOString(),
    cohortSha256,
    caseOrder: cohort.frozenProtocol.caseIds,
    baselineCases,
    solutionCases,
    groundTruth,
  });
  await writeValidatedJson({
    filePath: path.join(summaryRoot, "comparison.json"),
    value: comparison,
    schema: evaluationComparisonSchema,
  });
  await writeReport(
    path.join(summaryRoot, "comparison.md"),
    renderComparisonReport(comparison),
  );
  await writeValidatedJson({
    filePath: path.join(summaryRoot, "changelog-evidence.json"),
    value: buildChangelogEvidence(comparison),
    schema: changelogEvidenceSchema,
  });
  return comparison;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const comparison = await runEvaluation({
    projectRoot,
    resultsRoot: resolveResultsRoot(config.RESULTS_DIR),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        cohortSha256: comparison.cohortSha256,
        baselineRcla: comparison.baseline.rcla,
        solutionRcla: comparison.solution.rcla,
        rclaRateDelta: comparison.delta.rclaRate,
        primaryMetricImproved: comparison.primaryMetricImproved,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Evaluation failed: ${message}\n`);
  process.exitCode = 1;
});
