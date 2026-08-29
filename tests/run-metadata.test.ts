import { describe, expect, it } from "vitest";

import {
  completeRunMetadata,
  createRunMetadata,
} from "../src/telemetry/run-metadata.js";

describe("run metadata", () => {
  it("records a completed run duration", () => {
    const startedAt = new Date("2026-08-28T12:00:00.000Z");
    const metadata = createRunMetadata(
      { approach: "solution", caseId: "event-listener" },
      startedAt,
    );

    const completed = completeRunMetadata(metadata, "succeeded", {
      completedAt: new Date("2026-08-28T12:00:01.250Z"),
    });

    expect(completed.status).toBe("succeeded");
    expect(completed.durationMs).toBe(1250);
    expect(completed.runtime.nodeVersion).toBe(process.version);
  });
});
