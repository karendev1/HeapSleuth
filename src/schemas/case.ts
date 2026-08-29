import { z } from "zod";

export const caseIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Case IDs must use kebab-case.");

export const scenarioStepSchema = z.object({
  action: z.string().min(1),
  target: z.string().min(1).optional(),
  repetitions: z.number().int().positive().default(1),
});

export const benchmarkCaseSchema = z.object({
  id: caseIdSchema,
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  sourceFiles: z.array(z.string().min(1)).min(1),
  scenario: z.array(scenarioStepSchema).min(1),
});

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
