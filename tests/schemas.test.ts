import { describe, expect, it } from "vitest";

import {
  diagnosisSchema,
  trajectoryEventSchema,
} from "../src/schemas/index.js";

describe("diagnosisSchema", () => {
  it("accepts a grounded leak diagnosis", () => {
    const diagnosis = diagnosisSchema.parse({
      caseId: "event-listener",
      verdict: "leak",
      mechanism: "event_listener_without_cleanup",
      rootCause: {
        file: "benchmark/src/cases/EventListener.tsx",
        symbol: "EventListenerCase",
      },
      evidence: [
        {
          source: "runtime",
          claim: "Listener count grows after every completed cycle.",
        },
      ],
      confidence: 0.9,
      recommendedFix: "Remove the listener during effect cleanup.",
      limitations: [],
    });

    expect(diagnosis.verdict).toBe("leak");
  });

  it("rejects confidence outside the supported range", () => {
    expect(() =>
      diagnosisSchema.parse({
        caseId: "event-listener",
        verdict: "inconclusive",
        mechanism: null,
        rootCause: null,
        evidence: [],
        confidence: 1.1,
        recommendedFix: null,
        limitations: ["Insufficient runtime evidence."],
      }),
    ).toThrow();
  });
});

describe("trajectoryEventSchema", () => {
  it("rejects private-reasoning event types", () => {
    expect(() =>
      trajectoryEventSchema.parse({
        timestamp: "2026-08-28T12:00:00.000Z",
        caseId: "event-listener",
        agent: "investigator",
        type: "private-reasoning",
        summary: "Hidden reasoning content.",
      }),
    ).toThrow();
  });
});
