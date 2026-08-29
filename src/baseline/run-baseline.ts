import path from "node:path";

import { loadConfig } from "../config.js";
import { GeminiInteractionsProvider } from "../model/gemini-interactions-provider.js";
import { parseBaselineArguments } from "./arguments.js";
import { projectRoot, runBaselineBatch } from "./runner.js";

const BASELINE_INTER_CASE_DELAY_MS = 15_000;

async function main(): Promise<void> {
  const arguments_ = parseBaselineArguments(process.argv.slice(2));
  const config = loadConfig();

  if (config.GEMINI_API_KEY === undefined) {
    throw new Error(
      "GEMINI_API_KEY is required for an official baseline run. Configure it in .env, then rerun npm run baseline.",
    );
  }

  const provider = new GeminiInteractionsProvider(
    config.AI_MODEL,
    config.GEMINI_API_KEY,
  );
  const resultsRoot = path.resolve(projectRoot, config.RESULTS_DIR);
  const resultsRelativePath = path.relative(projectRoot, resultsRoot);
  if (
    resultsRelativePath === ".." ||
    resultsRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(resultsRelativePath)
  ) {
    throw new Error("RESULTS_DIR must resolve inside the project workspace.");
  }
  const execution = await runBaselineBatch({
    provider,
    resultsRoot,
    ...(arguments_.caseId === undefined
      ? {}
      : { selectedCaseId: arguments_.caseId }),
    sensitiveValues: [config.GEMINI_API_KEY],
    interCaseDelayMs: BASELINE_INTER_CASE_DELAY_MS,
  });

  for (const result of execution.cases) {
    const detail =
      result.status === "succeeded"
        ? "succeeded"
        : `failed (${result.errorCategory ?? "unknown"})`;
    process.stdout.write(`${result.caseId}: ${detail}\n`);
  }
  process.stdout.write(
    `Baseline complete: ${execution.successCount} succeeded, ${execution.failureCount} failed.\n`,
  );

  if (!execution.succeeded) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Baseline configuration or execution error: ${message}\n`,
  );
  process.exitCode = 1;
});
