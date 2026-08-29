import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { BenchmarkCase } from "../schemas/case.js";
import type { InvestigatorBrowserEvidence } from "../schemas/investigator.js";
import type { InvestigatorSourceFile } from "./source-tools.js";

export const INVESTIGATOR_PROMPT_VERSION = "investigator-v1";

const defaultProjectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function loadInvestigatorPromptTemplate(
  projectRoot = defaultProjectRoot,
): Promise<string> {
  return readFile(`${projectRoot}/src/prompts/investigator.md`, "utf8");
}

export function buildInvestigatorPrompt(input: {
  template: string;
  benchmarkCase: BenchmarkCase;
  sources: readonly InvestigatorSourceFile[];
  browserEvidence: InvestigatorBrowserEvidence;
}): string {
  const sourceSections = input.sources
    .map(
      (source) =>
        `<source path=${JSON.stringify(source.path)}>\n${source.content}\n</source>`,
    )
    .join("\n\n");

  return `${input.template.trim()}\n\n---\n\nPrompt version: ${INVESTIGATOR_PROMPT_VERSION}\nCase ID: ${input.benchmarkCase.id}\nNeutral description: ${input.benchmarkCase.description}\nRecorded scenario:\n${JSON.stringify(input.benchmarkCase.scenario, null, 2)}\n\nAllowed source files:\n${sourceSections}\n\nValidated browser evidence:\n${JSON.stringify(input.browserEvidence, null, 2)}\n`;
}

export function hashInvestigatorValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
