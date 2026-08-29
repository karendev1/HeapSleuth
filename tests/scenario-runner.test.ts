import { describe, expect, it } from "vitest";

import {
  runMountUnmountCycles,
  type ScenarioDriver,
} from "../src/browser/scenario-runner.js";

describe("runMountUnmountCycles", () => {
  it("runs the same mount and unmount actions for every cycle", async () => {
    const actions: string[] = [];
    const driver: ScenarioDriver = {
      clickToggle: async () => {
        actions.push("click");
      },
      waitForPanel: async (state) => {
        actions.push(`wait:${state}`);
      },
    };

    const result = await runMountUnmountCycles(driver, 2);

    expect(result).toEqual({ completedCycles: 2, actions: 4 });
    expect(actions).toEqual([
      "click",
      "wait:visible",
      "click",
      "wait:detached",
      "click",
      "wait:visible",
      "click",
      "wait:detached",
    ]);
  });

  it("rejects non-integer cycle counts", async () => {
    const driver: ScenarioDriver = {
      clickToggle: async () => undefined,
      waitForPanel: async () => undefined,
    };

    await expect(runMountUnmountCycles(driver, 1.5)).rejects.toThrow(
      "non-negative integer",
    );
  });
});
