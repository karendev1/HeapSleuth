import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";
import { browserSpikeEvidenceSchema } from "../schemas/browser-evidence.js";
import { startBenchmarkServer } from "./benchmark-server.js";
import { runDirectCdpSpike, TARGET_EVENT_TYPE } from "./direct-cdp.js";
import { buildBrowserSpikeEvidence } from "./evidence.js";

const WARMUP_CYCLES = 3;
const MEASURED_CYCLES = 20;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const startedAtDate = new Date();
  const benchmarkServer = await startBenchmarkServer();

  try {
    const run = await runDirectCdpSpike({
      origin: benchmarkServer.origin,
      headless: config.BROWSER_HEADLESS,
      warmupCycles: WARMUP_CYCLES,
      measuredCycles: MEASURED_CYCLES,
    });
    const completedAtDate = new Date();
    const evidence = buildBrowserSpikeEvidence({
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAtDate.toISOString(),
      durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
      adapter: run.adapter,
      benchmark: {
        origin: benchmarkServer.origin,
        route: run.route,
      },
      scenario: {
        warmupCycles: WARMUP_CYCLES,
        measuredCycles: MEASURED_CYCLES,
        completedWarmupCycles: run.warmup.completedCycles,
        completedMeasuredCycles: run.measured.completedCycles,
        actionsPerCycle: 2,
      },
      baseline: run.baseline,
      final: run.final,
      eventType: TARGET_EVENT_TYPE,
      limitations: [
        "The spike covers one synthetic, benchmark-controlled event-listener leak only.",
        "JavaScript heap size is engine-sensitive; the retained listener signal is the primary evidence.",
        "The spike records bounded CDP summaries and does not create or parse a full heap snapshot.",
      ],
    });

    const outputPath = path.resolve(
      projectRoot,
      config.RESULTS_DIR,
      "spike",
      evidence.caseId,
      "evidence.json",
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );

    const savedPayload: unknown = JSON.parse(
      await readFile(outputPath, "utf8"),
    );
    const savedEvidence = browserSpikeEvidenceSchema.parse(savedPayload);
    process.stdout.write(
      `${JSON.stringify(
        {
          outputPath,
          adapter: savedEvidence.adapter,
          scenario: savedEvidence.scenario,
          deltas: savedEvidence.deltas,
          retention: savedEvidence.retention,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await benchmarkServer.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
