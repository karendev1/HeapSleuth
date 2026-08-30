import { z } from "zod";

import { caseIdSchema } from "./case.js";

export const modelUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const runErrorCategorySchema = z.enum([
  "configuration",
  "source-boundary",
  "browser-evidence",
  "provider",
  "malformed-json",
  "schema-validation",
  "persistence",
  "trajectory",
  "unknown",
]);

export const modelRequestSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).nullable(),
  maxOutputTokens: z.number().int().positive(),
  store: z.boolean(),
  toolsEnabled: z.boolean(),
  seed: z.number().int().optional(),
  thinkingLevel: z.enum(["minimal", "low", "medium", "high"]).optional(),
});

export const agentRunMetadataSchema = z.object({
  agent: z.enum(["investigator", "verifier"]),
  status: z.enum(["succeeded", "failed"]),
  promptVersion: z.string().min(1),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  providerResponseId: z.string().min(1).optional(),
  usage: modelUsageSchema.optional(),
  errorCategory: runErrorCategorySchema.optional(),
  error: z.string().min(1).optional(),
});

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
  provider: z.string().min(1).optional(),
  providerResponseId: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  requestSettings: modelRequestSettingsSchema.optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  usage: modelUsageSchema.optional(),
  errorCategory: runErrorCategorySchema.optional(),
  error: z.string().min(1).optional(),
  agentRuns: z.array(agentRunMetadataSchema).max(2).optional(),
});

export type RunMetadata = z.infer<typeof runMetadataSchema>;
export type AgentRunMetadata = z.infer<typeof agentRunMetadataSchema>;
