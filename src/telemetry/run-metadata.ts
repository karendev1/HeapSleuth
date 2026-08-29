import { randomUUID } from "node:crypto";

import {
  runMetadataSchema,
  type RunMetadata,
} from "../schemas/run-metadata.js";

type RunStart = Pick<RunMetadata, "approach" | "caseId"> & {
  model?: string;
};

export function createRunMetadata(
  input: RunStart,
  now: Date = new Date(),
): RunMetadata {
  return runMetadataSchema.parse({
    ...input,
    runId: randomUUID(),
    status: "running",
    startedAt: now.toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  });
}

export function completeRunMetadata(
  metadata: RunMetadata,
  status: "succeeded" | "failed",
  options: { completedAt?: Date; error?: string } = {},
): RunMetadata {
  const completedAt = options.completedAt ?? new Date();
  const durationMs = Math.max(
    0,
    completedAt.getTime() - new Date(metadata.startedAt).getTime(),
  );

  return runMetadataSchema.parse({
    ...metadata,
    status,
    completedAt: completedAt.toISOString(),
    durationMs,
    ...(options.error === undefined ? {} : { error: options.error }),
  });
}
