import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadBenchmarkCases } from "../src/dataset/load-cases.js";
import {
  benchmarkDatasetSchema,
  groundTruthDatasetSchema,
  validateDatasetAlignment,
} from "../src/schemas/case.js";

const projectRoot = process.cwd();
const answerPath = path.join(projectRoot, "dataset", "ground-truth.json");

async function loadEvaluatorAnswers() {
  const payload: unknown = JSON.parse(await readFile(answerPath, "utf8"));
  return groundTruthDatasetSchema.parse(payload);
}

describe("benchmark dataset", () => {
  it("contains exactly eight unique deterministic P0 cases", async () => {
    const cases = await loadBenchmarkCases();

    expect(cases).toHaveLength(8);
    expect(new Set(cases.map(({ id }) => id)).size).toBe(8);
    expect(cases.map(({ id }) => id)).toEqual([
      "event-listener",
      "interval",
      "resize-observer",
      "detached-dom",
      "global-cache",
      "closure-registry",
      "event-bus",
      "healthy-control",
    ]);

    for (const benchmarkCase of cases) {
      expect(benchmarkCase.route).toBe(`/cases/${benchmarkCase.id}`);
      expect(benchmarkCase.scenario).toEqual([
        {
          action: "mount-unmount",
          target: "[data-heapsleuth-toggle]",
          repetitions: 3,
        },
      ]);
      await Promise.all(
        benchmarkCase.sourceFiles.map((sourceFile) =>
          access(path.join(projectRoot, sourceFile)),
        ),
      );
    }
  });

  it("keeps complete evaluator answers aligned and balanced", async () => {
    const cases = await loadBenchmarkCases();
    const answers = await loadEvaluatorAnswers();

    expect(() => validateDatasetAlignment(cases, answers)).not.toThrow();
    expect(
      answers.filter(({ expectedVerdict }) => expectedVerdict === "leak"),
    ).toHaveLength(7);
    expect(
      answers.filter(({ expectedVerdict }) => expectedVerdict === "no-leak"),
    ).toHaveLength(1);

    for (const answer of answers) {
      expect(answer.acceptedMechanisms.length).toBeGreaterThan(0);
      expect(answer.acceptedSourceFiles.length).toBeGreaterThan(0);
      expect(answer.acceptedSymbols.length).toBeGreaterThan(0);
      expect(answer.requiredEvidenceCategories.length).toBeGreaterThan(0);
    }
  });

  it("rejects duplicate case metadata and an invalid verdict balance", async () => {
    const cases = await loadBenchmarkCases();
    const answers = await loadEvaluatorAnswers();
    const firstCase = cases[0];

    if (firstCase === undefined) {
      throw new Error("The benchmark dataset is unexpectedly empty.");
    }

    const duplicateCasePayload = cases.map((benchmarkCase, index) =>
      index === 1
        ? {
            ...benchmarkCase,
            id: firstCase.id,
            route: firstCase.route,
          }
        : benchmarkCase,
    );
    const allLeakPayload = answers.map((answer) => ({
      ...answer,
      expectedVerdict: "leak",
    }));

    expect(benchmarkDatasetSchema.safeParse(duplicateCasePayload).success).toBe(
      false,
    );
    expect(groundTruthDatasetSchema.safeParse(allLeakPayload).success).toBe(
      false,
    );
  });

  it("does not expose evaluator answers from browser source", async () => {
    const browserFiles = [
      "benchmark/src/app/App.tsx",
      "benchmark/src/app/case-manifest.tsx",
      "benchmark/src/runtime-state.ts",
      "src/dataset/load-cases.ts",
    ];
    const browserSource = (
      await Promise.all(
        browserFiles.map((file) =>
          readFile(path.join(projectRoot, file), "utf8"),
        ),
      )
    ).join("\n");
    const answers = await loadEvaluatorAnswers();

    expect(browserSource).not.toContain("ground-truth");
    for (const answer of answers) {
      for (const mechanism of answer.acceptedMechanisms) {
        expect(browserSource).not.toContain(mechanism);
      }
    }
  });
});
