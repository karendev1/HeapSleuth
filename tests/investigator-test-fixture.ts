import {
  investigatorBrowserEvidenceSchema,
  type InvestigatorBrowserEvidence,
} from "../src/schemas/investigator.js";

export function createInvestigatorEvidence(
  caseId = "event-listener",
  retained = true,
): InvestigatorBrowserEvidence {
  const baselineRuntime = {
    createdInstances: 0,
    activeResources: 0,
    retainedResources: 0,
    releasedResources: 0,
    invocations: 0,
    checksum: 0,
  };
  const finalRuntime = {
    createdInstances: 3,
    activeResources: retained ? 3 : 0,
    retainedResources: retained ? 3 : 0,
    releasedResources: retained ? 0 : 3,
    invocations: 0,
    checksum: 0,
  };
  const baselineListeners = {
    total: 1,
    byType: { load: 1 },
    locations: [
      {
        type: "load",
        scriptId: "1",
        lineNumber: 1,
        columnNumber: 1,
      },
    ],
  };
  const retainedLocations = Array.from({ length: 3 }, (_, index) => ({
    type: "heapsleuth:notification",
    scriptId: "2",
    lineNumber: 20 + index,
    columnNumber: 1,
  }));
  const finalListeners = retained
    ? {
        total: 4,
        byType: { load: 1, "heapsleuth:notification": 3 },
        locations: [...baselineListeners.locations, ...retainedLocations],
      }
    : baselineListeners;

  return investigatorBrowserEvidenceSchema.parse({
    schemaVersion: 1,
    caseId,
    startedAt: "2026-08-29T12:00:00.000Z",
    completedAt: "2026-08-29T12:00:01.000Z",
    durationMs: 1_000,
    adapter: {
      kind: "direct-cdp",
      browserFamily: "chrome",
      browserVersion: "test-browser",
    },
    benchmark: { route: `/cases/${caseId}` },
    scenario: {
      warmupCycles: 1,
      measuredCycles: 3,
      completedWarmupCycles: 1,
      completedMeasuredCycles: 3,
      measuredActions: 6,
    },
    samples: {
      baseline: {
        phase: "baseline",
        capturedAt: "2026-08-29T12:00:00.300Z",
        garbageCollection: {
          forced: true,
          method: "HeapProfiler.collectGarbage",
          passes: 2,
        },
        heapUsage: {
          usedSize: 1_000,
          totalSize: 2_000,
          embedderHeapUsedSize: 100,
          backingStorageSize: 100,
        },
        domCounters: { documents: 1, nodes: 10, jsEventListeners: 5 },
        runtimeState: baselineRuntime,
      },
      final: {
        phase: "final",
        capturedAt: "2026-08-29T12:00:00.900Z",
        garbageCollection: {
          forced: true,
          method: "HeapProfiler.collectGarbage",
          passes: 2,
        },
        heapUsage: {
          usedSize: retained ? 1_300 : 1_010,
          totalSize: 2_000,
          embedderHeapUsedSize: 100,
          backingStorageSize: retained ? 786_532 : 100,
        },
        domCounters: {
          documents: 1,
          nodes: 10,
          jsEventListeners: retained ? 8 : 5,
        },
        runtimeState: finalRuntime,
      },
    },
    deltas: {
      usedHeapBytes: retained ? 300 : 10,
      backingStorageBytes: retained ? 786_432 : 0,
      domNodes: 0,
      domEventListeners: retained ? 3 : 0,
      createdInstances: 3,
      activeResources: retained ? 3 : 0,
      retainedResources: retained ? 3 : 0,
      releasedResources: retained ? 0 : 3,
    },
    listeners: {
      baseline: baselineListeners,
      final: finalListeners,
      deltaByType: retained
        ? { load: 0, "heapsleuth:notification": 3 }
        : { load: 0 },
    },
    consoleEvents: [],
    limitations: ["Synthetic test fixture only."],
  });
}
