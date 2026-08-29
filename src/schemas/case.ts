import { z } from "zod";

export const caseIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Case IDs must use kebab-case.");

export const scenarioStepSchema = z.object({
  action: z.literal("mount-unmount"),
  target: z.string().min(1),
  repetitions: z.number().int().positive().default(1),
});

export const benchmarkCaseSchema = z.object({
  id: caseIdSchema,
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  sourceFiles: z.array(z.string().min(1)).min(1),
  scenario: z.array(scenarioStepSchema).min(1),
});

export const benchmarkDatasetSchema = z
  .array(benchmarkCaseSchema)
  .length(8)
  .superRefine((cases, context) => {
    const ids = new Set<string>();
    const routes = new Set<string>();

    for (const [index, benchmarkCase] of cases.entries()) {
      if (ids.has(benchmarkCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case ID: ${benchmarkCase.id}`,
          path: [index, "id"],
        });
      }
      if (routes.has(benchmarkCase.route)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case route: ${benchmarkCase.route}`,
          path: [index, "route"],
        });
      }
      if (benchmarkCase.route !== `/cases/${benchmarkCase.id}`) {
        context.addIssue({
          code: "custom",
          message: "Case route must be derived from its ID.",
          path: [index, "route"],
        });
      }

      ids.add(benchmarkCase.id);
      routes.add(benchmarkCase.route);
    }
  });

export const evidenceCategorySchema = z.enum([
  "runtime-retention",
  "heap-retention",
  "dom-retention",
  "listener-retention",
  "cleanup-after-gc",
]);

export const groundTruthEntrySchema = z.object({
  caseId: caseIdSchema,
  expectedVerdict: z.enum(["leak", "no-leak"]),
  acceptedMechanisms: z.array(z.string().min(1)).min(1),
  acceptedSourceFiles: z.array(z.string().min(1)).min(1),
  acceptedSymbols: z.array(z.string().min(1)).min(1),
  requiredEvidenceCategories: z.array(evidenceCategorySchema).min(1),
  evaluatorNotes: z.string().min(1),
});

export const groundTruthDatasetSchema = z
  .array(groundTruthEntrySchema)
  .length(8)
  .superRefine((entries, context) => {
    const ids = new Set<string>();
    let leakCount = 0;
    let controlCount = 0;

    for (const [index, entry] of entries.entries()) {
      if (ids.has(entry.caseId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate ground-truth case ID: ${entry.caseId}`,
          path: [index, "caseId"],
        });
      }

      ids.add(entry.caseId);
      if (entry.expectedVerdict === "leak") leakCount += 1;
      else controlCount += 1;
    }

    if (leakCount !== 7 || controlCount !== 1) {
      context.addIssue({
        code: "custom",
        message:
          "Ground truth must contain seven leaks and one no-leak control.",
      });
    }
  });

export function validateDatasetAlignment(
  cases: BenchmarkDataset,
  groundTruth: GroundTruthDataset,
): void {
  const caseIds = new Set(cases.map(({ id }) => id));
  const answerIds = new Set(groundTruth.map(({ caseId }) => caseId));

  if (
    caseIds.size !== answerIds.size ||
    [...caseIds].some((id) => !answerIds.has(id))
  ) {
    throw new Error(
      "Case dataset and ground truth must contain identical IDs.",
    );
  }
}

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type BenchmarkDataset = z.infer<typeof benchmarkDatasetSchema>;
export type GroundTruthDataset = z.infer<typeof groundTruthDatasetSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
