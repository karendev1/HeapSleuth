import { describe, expect, it } from "vitest";

import { parseBaselineArguments } from "../src/baseline/arguments.js";

describe("baseline arguments", () => {
  it("supports batch and single-case forms", () => {
    expect(parseBaselineArguments([])).toEqual({});
    expect(parseBaselineArguments(["--case", "detached-dom"])).toEqual({
      caseId: "detached-dom",
    });
    expect(parseBaselineArguments(["--case=healthy-control"])).toEqual({
      caseId: "healthy-control",
    });
  });

  it("rejects incomplete or unrelated arguments", () => {
    expect(() => parseBaselineArguments(["--case"])).toThrow("Usage");
    expect(() => parseBaselineArguments(["--other"])).toThrow("Usage");
    expect(() => parseBaselineArguments(["--case="])).toThrow(
      "requires a case ID",
    );
  });
});
