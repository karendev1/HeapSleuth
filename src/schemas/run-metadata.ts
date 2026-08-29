import { z } from "zod";

import { caseIdSchema } from "./case.js";

export const runMetadataSchema = z.object({
  runId: z.uuid(),
  caseId: caseIdSchema,
  approach: z.enum(["baseline", "solution"]),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  runtime: z.object({
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    architecture: z.string().min(1),
  }),
  model: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export type RunMetadata = z.infer<typeof runMetadataSchema>;
