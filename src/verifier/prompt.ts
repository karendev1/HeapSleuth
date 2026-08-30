import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { BenchmarkCase } from "../schemas/case.js";
import type { Diagnosis } from "../schemas/diagnosis.js";
import type { InvestigatorBrowserEvidence } from "../schemas/investigator.js";
import { hashInvestigatorValue } from "../investigator/prompt.js";
import type { InvestigatorSourceFile } from "../investigator/source-tools.js";

export const VERIFIER_PROMPT_VERSION = "verifier-v1";

const defaultProjectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function loadVerifierPromptTemplate(
  projectRoot = defaultProjectRoot,
): Promise<string> {
  return readFile(`${projectRoot}/src/prompts/verifier.md`, "utf8");
}

export function buildVerifierPrompt(input: {
  template: string;
  benchmarkCase: BenchmarkCase;
  sources: readonly InvestigatorSourceFile[];
  browserEvidence: InvestigatorBrowserEvidence;
  investigatorDiagnosis: Diagnosis;
}): string {
  const sourceSections = input.sources
    .map(
      (source) =>
        `<source path=${JSON.stringify(source.path)}>\n${source.content}\n</source>`,
    )
    .join("\n\n");

  return `${input.template.trim()}\n\n---\n\nPrompt version: ${VERIFIER_PROMPT_VERSION}\nCase ID: ${input.benchmarkCase.id}\nNeutral description: ${input.benchmarkCase.description}\nRecorded scenario:\n${JSON.stringify(input.benchmarkCase.scenario, null, 2)}\n\nAllowed source files:\n${sourceSections}\n\nValidated current-run browser evidence:\n${JSON.stringify(input.browserEvidence, null, 2)}\n\nValidated Investigator diagnosis to challenge:\n${JSON.stringify(input.investigatorDiagnosis, null, 2)}\n`;
}

export { hashInvestigatorValue as hashVerifierValue };
