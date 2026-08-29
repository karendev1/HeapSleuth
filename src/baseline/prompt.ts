import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { LoadedSourceFile } from "./source-loader.js";

export const BASELINE_PROMPT_VERSION = "baseline-v1";

const defaultProjectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function loadBaselinePromptTemplate(
  projectRoot = defaultProjectRoot,
): Promise<string> {
  return readFile(`${projectRoot}/src/prompts/baseline.md`, "utf8");
}

export function buildBaselinePrompt(input: {
  template: string;
  caseId: string;
  description: string;
  sources: readonly LoadedSourceFile[];
}): string {
  const sourceSections = input.sources
    .map(
      (source) =>
        `## Source file: ${source.path}\n\n\`\`\`tsx\n${source.content}\n\`\`\``,
    )
    .join("\n\n");

  return `${input.template.trim()}\n\n---\n\nPrompt version: ${BASELINE_PROMPT_VERSION}\nCase ID: ${input.caseId}\nDescription: ${input.description}\n\n${sourceSections}\n`;
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}
