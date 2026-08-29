import { describe, expect, it } from "vitest";

import {
  InvestigatorOutputError,
  parseInvestigatorDiagnosis,
} from "../src/investigator/validation.js";

function diagnosis(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    caseId: "event-listener",
    verdict: "leak",
    mechanism: "A window listener retains its closure after unmount.",
    rootCause: {
      file: "benchmark/src/cases/EventListenerCase.tsx",
      symbol: "EventListenerCase",
    },
    evidence: [
      { source: "runtime", claim: "Three resources remain retained after GC." },
      { source: "source", claim: "The effect registers without cleanup." },
    ],
    confidence: 0.9,
    recommendedFix: "Remove the listener in the effect cleanup.",
    limitations: ["The case is synthetic."],
    ...overrides,
  });
}

const validationInput = {
  expectedCaseId: "event-listener",
  allowedSourcePaths: ["benchmark/src/cases/EventListenerCase.tsx"],
  availableEvidenceSources: new Set(["runtime", "heap", "source"] as const),
};

describe("Investigator output validation", () => {
  it("accepts a grounded diagnosis", () => {
    expect(
      parseInvestigatorDiagnosis({
        ...validationInput,
        text: diagnosis(),
      }).verdict,
    ).toBe("leak");
  });

  it("fails closed on malformed JSON and case mismatches", () => {
    expect(() =>
      parseInvestigatorDiagnosis({ ...validationInput, text: "not-json" }),
    ).toThrow(InvestigatorOutputError);
    expect(() =>
      parseInvestigatorDiagnosis({
        ...validationInput,
        text: diagnosis({ caseId: "healthy-control" }),
      }),
    ).toThrow("instead of event-listener");
  });

  it("rejects unlisted root-cause files and unavailable evidence", () => {
    expect(() =>
      parseInvestigatorDiagnosis({
        ...validationInput,
        text: diagnosis({
          rootCause: { file: "dataset/ground-truth.json", symbol: "answer" },
        }),
      }),
    ).toThrow("unlisted root-cause file");
    expect(() =>
      parseInvestigatorDiagnosis({
        ...validationInput,
        text: diagnosis({
          evidence: [{ source: "console", claim: "An error was logged." }],
        }),
      }),
    ).toThrow("unavailable console evidence");
  });
});
