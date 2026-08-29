import dotenv from "dotenv";
import { z } from "zod";

const booleanFromEnvironmentSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim().length === 0
    ? undefined
    : value;
}

export const appConfigSchema = z.object({
  GEMINI_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional(),
  ),
  AI_MODEL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).default("gemini-3.6-flash"),
  ),
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
