import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const modelVisibleFiles = [
  "src/baseline/prompt.ts",
  "src/baseline/runner.ts",
  "src/investigator/prompt.ts",
  "src/investigator/runner.ts",
  "src/investigator/browser-tools.ts",
  "src/investigator/source-tools.ts",
  "src/verifier/prompt.ts",
  "src/prompts/baseline.md",
  "src/prompts/investigator.md",
  "src/prompts/verifier.md",
];

describe("evaluator isolation", () => {
  it("keeps evaluator-only paths and fields out of model-visible code", async () => {
    for (const relativePath of modelVisibleFiles) {
      const text = await readFile(`${repositoryRoot}/${relativePath}`, "utf8");
      expect(text, relativePath).not.toContain("ground-truth");
      expect(text, relativePath).not.toContain("acceptedMechanisms");
      expect(text, relativePath).not.toContain("expectedVerdict");
      expect(text, relativePath).not.toContain("evaluatorNotes");
    }
  });
});
