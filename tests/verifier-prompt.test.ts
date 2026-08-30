import { describe, expect, it } from "vitest";

import { buildVerifierPrompt } from "../src/verifier/prompt.js";
import { createInvestigatorEvidence } from "./investigator-test-fixture.js";

describe("Verifier prompt", () => {
  it("contains only bounded evidence and a diagnosis to challenge", () => {
    const prompt = buildVerifierPrompt({
      template:
        "Act as a skeptical reviewer. Return accept, revise, or inconclusive.",
      benchmarkCase: {
        id: "healthy-control",
        description: "Open and close a temporary summary repeatedly.",
        route: "/cases/healthy-control",
        sourceFiles: ["benchmark/src/cases/HealthyControlCase.tsx"],
        scenario: [
          {
            action: "mount-unmount",
            target: "[data-heapsleuth-toggle]",
            repetitions: 3,
          },
        ],
      },
      sources: [
        {
          path: "benchmark/src/cases/HealthyControlCase.tsx",
          content: "export function HealthyControlCase() { return null; }",
          byteCount: 54,
          sha256: "a".repeat(64),
        },
      ],
      browserEvidence: createInvestigatorEvidence("healthy-control", false),
      investigatorDiagnosis: {
        caseId: "healthy-control",
        verdict: "leak",
        mechanism: "A deliberately incorrect diagnosis for review.",
        rootCause: {
          file: "benchmark/src/cases/HealthyControlCase.tsx",
          symbol: "HealthyControlCase",
        },
        evidence: [
          { source: "runtime", claim: "Three instances were created." },
        ],
        confidence: 0.9,
        recommendedFix: "Add cleanup.",
        limitations: ["Deliberate test input."],
      },
    });

    expect(prompt).toContain("skeptical reviewer");
    expect(prompt).toContain("Validated current-run browser evidence");
    expect(prompt).toContain("Validated Investigator diagnosis to challenge");
    expect(prompt).toContain("HealthyControlCase");
    expect(prompt).not.toContain("acceptedMechanisms");
    expect(prompt).not.toContain("expectedVerdict");
    expect(prompt).not.toContain("dataset/ground-truth");
  });
});
