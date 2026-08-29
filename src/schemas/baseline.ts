import { z } from "zod";

import { caseIdSchema } from "./case.js";
import { runErrorCategorySchema } from "./run-metadata.js";

export const baselineInputManifestSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: caseIdSchema,
  approach: z.literal("baseline"),
  description: z.string().min(1),
  sources: z.array(
    z.object({
      path: z.string().min(1),
      byteCount: z.number().int().nonnegative().nullable(),
    }),
  ),
  prompt: z.object({
    version: z.string().min(1),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  }),
});

export const baselineFailureSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: caseIdSchema,
  status: z.literal("failed"),
  category: runErrorCategorySchema,
  message: z.string().min(1),
  attemptCount: z.number().int().nonnegative(),
});

export type BaselineFailure = z.infer<typeof baselineFailureSchema>;
export type BaselineInputManifest = z.infer<typeof baselineInputManifestSchema>;
