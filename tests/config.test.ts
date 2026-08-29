import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses safe defaults", () => {
    expect(loadConfig({})).toEqual({
      BROWSER_HEADLESS: true,
      RESULTS_DIR: "results",
    });
  });

  it("parses an explicit false boolean", () => {
    expect(
      loadConfig({ BROWSER_HEADLESS: "false", RESULTS_DIR: "artifacts" }),
    ).toMatchObject({
      BROWSER_HEADLESS: false,
      RESULTS_DIR: "artifacts",
    });
  });

  it("rejects ambiguous boolean values", () => {
    expect(() => loadConfig({ BROWSER_HEADLESS: "yes" })).toThrow();
  });
});
