import { z } from "zod";

import { caseIdSchema } from "./case.js";
import { runErrorCategorySchema } from "./run-metadata.js";

export const caseRuntimeStateSchema = z.object({
  createdInstances: z.number().int().nonnegative(),
  activeResources: z.number().int().nonnegative(),
  retainedResources: z.number().int().nonnegative(),
  releasedResources: z.number().int().nonnegative(),
  invocations: z.number().int().nonnegative(),
  checksum: z.number().int().nonnegative(),
});

const heapUsageSchema = z.object({
  usedSize: z.number().nonnegative(),
  totalSize: z.number().nonnegative(),
  embedderHeapUsedSize: z.number().nonnegative(),
  backingStorageSize: z.number().nonnegative(),
});

const domCountersSchema = z.object({
  documents: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
  jsEventListeners: z.number().int().nonnegative(),
});

const memorySampleSchema = z.object({
  phase: z.enum(["baseline", "final"]),
  capturedAt: z.iso.datetime(),
  garbageCollection: z.object({
    forced: z.literal(true),
    method: z.literal("HeapProfiler.collectGarbage"),
    passes: z.literal(2),
  }),
  heapUsage: heapUsageSchema,
  domCounters: domCountersSchema,
  runtimeState: caseRuntimeStateSchema,
});

const listenerLocationSchema = z.object({
  type: z.string().min(1),
  scriptId: z.string().min(1),
  lineNumber: z.number().int().nonnegative(),
  columnNumber: z.number().int().nonnegative(),
});

const listenerSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byType: z.record(z.string().min(1), z.number().int().nonnegative()),
  locations: z.array(listenerLocationSchema),
});

