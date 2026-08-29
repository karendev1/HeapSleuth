import { setTimeout as delay } from "node:timers/promises";

import { chromium, type CDPSession, type Page } from "playwright-core";
import { z } from "zod";

import { loadConfig } from "../config.js";
import { loadBenchmarkCases } from "../dataset/load-cases.js";
import { startBenchmarkServer } from "./benchmark-server.js";
import { findBrowserExecutable } from "./browser-executable.js";
import {
  createPlaywrightScenarioDriver,
  runScenario,
} from "./scenario-runner.js";

const READY_SELECTOR = '[data-heapsleuth-ready="true"]';

const runtimeStateSchema = z.object({
  createdInstances: z.number().int().nonnegative(),
  activeResources: z.number().int().nonnegative(),
  retainedResources: z.number().int().nonnegative(),
  releasedResources: z.number().int().nonnegative(),
  invocations: z.number().int().nonnegative(),
  checksum: z.number().int().nonnegative(),
});

const evaluatedStateSchema = z.object({
  result: z.object({ value: runtimeStateSchema }),
});

async function forceGarbageCollection(cdp: CDPSession): Promise<void> {
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(25);
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(25);
}

async function readRuntimeState(cdp: CDPSession, caseId: string) {
  const response = evaluatedStateSchema.parse(
    await cdp.send("Runtime.evaluate", {
      expression: `window.__HEAPSLEUTH_CASE_STATE__?.[${JSON.stringify(caseId)}]`,
      returnByValue: true,
    }),
  );
  return response.result.value;
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const cases = await loadBenchmarkCases();
  const executable = await findBrowserExecutable();
  const server = await startBenchmarkServer();
  const browser = await chromium.launch({
    executablePath: executable.path,
    headless: config.BROWSER_HEADLESS,
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  try {
    const indexContext = await browser.newContext();
    try {
      const indexPage = await indexContext.newPage();
      const errors = capturePageErrors(indexPage);
      await indexPage.goto(server.origin, { waitUntil: "networkidle" });
      await indexPage
        .locator('[data-heapsleuth-index="true"]')
        .waitFor({ state: "visible" });
      const indexedCaseIds = await indexPage
        .locator("[data-heapsleuth-case-link]")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("data-heapsleuth-case-link")),
        );
      if (
        JSON.stringify(indexedCaseIds) !==
        JSON.stringify(cases.map(({ id }) => id))
      ) {
        throw new Error("Benchmark index does not list every dataset case.");
      }
      if (errors.length > 0) {
        throw new Error(`Benchmark index emitted errors: ${errors.join("; ")}`);
      }
    } finally {
      await indexContext.close();
    }

    const caseResults = [];
    for (const benchmarkCase of cases) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const errors = capturePageErrors(page);
        const cdp = await context.newCDPSession(page);
        await cdp.send("HeapProfiler.enable");
        await page.goto(`${server.origin}${benchmarkCase.route}`, {
          waitUntil: "networkidle",
        });
        const ready = page.locator(READY_SELECTOR);
        await ready.waitFor({ state: "visible" });
        if (
          (await ready.getAttribute("data-heapsleuth-case-id")) !==
          benchmarkCase.id
        ) {
          throw new Error(`Route identity mismatch for ${benchmarkCase.id}.`);
        }

        const scenario = await runScenario(
          createPlaywrightScenarioDriver(page),
          benchmarkCase.scenario,
        );
        await forceGarbageCollection(cdp);
        const state = await readRuntimeState(cdp, benchmarkCase.id);
        const expectedCycles = benchmarkCase.scenario.reduce(
          (total, step) => total + step.repetitions,
          0,
        );

        if (
          scenario.completedCycles !== expectedCycles ||
          scenario.actions !== expectedCycles * 2 ||
          state.createdInstances !== expectedCycles
        ) {
          throw new Error(
            `Scenario execution mismatch for ${benchmarkCase.id}.`,
          );
        }
        if (errors.length > 0) {
          throw new Error(
            `${benchmarkCase.id} emitted browser errors: ${errors.join("; ")}`,
          );
        }
        if (
          benchmarkCase.id === "healthy-control" &&
          (state.activeResources !== 0 ||
            state.retainedResources !== 0 ||
            state.releasedResources !== expectedCycles)
        ) {
          throw new Error("Healthy control did not release every resource.");
        }

        caseResults.push({
          caseId: benchmarkCase.id,
          route: benchmarkCase.route,
          scenario,
          garbageCollection: "forced-twice",
          runtimeState: state,
          browserErrors: errors,
          passed: true,
        });
      } finally {
        await context.close();
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          adapter: {
            kind: "direct-cdp",
            browserFamily: executable.family,
            browserVersion: browser.version(),
          },
          index: { caseCount: cases.length, passed: true },
          cases: caseResults,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
