import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses safe defaults", () => {
    expect(loadConfig({})).toEqual({
      AI_MODEL: "gemini-3.6-flash",
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

  it("accepts a Gemini key and explicit model override", () => {
    expect(
      loadConfig({
        GEMINI_API_KEY: "test-secret",
        AI_MODEL: "gemini-test-model",
      }),
    ).toMatchObject({
      GEMINI_API_KEY: "test-secret",
      AI_MODEL: "gemini-test-model",
    });
  });

  it("treats blank model credentials as not configured", () => {
    expect(loadConfig({ GEMINI_API_KEY: "", AI_MODEL: "" })).toEqual({
      AI_MODEL: "gemini-3.6-flash",
      BROWSER_HEADLESS: true,
      RESULTS_DIR: "results",
    });
  });
});
