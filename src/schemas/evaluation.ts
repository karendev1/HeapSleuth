import { z } from "zod";

import { caseIdSchema } from "./case.js";
import { diagnosisVerdictSchema } from "./diagnosis.js";
import {
  modelRequestSettingsSchema,
  modelUsageSchema,
  runErrorCategorySchema,
} from "./run-metadata.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeArtifactPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\\"), "Artifact paths use slashes.")
  .refine((value) => !value.startsWith("/"), "Artifact paths are relative.")
  .refine(
    (value) => !/^[a-zA-Z]:/.test(value),
    "Artifact paths cannot use a Windows drive prefix.",
  )
  .refine(
    (value) => !value.split("/").includes(".."),
    "Artifact paths cannot traverse the workspace.",
  );

export const evaluationApproachSchema = z.enum(["baseline", "solution"]);
export const evaluationStatusSchema = z.enum([
  "succeeded",
  "inconclusive",
  "failed",
]);

export const cohortArtifactPathsSchema = z.strictObject({
  metadata: relativeArtifactPathSchema,
  manifest: relativeArtifactPathSchema,
  result: relativeArtifactPathSchema.nullable(),
  failure: relativeArtifactPathSchema.nullable(),
  browserEvidence: relativeArtifactPathSchema.nullable(),
  investigatorResult: relativeArtifactPathSchema.nullable(),
  verification: relativeArtifactPathSchema.nullable(),
  trajectory: relativeArtifactPathSchema.nullable(),
});

export const evaluationCohortEntrySchema = z
  .strictObject({
    caseId: caseIdSchema,
    approach: evaluationApproachSchema,
    runId: z.uuid(),
    runStatus: z.enum(["succeeded", "failed"]),
    model: z.string().min(1),
    provider: z.string().min(1),
    promptVersion: z.string().min(1),
    requestSettings: modelRequestSettingsSchema,
    attemptCount: z.number().int().nonnegative(),
    promptSha256: sha256Schema.nullable(),
    selectionReason: z.string().min(1),
    artifacts: cohortArtifactPathsSchema,
  })
  .superRefine((entry, context) => {
    const successArtifactsPresent =
      entry.artifacts.result !== null && entry.artifacts.failure === null;
    const failureArtifactsPresent =
      entry.artifacts.result === null && entry.artifacts.failure !== null;
    if (
      (entry.runStatus === "succeeded" && !successArtifactsPresent) ||
      (entry.runStatus === "failed" && !failureArtifactsPresent)
    ) {
      context.addIssue({
        code: "custom",
        message: "Cohort result and failure paths must match run status.",
        path: ["artifacts"],
      });
    }
    if (
      entry.approach === "baseline" &&
      (entry.artifacts.browserEvidence !== null ||
        entry.artifacts.investigatorResult !== null ||
        entry.artifacts.verification !== null ||
        entry.artifacts.trajectory !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Baseline cohort entries cannot contain solution artifacts.",
        path: ["artifacts"],
      });
    }
    if (
      entry.approach === "solution" &&
      entry.runStatus === "succeeded" &&
      (entry.artifacts.browserEvidence === null ||
        entry.artifacts.investigatorResult === null ||
        entry.artifacts.verification === null ||
        entry.artifacts.trajectory === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Successful solution entries require all verified artifacts.",
        path: ["artifacts"],
      });
    }
  });

export const evaluationCohortSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    createdAt: z.iso.datetime(),
    frozenProtocol: z.strictObject({
      diagnosisProtocolCommit: z.string().min(7),
      datasetSha256: sha256Schema,
      caseIds: z.array(caseIdSchema).length(8),
      model: z.literal("gemini-3.6-flash"),
      provider: z.literal("gemini-interactions"),
      baselinePromptVersion: z.literal("baseline-v1"),
      solutionPromptVersion: z.literal("investigator-v1+verifier-v1"),
      selectionRule: z.string().min(1),
      scorer: z.literal("deterministic-ground-truth-v1"),
    }),
    entries: z.array(evaluationCohortEntrySchema).length(16),
  })
  .superRefine((cohort, context) => {
    const keys = new Set<string>();
    for (const [index, entry] of cohort.entries.entries()) {
      const key = `${entry.approach}:${entry.caseId}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate cohort entry: ${key}`,
          path: ["entries", index],
        });
      }
      keys.add(key);
    }
    for (const caseId of cohort.frozenProtocol.caseIds) {
      for (const approach of evaluationApproachSchema.options) {
        if (!keys.has(`${approach}:${caseId}`)) {
          context.addIssue({
            code: "custom",
            message: `Missing cohort entry: ${approach}:${caseId}`,
            path: ["entries"],
          });
        }
      }
    }
    for (const key of keys) {
      const [, caseId] = key.split(":");
      if (!cohort.frozenProtocol.caseIds.includes(caseId ?? "")) {
        context.addIssue({
          code: "custom",
          message: `Cohort entry is outside the frozen dataset: ${key}`,
          path: ["entries"],
        });
      }
    }
  });

const observedDiagnosisSchema = z.strictObject({
  verdict: diagnosisVerdictSchema,
  mechanism: z.string().min(1).nullable(),
  rootCauseFile: z.string().min(1).nullable(),
  rootCauseSymbol: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
});

