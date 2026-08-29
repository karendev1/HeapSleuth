import type { Page } from "playwright-core";

export const TOGGLE_SELECTOR = "[data-heapsleuth-toggle]";
export const PANEL_SELECTOR = "[data-heapsleuth-panel]";

export type ScenarioDriver = {
  clickToggle: () => Promise<void>;
  waitForPanel: (state: "visible" | "detached") => Promise<void>;
};

export type ScenarioResult = {
  completedCycles: number;
  actions: number;
};

export function createPlaywrightScenarioDriver(page: Page): ScenarioDriver {
  return {
    clickToggle: async () => page.locator(TOGGLE_SELECTOR).click(),
    waitForPanel: async (state) =>
      page.locator(PANEL_SELECTOR).waitFor({ state }),
  };
}

export async function runMountUnmountCycles(
  driver: ScenarioDriver,
  cycles: number,
): Promise<ScenarioResult> {
  if (!Number.isInteger(cycles) || cycles < 0) {
    throw new Error("Scenario cycles must be a non-negative integer.");
  }

  let completedCycles = 0;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await driver.clickToggle();
    await driver.waitForPanel("visible");
    await driver.clickToggle();
    await driver.waitForPanel("detached");
    completedCycles += 1;
  }

  return { completedCycles, actions: completedCycles * 2 };
}
