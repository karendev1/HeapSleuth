import { z } from "zod";

import { caseIdSchema } from "./case.js";

export const trajectoryEventSchema = z.object({
  timestamp: z.iso.datetime(),
  caseId: caseIdSchema,
  agent: z.enum(["investigator", "verifier"]),
  type: z.enum([
    "instruction",
    "input",
    "tool-call",
    "tool-result",
    "decision-summary",
    "retry",
    "human-checkpoint",
    "final-result",
  ]),
  summary: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type TrajectoryEvent = z.infer<typeof trajectoryEventSchema>;