export const evidenceGroundingEvaluationSchema = z.strictObject({
  score: z.number().int().min(0).max(3),
  requiredCategoryCount: z.number().int().nonnegative(),
  representedCategoryCount: z.number().int().nonnegative(),
  supportsVerdict: z.boolean(),
  hasLimitations: z.boolean(),
  explanation: z.string().min(1),
});

export const perCaseEvaluationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  caseId: caseIdSchema,
  approach: evaluationApproachSchema,
  runId: z.uuid(),
  status: evaluationStatusSchema,
  observedDiagnosis: observedDiagnosisSchema.nullable(),
  checks: z.strictObject({
    verdictCorrect: z.boolean(),
    mechanismCorrect: z.boolean(),
    localizationCorrect: z.boolean().nullable(),
    rclaCorrect: z.boolean(),
  }),
  evidenceGrounding: evidenceGroundingEvaluationSchema,
  durationMs: z.number().int().nonnegative().nullable(),
  humanTimeMs: z.null(),
  usage: modelUsageSchema.nullable(),
  estimatedListCostUsd: z.null(),
  actualBilledCostUsd: z.null(),
  failure: z
    .strictObject({
      category: runErrorCategorySchema,
      stage: z.enum(["baseline", "investigator", "verifier"]),
    })
    .nullable(),
  limitations: z.array(z.string().min(1)),
  rawArtifacts: cohortArtifactPathsSchema,
});

export const fractionMetricSchema = z.strictObject({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1).nullable(),
});

export const approachEvaluationSummarySchema = z.strictObject({
  approach: evaluationApproachSchema,
  totalCases: z.literal(8),
  succeededCases: z.number().int().nonnegative().max(8),
  failedCases: z.number().int().nonnegative().max(8),
  inconclusiveCases: z.number().int().nonnegative().max(8),
  rcla: fractionMetricSchema,
  leakDetectionAccuracy: fractionMetricSchema,
  falsePositiveRate: fractionMetricSchema,
  mechanismClassificationAccuracy: fractionMetricSchema,
  sourceLocalizationAccuracy: fractionMetricSchema,
  inconclusiveResultRate: fractionMetricSchema,
  meanEvidenceGroundingScore: z.number().min(0).max(3),
  totalDurationMs: z.number().int().nonnegative(),
  meanDurationMs: z.number().nonnegative().nullable(),
  totalUsage: modelUsageSchema,
  casesWithUsage: z.number().int().nonnegative().max(8),
  meanTokensPerCaseWithUsage: z.number().nonnegative().nullable(),
  totalHumanTimeMs: z.null(),
  estimatedListCostUsd: z.null(),
  actualBilledCostUsd: z.null(),
});

export const evaluationComparisonSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  cohortSha256: sha256Schema,
  caseOrder: z.array(caseIdSchema).length(8),
  cases: z
    .array(
      z.strictObject({
        caseId: caseIdSchema,
        baseline: perCaseEvaluationSchema,
        solution: perCaseEvaluationSchema,
      }),
    )
    .length(8),
  baseline: approachEvaluationSummarySchema,
  solution: approachEvaluationSummarySchema,
  delta: z.strictObject({
    rclaRate: z.number().min(-1).max(1).nullable(),
    leakDetectionAccuracyRate: z.number().min(-1).max(1).nullable(),
    falsePositiveRate: z.number().min(-1).max(1).nullable(),
    mechanismClassificationAccuracyRate: z.number().min(-1).max(1).nullable(),
    sourceLocalizationAccuracyRate: z.number().min(-1).max(1).nullable(),
    meanEvidenceGroundingScore: z.number().min(-3).max(3),
    totalDurationMs: z.number().int(),
    totalTokens: z.number().int(),
  }),
  primaryMetricImproved: z.boolean(),
  limitations: z.array(z.string().min(1)).min(1),
});

export const changelogEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  cohortSha256: sha256Schema,
  baselineRcla: fractionMetricSchema,
  solutionRcla: fractionMetricSchema,
  rclaRateDelta: z.number().min(-1).max(1).nullable(),
  primaryMetricImproved: z.boolean(),
  solutionFailureCounts: z.strictObject({
    providerOrExecution: z.number().int().nonnegative(),
    inconclusive: z.number().int().nonnegative(),
    verdict: z.number().int().nonnegative(),
    mechanism: z.number().int().nonnegative(),
    localization: z.number().int().nonnegative(),
  }),
  candidateBlock8FailureMode: z.string().min(1),
  claimBoundary: z.string().min(1),
});

export type EvaluationApproach = z.infer<typeof evaluationApproachSchema>;
export type EvaluationCohort = z.infer<typeof evaluationCohortSchema>;
export type EvaluationCohortEntry = z.infer<typeof evaluationCohortEntrySchema>;
export type PerCaseEvaluation = z.infer<typeof perCaseEvaluationSchema>;
export type ApproachEvaluationSummary = z.infer<
  typeof approachEvaluationSummarySchema
>;
export type EvaluationComparison = z.infer<typeof evaluationComparisonSchema>;
export type ChangelogEvidence = z.infer<typeof changelogEvidenceSchema>;