export const investigatorBrowserEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    caseId: caseIdSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    adapter: z.object({
      kind: z.literal("direct-cdp"),
      browserFamily: z.enum(["chrome", "edge", "chromium"]),
      browserVersion: z.string().min(1),
    }),
    benchmark: z.object({ route: z.string().startsWith("/") }),
    scenario: z.object({
      warmupCycles: z.number().int().positive(),
      measuredCycles: z.number().int().positive(),
      completedWarmupCycles: z.number().int().nonnegative(),
      completedMeasuredCycles: z.number().int().nonnegative(),
      measuredActions: z.number().int().nonnegative(),
    }),
    samples: z.object({
      baseline: memorySampleSchema.extend({ phase: z.literal("baseline") }),
      final: memorySampleSchema.extend({ phase: z.literal("final") }),
    }),
    deltas: z.object({
      usedHeapBytes: z.number().finite(),
      backingStorageBytes: z.number().finite(),
      domNodes: z.number().int(),
      domEventListeners: z.number().int(),
      createdInstances: z.number().int(),
      activeResources: z.number().int(),
      retainedResources: z.number().int(),
      releasedResources: z.number().int(),
    }),
    listeners: z.object({
      baseline: listenerSummarySchema,
      final: listenerSummarySchema,
      deltaByType: z.record(z.string().min(1), z.number().int()),
    }),
    consoleEvents: z.array(
      z.object({
        phase: z.enum(["warmup", "measured"]),
        source: z.enum(["console", "pageerror"]),
        message: z.string().min(1).max(1_000),
      }),
    ),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .superRefine((evidence, context) => {
    const { baseline, final } = evidence.samples;
    const expectedDeltas = {
      usedHeapBytes: final.heapUsage.usedSize - baseline.heapUsage.usedSize,
      backingStorageBytes:
        final.heapUsage.backingStorageSize -
        baseline.heapUsage.backingStorageSize,
      domNodes: final.domCounters.nodes - baseline.domCounters.nodes,
      domEventListeners:
        final.domCounters.jsEventListeners -
        baseline.domCounters.jsEventListeners,
      createdInstances:
        final.runtimeState.createdInstances -
        baseline.runtimeState.createdInstances,
      activeResources:
        final.runtimeState.activeResources -
        baseline.runtimeState.activeResources,
      retainedResources:
        final.runtimeState.retainedResources -
        baseline.runtimeState.retainedResources,
      releasedResources:
        final.runtimeState.releasedResources -
        baseline.runtimeState.releasedResources,
    };

    for (const [field, expected] of Object.entries(expectedDeltas)) {
      if (evidence.deltas[field as keyof typeof expectedDeltas] !== expected) {
        context.addIssue({
          code: "custom",
          message: `${field} does not match the recorded samples.`,
          path: ["deltas", field],
        });
      }
    }

    if (
      evidence.scenario.completedWarmupCycles !== evidence.scenario.warmupCycles
    ) {
      context.addIssue({
        code: "custom",
        message: "The isolated warm-up did not complete.",
        path: ["scenario", "completedWarmupCycles"],
      });
    }
    if (
      evidence.scenario.completedMeasuredCycles !==
        evidence.scenario.measuredCycles ||
      evidence.scenario.measuredActions !== evidence.scenario.measuredCycles * 2
    ) {
      context.addIssue({
        code: "custom",
        message: "The measured scenario did not complete exactly.",
        path: ["scenario", "completedMeasuredCycles"],
      });
    }
    if (evidence.deltas.createdInstances !== evidence.scenario.measuredCycles) {
      context.addIssue({
        code: "custom",
        message: "Created instances do not match the measured cycles.",
        path: ["deltas", "createdInstances"],
      });
    }

    for (const phase of ["baseline", "final"] as const) {
      const summary = evidence.listeners[phase];
      if (summary.locations.length !== summary.total) {
        context.addIssue({
          code: "custom",
          message: "Listener locations do not match the listener total.",
          path: ["listeners", phase, "locations"],
        });
      }
      const counted = Object.values(summary.byType).reduce(
        (total, value) => total + value,
        0,
      );
      if (counted !== summary.total) {
        context.addIssue({
          code: "custom",
          message: "Listener type counts do not match the listener total.",
          path: ["listeners", phase, "byType"],
        });
      }
    }

    const listenerTypes = new Set([
      ...Object.keys(evidence.listeners.baseline.byType),
      ...Object.keys(evidence.listeners.final.byType),
    ]);
    for (const type of Object.keys(evidence.listeners.deltaByType)) {
      if (!listenerTypes.has(type)) {
        context.addIssue({
          code: "custom",
          message: `Listener delta contains an unobserved type: ${type}.`,
          path: ["listeners", "deltaByType", type],
        });
      }
    }
    for (const type of listenerTypes) {
      const expected =
        (evidence.listeners.final.byType[type] ?? 0) -
        (evidence.listeners.baseline.byType[type] ?? 0);
      if (evidence.listeners.deltaByType[type] !== expected) {
        context.addIssue({
          code: "custom",
          message: `Listener delta for ${type} does not match.`,
          path: ["listeners", "deltaByType", type],
        });
      }
    }
  });

export const investigatorInputManifestSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: caseIdSchema,
  approach: z.literal("solution"),
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  sources: z.array(
    z.object({
      path: z.string().min(1),
      byteCount: z.number().int().nonnegative().nullable(),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    }),
  ),
  browserEvidenceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  prompt: z.object({
    version: z.string().min(1),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  }),
});

export const investigatorFailureSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: caseIdSchema,
  status: z.literal("failed"),
  category: runErrorCategorySchema,
  message: z.string().min(1),
  attemptCount: z.number().int().nonnegative(),
});

export type CaseRuntimeState = z.infer<typeof caseRuntimeStateSchema>;
export type InvestigatorBrowserEvidence = z.infer<
  typeof investigatorBrowserEvidenceSchema
>;
export type InvestigatorInputManifest = z.infer<
  typeof investigatorInputManifestSchema
>;
export type InvestigatorFailure = z.infer<typeof investigatorFailureSchema>;
