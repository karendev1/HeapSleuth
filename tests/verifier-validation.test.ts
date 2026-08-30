import { describe, expect, it } from "vitest";

import type { Diagnosis } from "../src/schemas/diagnosis.js";
import {
  parseVerifierOutput,
  resolveVerifiedDiagnosis,
  VerifierOutputError,
} from "../src/verifier/validation.js";

const availableEvidenceSources = new Set([
  "runtime",
  "heap",
  "source",
  "console",
] as const);

function diagnosis(
  input: {
    caseId?: string;
    verdict?: Diagnosis["verdict"];
    file?: string | null;
  } = {},
): Diagnosis {
  const file =
    input.file === undefined
      ? "benchmark/src/cases/HealthyControlCase.tsx"
      : input.file;
  return {
    caseId: input.caseId ?? "healthy-control",
    verdict: input.verdict ?? "leak",
    mechanism:
      input.verdict === "inconclusive"
        ? null
        : "The supplied observations were interpreted as retained state.",
    rootCause: file === null ? null : { file, symbol: "HealthyControlCase" },
    evidence: [
      { source: "runtime", claim: "The current run reported its final state." },
      { source: "source", claim: "The allowed source was inspected." },
    ],
    confidence: input.verdict === "inconclusive" ? 0.35 : 0.8,
    recommendedFix: input.verdict === "inconclusive" ? null : "Review cleanup.",
    limitations: ["The conclusion is limited to the supplied current run."],
  };
}

function parse(payload: unknown) {
  return parseVerifierOutput({
    text: JSON.stringify(payload),
    expectedCaseId: "healthy-control",
    allowedSourcePaths: ["benchmark/src/cases/HealthyControlCase.tsx"],
    availableEvidenceSources,
  });
}

describe("Verifier validation and resolution", () => {
  it("accepts a supported diagnosis without changing it", () => {
    const original = diagnosis();
    const verification = parse({
      decision: "accept",
      issues: [],
      revisedDiagnosis: null,
      verificationSummary: "The original conclusion is adequately grounded.",
    });

    expect(resolveVerifiedDiagnosis(original, verification)).toBe(original);
  });

  it("revises a deliberate healthy-control false positive", () => {
    const original = diagnosis();
    const revised = diagnosis({ verdict: "no-leak", file: null });
    const verification = parse({
      decision: "revise",
      issues: [
        "The original leak verdict is contradicted by released current-run resources.",
      ],
      revisedDiagnosis: revised,
      verificationSummary:
        "The bounded evidence supports no leak, not the Investigator false positive.",
    });

    expect(resolveVerifiedDiagnosis(original, verification)).toEqual(revised);
    expect(verification.decision).toBe("revise");
  });

  it("returns inconclusive for deliberately weak evidence", () => {
    const original = diagnosis();
    const revised = diagnosis({ verdict: "inconclusive", file: null });
    const verification = parse({
      decision: "inconclusive",
      issues: ["A heap-size delta without retention evidence is insufficient."],
      revisedDiagnosis: revised,
      verificationSummary:
        "The current evidence cannot distinguish a leak from temporary allocation.",
    });

    expect(resolveVerifiedDiagnosis(original, verification)).toEqual(revised);
    expect(verification.decision).toBe("inconclusive");
  });

  it.each([
    {
      decision: "accept",
      issues: ["Unresolved issue"],
      revisedDiagnosis: null,
      verificationSummary: "Invalid accept.",
    },
    {
      decision: "revise",
      issues: ["Revision required"],
      revisedDiagnosis: null,
      verificationSummary: "Missing revision.",
    },
    {
      decision: "inconclusive",
      issues: ["Evidence is weak"],
      revisedDiagnosis: diagnosis({ verdict: "no-leak", file: null }),
      verificationSummary: "Wrong revised verdict.",
    },
  ])("rejects inconsistent decision contracts", (payload) => {
    expect(() => parse(payload)).toThrow(VerifierOutputError);
  });

  it("rejects malformed JSON", () => {
    expect(() =>
      parseVerifierOutput({
        text: "not-json",
        expectedCaseId: "healthy-control",
        allowedSourcePaths: ["benchmark/src/cases/HealthyControlCase.tsx"],
        availableEvidenceSources,
      }),
    ).toThrow("not valid JSON");
  });

  it.each([
    diagnosis({ caseId: "event-listener", verdict: "no-leak", file: null }),
    diagnosis({
      verdict: "no-leak",
      file: "benchmark/src/cases/EventListenerCase.tsx",
    }),
    {
      ...diagnosis({ verdict: "no-leak", file: null }),
      evidence: [{ source: "network", claim: "Unavailable evidence source." }],
    },
  ])("rejects ungrounded revised diagnoses", (revisedDiagnosis) => {
    expect(() =>
      parse({
        decision: "revise",
        issues: ["The original diagnosis must change."],
        revisedDiagnosis,
        verificationSummary: "Deliberately invalid grounding.",
      }),
    ).toThrow(VerifierOutputError);
  });
});
