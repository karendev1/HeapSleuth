import { loadConfig } from "./config.js";

const HELP_TEXT = `HeapSleuth

Runtime-evidence workflow for diagnosing frontend memory leaks.

Usage:
  npm run dev -- --help

Commands for the baseline, browser evidence workflow, and evaluation will be added
in their corresponding MVP execution blocks.
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
