import { describe, expect, it } from "vitest";

import { parseInvestigatorArguments } from "../src/investigator/arguments.js";

describe("Investigator arguments", () => {
  it("requires and parses one explicit case", () => {
    expect(parseInvestigatorArguments(["--case", "event-listener"])).toEqual({
      caseId: "event-listener",
    });
    expect(parseInvestigatorArguments(["--case=healthy-control"])).toEqual({
      caseId: "healthy-control",
    });
  });

  it("rejects batch, incomplete, and unrelated invocations", () => {
    expect(() => parseInvestigatorArguments([])).toThrow("Usage");
    expect(() => parseInvestigatorArguments(["--case"])).toThrow("Usage");
    expect(() => parseInvestigatorArguments(["--all"])).toThrow("Usage");
  });
});
