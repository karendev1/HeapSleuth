import { describe, expect, it } from "vitest";

import { investigatorBrowserEvidenceSchema } from "../src/schemas/investigator.js";
import { createInvestigatorEvidence } from "./investigator-test-fixture.js";

describe("Investigator browser evidence", () => {
  it("accepts internally consistent leak and healthy-control evidence", () => {
    expect(
      investigatorBrowserEvidenceSchema.parse(
        createInvestigatorEvidence("event-listener", true),
      ).deltas.retainedResources,
    ).toBe(3);
    expect(
      investigatorBrowserEvidenceSchema.parse(
        createInvestigatorEvidence("healthy-control", false),
      ).deltas.releasedResources,
    ).toBe(3);
  });

  it("rejects fabricated deltas and incomplete scenarios", () => {
    const evidence = createInvestigatorEvidence();
    expect(() =>
      investigatorBrowserEvidenceSchema.parse({
        ...evidence,
        deltas: { ...evidence.deltas, retainedResources: 99 },
      }),
    ).toThrow("retainedResources does not match");
    expect(() =>
      investigatorBrowserEvidenceSchema.parse({
        ...evidence,
        scenario: { ...evidence.scenario, completedMeasuredCycles: 2 },
      }),
    ).toThrow("measured scenario did not complete");
  });
});
