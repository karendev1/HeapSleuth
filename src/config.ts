import dotenv from "dotenv";
import { z } from "zod";

const booleanFromEnvironmentSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

export const appConfigSchema = z.object({
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  BROWSER_HEADLESS: booleanFromEnvironmentSchema,
  RESULTS_DIR: z.string().min(1).default("results"),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  if (environment === process.env) {
    dotenv.config({ quiet: true });
  }

  return appConfigSchema.parse(environment);
}
