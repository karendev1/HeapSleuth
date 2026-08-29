import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  trajectoryEventSchema,
  type TrajectoryEvent,
} from "../schemas/trajectory.js";

export class TrajectoryPersistenceError extends Error {
  override readonly name = "TrajectoryPersistenceError";
}

export class InvestigatorTrajectory {
  readonly events: TrajectoryEvent[] = [];

  constructor(
    private readonly caseId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  add(
    type: TrajectoryEvent["type"],
    summary: string,
    data?: Record<string, unknown>,
  ): void {
    this.events.push(
      trajectoryEventSchema.parse({
        timestamp: this.now().toISOString(),
        caseId: this.caseId,
        agent: "investigator",
        type,
        summary,
        ...(data === undefined ? {} : { data }),
      }),
    );
  }

  async persist(trajectoriesRoot: string, runId: string): Promise<string> {
    const directory = path.join(trajectoriesRoot, this.caseId);
    const filePath = path.join(directory, `${runId}.jsonl`);
    try {
      await mkdir(directory, { recursive: true });
      const text = `${this.events
        .map((event) => JSON.stringify(trajectoryEventSchema.parse(event)))
        .join("\n")}\n`;
      await writeFile(filePath, text, "utf8");
      const savedLines = (await readFile(filePath, "utf8"))
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
      for (const line of savedLines) {
        trajectoryEventSchema.parse(JSON.parse(line));
      }
      if (savedLines.length !== this.events.length) {
        throw new Error("Saved trajectory event count does not match.");
      }
      return filePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TrajectoryPersistenceError(
        `Could not persist the Investigator trajectory: ${message}`,
      );
    }
  }
}
