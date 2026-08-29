import { setTimeout as delay } from "node:timers/promises";

import { chromium, type CDPSession, type Page } from "playwright-core";
import { z } from "zod";

import type { BenchmarkCase } from "../schemas/case.js";
import {
  caseRuntimeStateSchema,
  investigatorBrowserEvidenceSchema,
  type InvestigatorBrowserEvidence,
} from "../schemas/investigator.js";
import { startBenchmarkServer } from "../browser/benchmark-server.js";
import { findBrowserExecutable } from "../browser/browser-executable.js";
import {
  createPlaywrightScenarioDriver,
  runScenario,
} from "../browser/scenario-runner.js";

const READY_SELECTOR = '[data-heapsleuth-ready="true"]';
const WARMUP_CYCLES = 1;

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

const evaluatedStateSchema = z.object({
  result: z.object({ value: caseRuntimeStateSchema }),
});

const windowObjectResponseSchema = z.object({
  result: z.object({ objectId: z.string().min(1) }),
});

const eventListenersResponseSchema = z.object({
  listeners: z.array(
    z.object({
      type: z.string().min(1),
      scriptId: z.string().min(1),
      lineNumber: z.number().int().nonnegative(),
      columnNumber: z.number().int().nonnegative(),
    }),
  ),
});

type ToolName =
  | "run_scenario"
  | "collect_memory_sample"
  | "get_heap_summary"
  | "read_console_events";

export type BrowserToolObservation = {
  type: "tool-call" | "tool-result";
  tool: ToolName;
  summary: string;
  data?: Record<string, unknown>;
};

export class BrowserEvidenceError extends Error {
  override readonly name = "BrowserEvidenceError";
}

type ConsoleEvent = InvestigatorBrowserEvidence["consoleEvents"][number];
type MemorySamplePayload = Omit<
  InvestigatorBrowserEvidence["samples"]["baseline"],
  "phase"
>;
type ListenerSummary = InvestigatorBrowserEvidence["listeners"]["baseline"];

function capturePageErrors(
  page: Page,
  phase: ConsoleEvent["phase"],
  events: ConsoleEvent[],
): void {
  page.on("pageerror", (error) => {
    events.push({
      phase,
      source: "pageerror",
      message: error.message.slice(0, 1_000),
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      events.push({
        phase,
        source: "console",
        message: message.text().slice(0, 1_000),
      });
    }
  });
}

async function navigateToCase(
  page: Page,
  origin: string,
  benchmarkCase: BenchmarkCase,
) {
  await page.goto(`${origin}${benchmarkCase.route}`, {
    waitUntil: "networkidle",
  });
  const ready = page.locator(READY_SELECTOR);
  await ready.waitFor({ state: "visible" });
  if (
    (await ready.getAttribute("data-heapsleuth-case-id")) !== benchmarkCase.id
  ) {
    throw new Error(`Route identity mismatch for ${benchmarkCase.id}.`);
  }
}

async function forceGarbageCollection(cdp: CDPSession): Promise<void> {
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(50);
  await cdp.send("HeapProfiler.collectGarbage");
  await delay(50);
}

async function collectMemorySample<Phase extends "baseline" | "final">(
  cdp: CDPSession,
  caseId: string,
  phase: Phase,
): Promise<MemorySamplePayload & { phase: Phase }> {
  await forceGarbageCollection(cdp);
  const [heapUsage, domCounters, runtimeStateResponse] = await Promise.all([
    cdp.send("Runtime.getHeapUsage"),
    cdp.send("Memory.getDOMCounters"),
    cdp.send("Runtime.evaluate", {
      expression: `window.__HEAPSLEUTH_CASE_STATE__?.[${JSON.stringify(
        caseId,
      )}] ?? { createdInstances: 0, activeResources: 0, retainedResources: 0, releasedResources: 0, invocations: 0, checksum: 0 }`,
      returnByValue: true,
    }),
  ]);

  return {
    phase,
    capturedAt: new Date().toISOString(),
    garbageCollection: {
      forced: true,
      method: "HeapProfiler.collectGarbage",
      passes: 2,
    },
    heapUsage: heapUsageResponseSchema.parse(heapUsage),
    domCounters: domCountersResponseSchema.parse(domCounters),
    runtimeState: evaluatedStateSchema.parse(runtimeStateResponse).result.value,
  } as MemorySamplePayload & { phase: Phase };
}

async function getWindowListenerSummary(
  cdp: CDPSession,
): Promise<ListenerSummary> {
  const windowObject = windowObjectResponseSchema.parse(
    await cdp.send("Runtime.evaluate", {
      expression: "window",
      objectGroup: "heapsleuth-investigator-listeners",
    }),
  );

  try {
    const response = eventListenersResponseSchema.parse(
      await cdp.send("DOMDebugger.getEventListeners", {
        objectId: windowObject.result.objectId,
        depth: 1,
      }),
    );
    const byType: Record<string, number> = {};
    for (const listener of response.listeners) {
      byType[listener.type] = (byType[listener.type] ?? 0) + 1;
    }

    return {
      total: response.listeners.length,
      byType: Object.fromEntries(
        Object.entries(byType).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      locations: response.listeners.map(
        ({ type, scriptId, lineNumber, columnNumber }) => ({
          type,
          scriptId,
          lineNumber,
          columnNumber,
        }),
      ),
    };
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", {
      objectGroup: "heapsleuth-investigator-listeners",
    });
  }
}

