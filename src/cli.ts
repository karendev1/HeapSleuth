import { loadConfig } from "./config.js";

const HELP_TEXT = `HeapSleuth

Runtime-evidence workflow for diagnosing frontend memory leaks.

Usage:
  npm run dev -- --help

Available model-backed command:
  npm run baseline [-- --case <case-id>]

Browser evidence and evaluation commands are added in their corresponding MVP
execution blocks.
`;

function main(arguments_: readonly string[]): void {
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const config = loadConfig();
  process.stdout.write(
    `HeapSleuth foundation is ready. Results directory: ${config.RESULTS_DIR}\n`,
  );
}

main(process.argv.slice(2));
