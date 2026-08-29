import { z } from "zod";

import { caseIdSchema } from "./case.js";

export const browserEvidenceSampleSchema = z.object({
  phase: z.enum(["baseline", "final"]),
  capturedAt: z.iso.datetime(),
  garbageCollection: z.object({
    forced: z.literal(true),
    method: z.literal("HeapProfiler.collectGarbage"),
  }),
  heapUsage: z.object({
    usedSize: z.number().nonnegative(),
    totalSize: z.number().nonnegative(),
    embedderHeapUsedSize: z.number().nonnegative(),
    backingStorageSize: z.number().nonnegative(),
  }),
  domCounters: z.object({
    documents: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    jsEventListeners: z.number().int().nonnegative(),
  }),
  targetEventListeners: z.number().int().nonnegative(),
  activeTargetHandlers: z.number().int().nonnegative(),
  listenerLocations: z.array(
    z.object({
      scriptId: z.string().min(1),
      lineNumber: z.number().int().nonnegative(),
      columnNumber: z.number().int().nonnegative(),
    }),
  ),
});

export const browserSpikeEvidenceSchema = z
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
      executablePath: z.string().min(1),
    }),
    benchmark: z.object({
      origin: z.url(),
      route: z.string().startsWith("/"),
    }),
    scenario: z.object({
      warmupCycles: z.number().int().nonnegative(),
      measuredCycles: z.number().int().positive(),
      completedWarmupCycles: z.number().int().nonnegative(),
      completedMeasuredCycles: z.number().int().nonnegative(),
      actionsPerCycle: z.literal(2),
    }),
    samples: z.object({
      baseline: browserEvidenceSampleSchema.extend({
        phase: z.literal("baseline"),
      }),
      final: browserEvidenceSampleSchema.extend({
        phase: z.literal("final"),
      }),
    }),
    deltas: z.object({
      usedHeapBytes: z.number().finite(),
      backingStorageBytes: z.number().finite(),
      domNodes: z.number().int(),
      domEventListeners: z.number().int(),
      targetEventListeners: z.number().int(),
    }),
    retention: z.object({
      signal: z.literal("window-event-listener"),
      eventType: z.string().min(1),
      expectedMinimumListenerDelta: z.number().int().positive(),
      observedListenerDelta: z.number().int(),
      survivedForcedGarbageCollection: z.boolean(),
      explanation: z.string().min(1),
    }),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .superRefine((evidence, context) => {
    const { baseline, final } = evidence.samples;

    for (const [phase, sample] of Object.entries(evidence.samples)) {
      if (sample.listenerLocations.length !== sample.targetEventListeners) {
        context.addIssue({
          code: "custom",
          message: "The listener locations do not match the target count.",
          path: ["samples", phase, "listenerLocations"],
        });
      }
    }

    const expectedDeltas = {
      usedHeapBytes: final.heapUsage.usedSize - baseline.heapUsage.usedSize,
      backingStorageBytes:
        final.heapUsage.backingStorageSize -
        baseline.heapUsage.backingStorageSize,
      domNodes: final.domCounters.nodes - baseline.domCounters.nodes,
      domEventListeners:
        final.domCounters.jsEventListeners -
        baseline.domCounters.jsEventListeners,
      targetEventListeners:
        final.targetEventListeners - baseline.targetEventListeners,
    };

    for (const [field, expected] of Object.entries(expectedDeltas)) {
      const actual = evidence.deltas[field as keyof typeof expectedDeltas];
      if (actual !== expected) {
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
        message: "The warm-up scenario did not complete.",
        path: ["scenario", "completedWarmupCycles"],
      });
    }

    if (
      evidence.scenario.completedMeasuredCycles !==
      evidence.scenario.measuredCycles
    ) {
      context.addIssue({
        code: "custom",
        message: "The measured scenario did not complete.",
        path: ["scenario", "completedMeasuredCycles"],
      });
    }

    const survived =
      evidence.deltas.targetEventListeners >=
        evidence.retention.expectedMinimumListenerDelta &&
      final.activeTargetHandlers >= final.targetEventListeners;

    if (
      evidence.retention.observedListenerDelta !==
      expectedDeltas.targetEventListeners
    ) {
      context.addIssue({
        code: "custom",
        message: "The retention delta does not match the listener samples.",
        path: ["retention", "observedListenerDelta"],
      });
    }

    if (evidence.retention.survivedForcedGarbageCollection !== survived) {
      context.addIssue({
        code: "custom",
        message: "The retention verdict does not match the recorded signals.",
        path: ["retention", "survivedForcedGarbageCollection"],
      });
    }
  });

export type BrowserEvidenceSample = z.infer<typeof browserEvidenceSampleSchema>;
export type BrowserSpikeEvidence = z.infer<typeof browserSpikeEvidenceSchema>;
