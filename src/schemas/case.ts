import { z } from "zod";

export const caseIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Case IDs must use kebab-case.");

export const scenarioStepSchema = z.object({
  action: z.literal("mount-unmount"),
  target: z.string().min(1),
  repetitions: z.number().int().positive().default(1),
});

export const benchmarkCaseSchema = z.object({
  id: caseIdSchema,
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  sourceFiles: z.array(z.string().min(1)).min(1),
  scenario: z.array(scenarioStepSchema).min(1),
});

export const benchmarkDatasetSchema = z
  .array(benchmarkCaseSchema)
  .length(8)
  .superRefine((cases, context) => {
    const ids = new Set<string>();
    const routes = new Set<string>();

    for (const [index, benchmarkCase] of cases.entries()) {
      if (ids.has(benchmarkCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case ID: ${benchmarkCase.id}`,
          path: [index, "id"],
        });
      }
      if (routes.has(benchmarkCase.route)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case route: ${benchmarkCase.route}`,
          path: [index, "route"],
        });
      }
      if (benchmarkCase.route !== `/cases/${benchmarkCase.id}`) {
        context.addIssue({
          code: "custom",
          message: "Case route must be derived from its ID.",
          path: [index, "route"],
        });
      }

      ids.add(benchmarkCase.id);
      routes.add(benchmarkCase.route);
    }
  });

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type BenchmarkDataset = z.infer<typeof benchmarkDatasetSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