function listenerDeltas(
  baseline: ListenerSummary,
  final: ListenerSummary,
): Record<string, number> {
  const types = new Set([
    ...Object.keys(baseline.byType),
    ...Object.keys(final.byType),
  ]);
  return Object.fromEntries(
    [...types]
      .sort((left, right) => left.localeCompare(right))
      .map((type) => [
        type,
        (final.byType[type] ?? 0) - (baseline.byType[type] ?? 0),
      ]),
  );
}

function totalScenarioCycles(benchmarkCase: BenchmarkCase): number {
  return benchmarkCase.scenario.reduce(
    (total, step) => total + step.repetitions,
    0,
  );
}

export async function collectInvestigatorBrowserEvidence(input: {
  benchmarkCase: BenchmarkCase;
  headless: boolean;
  observe?: (observation: BrowserToolObservation) => void;
}): Promise<InvestigatorBrowserEvidence> {
  const startedAt = new Date();
  const events: ConsoleEvent[] = [];
  const emit = input.observe ?? (() => undefined);
  const executable = await findBrowserExecutable();
  const server = await startBenchmarkServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({
      executablePath: executable.path,
      headless: input.headless,
      args: [
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
      ],
    });
  } catch (error) {
    await server.close();
    const message = error instanceof Error ? error.message : String(error);
    throw new BrowserEvidenceError(
      `Browser launch failed for ${input.benchmarkCase.id}: ${message}`,
    );
  }

  try {
    emit({
      type: "tool-call",
      tool: "run_scenario",
      summary: "Run one isolated warm-up cycle.",
      data: { phase: "warmup", cycles: WARMUP_CYCLES },
    });
    const warmupContext = await browser.newContext();
    let completedWarmupCycles = 0;
    try {
      const page = await warmupContext.newPage();
      capturePageErrors(page, "warmup", events);
      await navigateToCase(page, server.origin, input.benchmarkCase);
      const warmupScenario = input.benchmarkCase.scenario.map((step) => ({
        ...step,
        repetitions: WARMUP_CYCLES,
      }));
      completedWarmupCycles = (
        await runScenario(createPlaywrightScenarioDriver(page), warmupScenario)
      ).completedCycles;
    } finally {
      await warmupContext.close();
    }
    emit({
      type: "tool-result",
      tool: "run_scenario",
      summary: "The isolated warm-up completed.",
      data: { phase: "warmup", completedCycles: completedWarmupCycles },
    });

    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      capturePageErrors(page, "measured", events);
      const cdp = await context.newCDPSession(page);
      await cdp.send("HeapProfiler.enable");
      await navigateToCase(page, server.origin, input.benchmarkCase);

      emit({
        type: "tool-call",
        tool: "collect_memory_sample",
        summary: "Force garbage collection and collect the baseline sample.",
        data: { phase: "baseline", garbageCollectionPasses: 2 },
      });
      const baseline = await collectMemorySample(
        cdp,
        input.benchmarkCase.id,
        "baseline",
      );
      const baselineListeners = await getWindowListenerSummary(cdp);
      emit({
        type: "tool-result",
        tool: "collect_memory_sample",
        summary: "The post-GC baseline sample was collected.",
        data: {
          phase: "baseline",
          usedHeapBytes: baseline.heapUsage.usedSize,
          domNodes: baseline.domCounters.nodes,
          domEventListeners: baseline.domCounters.jsEventListeners,
          caseResources: baseline.runtimeState,
        },
      });

      const measuredCycles = totalScenarioCycles(input.benchmarkCase);
      emit({
        type: "tool-call",
        tool: "run_scenario",
        summary: "Run the exact recorded measurement scenario.",
        data: { phase: "measured", cycles: measuredCycles },
      });
      const measured = await runScenario(
        createPlaywrightScenarioDriver(page),
        input.benchmarkCase.scenario,
      );
      emit({
        type: "tool-result",
        tool: "run_scenario",
        summary: "The recorded measurement scenario completed.",
        data: measured,
      });

      emit({
        type: "tool-call",
        tool: "collect_memory_sample",
        summary: "Force garbage collection and collect the final sample.",
        data: { phase: "final", garbageCollectionPasses: 2 },
      });
      const final = await collectMemorySample(
        cdp,
        input.benchmarkCase.id,
        "final",
      );
      const finalListeners = await getWindowListenerSummary(cdp);
      emit({
        type: "tool-result",
        tool: "collect_memory_sample",
        summary: "The post-GC final sample was collected.",
        data: {
          phase: "final",
          usedHeapBytes: final.heapUsage.usedSize,
          domNodes: final.domCounters.nodes,
          domEventListeners: final.domCounters.jsEventListeners,
          caseResources: final.runtimeState,
        },
      });

      const deltaByType = listenerDeltas(baselineListeners, finalListeners);
      emit({
        type: "tool-call",
        tool: "get_heap_summary",
        summary:
          "Summarize window listeners retained across the post-GC samples.",
      });
      emit({
        type: "tool-result",
        tool: "get_heap_summary",
        summary: "The bounded listener-retention summary was produced.",
        data: {
          baselineListeners: baselineListeners.total,
          finalListeners: finalListeners.total,
          deltaByType,
        },
      });

      emit({
        type: "tool-call",
        tool: "read_console_events",
        summary: "Read captured browser error events.",
      });
      emit({
        type: "tool-result",
        tool: "read_console_events",
        summary: `Captured ${events.length} browser error event(s).`,
        data: { count: events.length },
      });

      const completedAt = new Date();
      return investigatorBrowserEvidenceSchema.parse({
        schemaVersion: 1,
        caseId: input.benchmarkCase.id,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        adapter: {
          kind: "direct-cdp",
          browserFamily: executable.family,
          browserVersion: browser.version(),
        },
        benchmark: { route: input.benchmarkCase.route },
        scenario: {
          warmupCycles: WARMUP_CYCLES,
          measuredCycles,
          completedWarmupCycles,
          completedMeasuredCycles: measured.completedCycles,
          measuredActions: measured.actions,
        },
        samples: { baseline, final },
        deltas: {
          usedHeapBytes: final.heapUsage.usedSize - baseline.heapUsage.usedSize,
          backingStorageBytes:
            final.heapUsage.backingStorageSize -
            baseline.heapUsage.backingStorageSize,
          domNodes: final.domCounters.nodes - baseline.domCounters.nodes,
          domEventListeners:
            final.domCounters.jsEventListeners -
            baseline.domCounters.jsEventListeners,
          createdInstances:
            final.runtimeState.createdInstances -
            baseline.runtimeState.createdInstances,
          activeResources:
            final.runtimeState.activeResources -
            baseline.runtimeState.activeResources,
          retainedResources:
            final.runtimeState.retainedResources -
            baseline.runtimeState.retainedResources,
          releasedResources:
            final.runtimeState.releasedResources -
            baseline.runtimeState.releasedResources,
        },
        listeners: {
          baseline: baselineListeners,
          final: finalListeners,
          deltaByType,
        },
        consoleEvents: events,
        limitations: [
          "The evidence comes from a synthetic benchmark-controlled scenario, not an arbitrary production application.",
          "Heap-size deltas are engine-sensitive and must not be treated as leak proof without a retained post-GC signal.",
          "The bounded listener summary inspects listeners attached to window and does not replace a full heap snapshot or arbitrary retaining-path search.",
        ],
      });
    } finally {
      await context.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BrowserEvidenceError(
      `Browser evidence collection failed for ${input.benchmarkCase.id}: ${message}`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
