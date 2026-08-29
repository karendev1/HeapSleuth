import {
  browserSpikeEvidenceSchema,
  type BrowserEvidenceSample,
  type BrowserSpikeEvidence,
} from "../schemas/browser-evidence.js";

export type SpikeObservation = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  adapter: BrowserSpikeEvidence["adapter"];
  benchmark: BrowserSpikeEvidence["benchmark"];
  scenario: BrowserSpikeEvidence["scenario"];
  baseline: BrowserEvidenceSample & { phase: "baseline" };
  final: BrowserEvidenceSample & { phase: "final" };
  eventType: string;
  limitations: string[];
};

export function buildBrowserSpikeEvidence(
  observation: SpikeObservation,
): BrowserSpikeEvidence {
  const targetEventListenerDelta =
    observation.final.targetEventListeners -
    observation.baseline.targetEventListeners;
  const survivedForcedGarbageCollection =
    targetEventListenerDelta >= observation.scenario.measuredCycles &&
    observation.final.activeTargetHandlers >=
      observation.final.targetEventListeners;

  return browserSpikeEvidenceSchema.parse({
    schemaVersion: 1,
    caseId: "event-listener",
    startedAt: observation.startedAt,
    completedAt: observation.completedAt,
    durationMs: observation.durationMs,
    adapter: observation.adapter,
    benchmark: observation.benchmark,
    scenario: observation.scenario,
    samples: {
      baseline: observation.baseline,
      final: observation.final,
    },
    deltas: {
      usedHeapBytes:
        observation.final.heapUsage.usedSize -
        observation.baseline.heapUsage.usedSize,
      backingStorageBytes:
        observation.final.heapUsage.backingStorageSize -
        observation.baseline.heapUsage.backingStorageSize,
      domNodes:
        observation.final.domCounters.nodes -
        observation.baseline.domCounters.nodes,
      domEventListeners:
        observation.final.domCounters.jsEventListeners -
        observation.baseline.domCounters.jsEventListeners,
      targetEventListeners: targetEventListenerDelta,
    },
    retention: {
      signal: "window-event-listener",
      eventType: observation.eventType,
      expectedMinimumListenerDelta: observation.scenario.measuredCycles,
      observedListenerDelta: targetEventListenerDelta,
      survivedForcedGarbageCollection,
      explanation:
        "CDP still reports the target listeners on window after forced garbage collection, and dispatching the target event invokes the retained handlers.",
    },
    limitations: observation.limitations,
  });
}
