import type { Page } from "playwright-core";

import type { ScenarioStep } from "../schemas/case.js";

export const TOGGLE_SELECTOR = "[data-heapsleuth-toggle]";
export const PANEL_SELECTOR = "[data-heapsleuth-panel]";

export type ScenarioDriver = {
  click: (selector: string) => Promise<void>;
  waitForPanel: (state: "visible" | "detached") => Promise<void>;
};

export type ScenarioResult = {
  completedCycles: number;
  actions: number;
};

export function createPlaywrightScenarioDriver(page: Page): ScenarioDriver {
  return {
    click: async (selector) => page.locator(selector).click(),
    waitForPanel: async (state) =>
      page.locator(PANEL_SELECTOR).waitFor({ state }),
  };
}

export async function runMountUnmountCycles(
  driver: ScenarioDriver,
  cycles: number,
  target = TOGGLE_SELECTOR,
): Promise<ScenarioResult> {
  if (!Number.isInteger(cycles) || cycles < 0) {
    throw new Error("Scenario cycles must be a non-negative integer.");
  }

  let completedCycles = 0;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await driver.click(target);
    await driver.waitForPanel("visible");
    await driver.click(target);
    await driver.waitForPanel("detached");
    completedCycles += 1;
  }

  return { completedCycles, actions: completedCycles * 2 };
}

export async function runScenario(
  driver: ScenarioDriver,
  scenario: readonly ScenarioStep[],
): Promise<ScenarioResult> {
  let completedCycles = 0;
  let actions = 0;

  for (const step of scenario) {
    const result = await runMountUnmountCycles(
      driver,
      step.repetitions,
      step.target,
    );
    completedCycles += result.completedCycles;
    actions += result.actions;
  }

  return { completedCycles, actions };
}
