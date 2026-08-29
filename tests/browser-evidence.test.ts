import { describe, expect, it } from "vitest";

import { buildBrowserSpikeEvidence } from "../src/browser/evidence.js";
import { browserSpikeEvidenceSchema } from "../src/schemas/browser-evidence.js";

const baseSample = {
  capturedAt: "2026-08-28T12:00:01.000Z",
  garbageCollection: {
    forced: true as const,
    method: "HeapProfiler.collectGarbage" as const,
  },
  heapUsage: {
    usedSize: 1_000,
    totalSize: 2_000,
    embedderHeapUsedSize: 100,
    backingStorageSize: 300,
  },
  domCounters: { documents: 1, nodes: 10, jsEventListeners: 5 },
  targetEventListeners: 3,
  activeTargetHandlers: 3,
  listenerLocations: [
    { scriptId: "1", lineNumber: 10, columnNumber: 2 },
    { scriptId: "1", lineNumber: 10, columnNumber: 2 },
    { scriptId: "1", lineNumber: 10, columnNumber: 2 },
  ],
};

describe("browser spike evidence", () => {
  it("derives and validates the retained listener signal", () => {
    const evidence = buildBrowserSpikeEvidence({
      startedAt: "2026-08-28T12:00:00.000Z",
      completedAt: "2026-08-28T12:00:02.000Z",
      durationMs: 2_000,
      adapter: {
        kind: "direct-cdp",
        browserFamily: "chrome",
        browserVersion: "151.0.0.0",
        executablePath: "C:\\Program Files\\Google\\Chrome\\chrome.exe",
      },
      benchmark: {
        origin: "http://127.0.0.1:4173",
        route: "/cases/event-listener",
      },
      scenario: {
        warmupCycles: 3,
        measuredCycles: 2,
        completedWarmupCycles: 3,
        completedMeasuredCycles: 2,
        actionsPerCycle: 2,
      },
      baseline: { ...baseSample, phase: "baseline" },
      final: {
        ...baseSample,
        phase: "final",
        capturedAt: "2026-08-28T12:00:02.000Z",
        heapUsage: {
          ...baseSample.heapUsage,
          usedSize: 1_500,
          backingStorageSize: 800,
        },
        domCounters: {
          ...baseSample.domCounters,
          jsEventListeners: 7,
        },
        targetEventListeners: 5,
        activeTargetHandlers: 5,
        listenerLocations: [
          ...baseSample.listenerLocations,
          { scriptId: "1", lineNumber: 10, columnNumber: 2 },
          { scriptId: "1", lineNumber: 10, columnNumber: 2 },
        ],
      },
      eventType: "heapsleuth:notification",
      limitations: ["Synthetic case only."],
    });

    expect(evidence.deltas).toMatchObject({
      usedHeapBytes: 500,
      backingStorageBytes: 500,
      domEventListeners: 2,
      targetEventListeners: 2,
    });
    expect(evidence.retention.survivedForcedGarbageCollection).toBe(true);
  });

  it("rejects evidence with a delta that contradicts its samples", () => {
    const valid = buildBrowserSpikeEvidence({
      startedAt: "2026-08-28T12:00:00.000Z",
      completedAt: "2026-08-28T12:00:02.000Z",
      durationMs: 2_000,
      adapter: {
        kind: "direct-cdp",
        browserFamily: "chrome",
        browserVersion: "151.0.0.0",
        executablePath: "chrome.exe",
      },
      benchmark: {
        origin: "http://127.0.0.1:4173",
        route: "/cases/event-listener",
      },
      scenario: {
        warmupCycles: 0,
        measuredCycles: 1,
        completedWarmupCycles: 0,
        completedMeasuredCycles: 1,
        actionsPerCycle: 2,
      },
      baseline: { ...baseSample, phase: "baseline" },
      final: {
        ...baseSample,
        phase: "final",
        targetEventListeners: 4,
        activeTargetHandlers: 4,
        listenerLocations: [
          ...baseSample.listenerLocations,
          { scriptId: "1", lineNumber: 10, columnNumber: 2 },
        ],
      },
      eventType: "heapsleuth:notification",
      limitations: ["Synthetic case only."],
    });

    expect(() =>
      browserSpikeEvidenceSchema.parse({
        ...valid,
        deltas: { ...valid.deltas, targetEventListeners: 99 },
      }),
    ).toThrow();
  });
});
