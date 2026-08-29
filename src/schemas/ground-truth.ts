import { z } from "zod";

import { caseIdSchema, type BenchmarkDataset } from "./case.js";

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

export type GroundTruthDataset = z.infer<typeof groundTruthDatasetSchema>;
