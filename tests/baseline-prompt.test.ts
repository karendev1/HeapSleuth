import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadBenchmarkCases } from "../src/dataset/load-cases.js";
import {
  BASELINE_PROMPT_VERSION,
  buildBaselinePrompt,
  hashPrompt,
  loadBaselinePromptTemplate,
} from "../src/baseline/prompt.js";
import {
  loadAllowedSourceFiles,
  SourceBoundaryError,
} from "../src/baseline/source-loader.js";
import { projectRoot } from "../src/baseline/runner.js";

describe("baseline prompt and source boundary", () => {
  it("constructs the same static prompt from only the listed case input", async () => {
    const cases = await loadBenchmarkCases();
    const benchmarkCase = cases[0];
    if (benchmarkCase === undefined) throw new Error("Dataset is empty.");

    const sources = await loadAllowedSourceFiles({
      projectRoot,
      allowedPaths: benchmarkCase.sourceFiles,
    });
    const template = await loadBaselinePromptTemplate(projectRoot);
    const input = {
      template,
      caseId: benchmarkCase.id,
      description: benchmarkCase.description,
      sources,
    };
    const first = buildBaselinePrompt(input);
    const second = buildBaselinePrompt(input);

    expect(first).toBe(second);
    expect(hashPrompt(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toContain(`Prompt version: ${BASELINE_PROMPT_VERSION}`);
    expect(first).toContain(`Case ID: ${benchmarkCase.id}`);
    expect(first).toContain(benchmarkCase.description);
    expect(first).toContain(benchmarkCase.sourceFiles[0]);
    expect(first).not.toContain("ground-truth");
    expect(first).not.toContain("acceptedMechanisms");
    expect(first).not.toContain("usedHeapBytes");
    expect(first).not.toContain("__HEAPSLEUTH_CASE_STATE__");
    expect(first).not.toContain("IntervalCase.tsx");
  });

  it("preserves requested source ordering", async () => {
    const requestedPaths = [".env.example", "package.json"];
    const sources = await loadAllowedSourceFiles({
      projectRoot,
      allowedPaths: requestedPaths,
      requestedPaths,
    });

    expect(sources.map(({ path }) => path)).toEqual(requestedPaths);
    expect(sources.every(({ byteCount }) => byteCount > 0)).toBe(true);
  });

  it("keeps evaluator and browser modules outside the baseline implementation", async () => {
    const baselineFiles = [
      "src/baseline/artifacts.ts",
      "src/baseline/prompt.ts",
      "src/baseline/run-baseline.ts",
      "src/baseline/runner.ts",
      "src/baseline/source-loader.ts",
      "src/model/model-provider.ts",
      "src/model/gemini-interactions-provider.ts",
    ];
    const implementation = (
      await Promise.all(
        baselineFiles.map((file) => readFile(`${projectRoot}/${file}`, "utf8")),
      )
    ).join("\n");

    expect(implementation).not.toContain("ground-truth.json");
    expect(implementation).not.toContain("dataset/ground-truth");
    expect(implementation).not.toContain('from "../browser/');
    expect(implementation).not.toContain("playwright");
  });

  it.each([
    {
      name: "absolute",
      allowedPaths: [projectRoot],
      requestedPaths: [projectRoot],
      message: "Absolute source paths",
    },
    {
      name: "traversing",
      allowedPaths: ["../outside.ts"],
      requestedPaths: ["../outside.ts"],
      message: "leaves the project workspace",
    },
    {
      name: "unlisted",
      allowedPaths: ["package.json"],
      requestedPaths: [".env.example"],
      message: "not listed",
    },
    {
      name: "missing",
      allowedPaths: ["missing-source.ts"],
      requestedPaths: ["missing-source.ts"],
      message: "does not exist",
    },
    {
      name: "directory",
      allowedPaths: ["benchmark/src/cases"],
      requestedPaths: ["benchmark/src/cases"],
      message: "not a file",
    },
  ])("rejects $name source access", async (testCase) => {
    await expect(
      loadAllowedSourceFiles({
        projectRoot,
        allowedPaths: testCase.allowedPaths,
        requestedPaths: testCase.requestedPaths,
      }),
    ).rejects.toThrow(testCase.message);
    await expect(
      loadAllowedSourceFiles({
        projectRoot,
        allowedPaths: testCase.allowedPaths,
        requestedPaths: testCase.requestedPaths,
      }),
    ).rejects.toBeInstanceOf(SourceBoundaryError);
  });
});
