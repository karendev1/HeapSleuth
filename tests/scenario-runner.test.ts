import { describe, expect, it } from "vitest";

import {
  runMountUnmountCycles,
  runScenario,
  type ScenarioDriver,
} from "../src/browser/scenario-runner.js";

describe("runMountUnmountCycles", () => {
  it("runs the same mount and unmount actions for every cycle", async () => {
    const actions: string[] = [];
    const driver: ScenarioDriver = {
      click: async (selector) => {
        actions.push(`click:${selector}`);
      },
      waitForPanel: async (state) => {
        actions.push(`wait:${state}`);
      },
    };

    const result = await runMountUnmountCycles(driver, 2);

    expect(result).toEqual({ completedCycles: 2, actions: 4 });
    expect(actions).toEqual([
      "click:[data-heapsleuth-toggle]",
      "wait:visible",
      "click:[data-heapsleuth-toggle]",
      "wait:detached",
      "click:[data-heapsleuth-toggle]",
      "wait:visible",
      "click:[data-heapsleuth-toggle]",
      "wait:detached",
    ]);
  });

  it("rejects non-integer cycle counts", async () => {
    const driver: ScenarioDriver = {
      click: async () => undefined,
      waitForPanel: async () => undefined,
    };

    await expect(runMountUnmountCycles(driver, 1.5)).rejects.toThrow(
      "non-negative integer",
    );
  });

  it("executes every recorded scenario step in order", async () => {
    const targets: string[] = [];
    const driver: ScenarioDriver = {
      click: async (selector) => {
        targets.push(selector);
      },
      waitForPanel: async () => undefined,
    };

    const result = await runScenario(driver, [
      {
        action: "mount-unmount",
        target: "[data-first]",
        repetitions: 1,
      },
      {
        action: "mount-unmount",
        target: "[data-second]",
        repetitions: 2,
      },
    ]);

    expect(result).toEqual({ completedCycles: 3, actions: 6 });
    expect(targets).toEqual([
      "[data-first]",
      "[data-first]",
      "[data-second]",
      "[data-second]",
      "[data-second]",
      "[data-second]",
    ]);
  });
});
