import path from "node:path";

import { loadConfig } from "../config.js";
import { GeminiInteractionsProvider } from "../model/gemini-interactions-provider.js";
import { parseInvestigatorArguments } from "./arguments.js";
import { projectRoot, runInvestigatorCase } from "./runner.js";

function resolveWorkspaceOutput(relativePath: string, label: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, resolved);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must resolve inside the project workspace.`);
  }
  return resolved;
}

async function main(): Promise<void> {
  const arguments_ = parseInvestigatorArguments(process.argv.slice(2));
  const config = loadConfig();
  if (config.GEMINI_API_KEY === undefined) {
    throw new Error(
      "GEMINI_API_KEY is required for an official Investigator run. Configure it in .env, then rerun the command.",
    );
  }

  const execution = await runInvestigatorCase({
    caseId: arguments_.caseId,
    provider: new GeminiInteractionsProvider(
      config.AI_MODEL,
      config.GEMINI_API_KEY,
    ),
    resultsRoot: resolveWorkspaceOutput(config.RESULTS_DIR, "RESULTS_DIR"),
    trajectoriesRoot: resolveWorkspaceOutput("trajectories", "Trajectory root"),
    headless: config.BROWSER_HEADLESS,
    sensitiveValues: [config.GEMINI_API_KEY],
  });

  const detail =
    execution.status === "succeeded"
      ? "succeeded"
      : `failed (${execution.errorCategory ?? "unknown"})`;
  process.stdout.write(`${execution.caseId}: ${detail}\n`);
  process.stdout.write(`Results: ${execution.outputDirectory}\n`);
  process.stdout.write(`Trajectory: ${execution.trajectoryPath}\n`);
  if (execution.browserEvidence !== undefined) {
    process.stdout.write(
      `${JSON.stringify(
        {
          samples: execution.browserEvidence.samples,
          deltas: execution.browserEvidence.deltas,
          listenerDeltaByType: execution.browserEvidence.listeners.deltaByType,
          consoleEventCount: execution.browserEvidence.consoleEvents.length,
        },
        null,
        2,
      )}\n`,
    );
  }
  if (execution.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Investigator configuration error: ${message}\n`);
  process.exitCode = 1;
});
