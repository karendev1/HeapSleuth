import { randomUUID } from "node:crypto";

import {
  runMetadataSchema,
  type RunMetadata,
} from "../schemas/run-metadata.js";

type RunStart = Pick<RunMetadata, "approach" | "caseId"> & {
  model?: string;
  provider?: string;
  promptVersion?: string;
  requestSettings?: RunMetadata["requestSettings"];
  attemptCount?: number;
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
  options: {
    completedAt?: Date;
    error?: string;
    errorCategory?: RunMetadata["errorCategory"];
    attemptCount?: number;
    usage?: RunMetadata["usage"];
    providerResponseId?: string;
  } = {},
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
    ...(options.errorCategory === undefined
      ? {}
      : { errorCategory: options.errorCategory }),
    ...(options.attemptCount === undefined
      ? {}
      : { attemptCount: options.attemptCount }),
    ...(options.usage === undefined ? {} : { usage: options.usage }),
    ...(options.providerResponseId === undefined
      ? {}
      : { providerResponseId: options.providerResponseId }),
  });
}
