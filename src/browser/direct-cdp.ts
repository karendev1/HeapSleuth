import { setTimeout as delay } from "node:timers/promises";

import { chromium, type CDPSession, type Page } from "playwright-core";
import { z } from "zod";

import {
  browserEvidenceSampleSchema,
  type BrowserEvidenceSample,
} from "../schemas/browser-evidence.js";
import { findBrowserExecutable } from "./browser-executable.js";
import {
  createPlaywrightScenarioDriver,
  runMountUnmountCycles,
} from "./scenario-runner.js";

const TARGET_EVENT_TYPE = "heapsleuth:notification";
const BENCHMARK_ROUTE = "/cases/event-listener";
const READY_SELECTOR = '[data-heapsleuth-ready="true"]';

const heapUsageResponseSchema = z.object({
  usedSize: z.number().nonnegative(),
  totalSize: z.number().nonnegative(),
  embedderHeapUsedSize: z.number().nonnegative(),
  backingStorageSize: z.number().nonnegative(),
});

const domCountersResponseSchema = z.object({
  documents: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
  jsEventListeners: z.number().int().nonnegative(),
});

const windowObjectResponseSchema = z.object({
  result: z.object({ objectId: z.string().min(1) }),
});

const eventListenersResponseSchema = z.object({
  listeners: z.array(
    z.object({
      type: z.string(),
      scriptId: z.string(),
      lineNumber: z.number().int().nonnegative(),
      columnNumber: z.number().int().nonnegative(),
    }),
  ),
});

const evaluatedNumberResponseSchema = z.object({
  result: z.object({ value: z.number().int().nonnegative() }),
});

export type DirectCdpRun = {
  adapter: {
    kind: "direct-cdp";
    browserFamily: "chrome" | "edge" | "chromium";
    browserVersion: string;
    executablePath: string;
  };
  route: string;
  warmup: { completedCycles: number; actions: number };
  measured: { completedCycles: number; actions: number };
  baseline: BrowserEvidenceSample & { phase: "baseline" };
  final: BrowserEvidenceSample & { phase: "final" };
};

async function getTargetListenerLocations(cdp: CDPSession) {
  const windowObject = windowObjectResponseSchema.parse(
    await cdp.send("Runtime.evaluate", {
      expression: "window",
      objectGroup: "heapsleuth-listeners",
    }),
  );

  try {
    const response = eventListenersResponseSchema.parse(
      await cdp.send("DOMDebugger.getEventListeners", {
        objectId: windowObject.result.objectId,
        depth: 1,
      }),
    );

    return response.listeners
      .filter((listener) => listener.type === TARGET_EVENT_TYPE)
      .map(({ scriptId, lineNumber, columnNumber }) => ({
        scriptId,
        lineNumber,
        columnNumber,
      }));
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", {
      objectGroup: "heapsleuth-listeners",
    });
  }
}

async function invokeRetainedHandlers(cdp: CDPSession): Promise<number> {
  const response = evaluatedNumberResponseSchema.parse(
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const state = window.__HEAPSLEUTH_EVENT_LISTENER_STATE__;
        if (!state) return 0;
        const before = state.handlerInvocations;
        window.dispatchEvent(new Event(${JSON.stringify(TARGET_EVENT_TYPE)}));
        return state.handlerInvocations - before;
      })()`,
      returnByValue: true,
    }),
  );

  return response.result.value;
}

async function collectAfterForcedGarbageCollection<
  Phase extends "baseline" | "final",
>(
  cdp: CDPSession,
  phase: Phase,
): Promise<BrowserEvidenceSample & { phase: Phase }> {
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(50);
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(50);

  const heapUsage = heapUsageResponseSchema.parse(
    await cdp.send("Runtime.getHeapUsage"),
  );
  const domCounters = domCountersResponseSchema.parse(
    await cdp.send("Memory.getDOMCounters"),
  );
  const listenerLocations = await getTargetListenerLocations(cdp);
  const activeTargetHandlers = await invokeRetainedHandlers(cdp);

  return browserEvidenceSampleSchema.parse({
    phase,
    capturedAt: new Date().toISOString(),
    garbageCollection: {
      forced: true,
      method: "HeapProfiler.collectGarbage",
    },
    heapUsage,
    domCounters,
    targetEventListeners: listenerLocations.length,
    activeTargetHandlers,
    listenerLocations,
  }) as BrowserEvidenceSample & { phase: Phase };
}

export async function runDirectCdpSpike(options: {
  origin: string;
  headless: boolean;
  warmupCycles: number;
  measuredCycles: number;
}): Promise<DirectCdpRun> {
  const executable = await findBrowserExecutable();
  const browser = await chromium.launch({
    executablePath: executable.path,
    headless: options.headless,
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  try {
    const context = await browser.newContext();
    const page: Page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    await page.goto(`${options.origin}${BENCHMARK_ROUTE}`, {
      waitUntil: "networkidle",
    });
    await page.locator(READY_SELECTOR).waitFor({ state: "visible" });

    const driver = createPlaywrightScenarioDriver(page);
    const warmup = await runMountUnmountCycles(driver, options.warmupCycles);
    const baseline = await collectAfterForcedGarbageCollection(cdp, "baseline");
    const measured = await runMountUnmountCycles(
      driver,
      options.measuredCycles,
    );
    const final = await collectAfterForcedGarbageCollection(cdp, "final");

    await context.close();

    return {
      adapter: {
        kind: "direct-cdp",
        browserFamily: executable.family,
        browserVersion: browser.version(),
        executablePath: executable.path,
      },
      route: BENCHMARK_ROUTE,
      warmup,
      measured,
      baseline,
      final,
    };
  } finally {
    await browser.close();
  }
}

export { TARGET_EVENT_TYPE };
