import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  benchmarkDatasetSchema,
  type BenchmarkDataset,
} from "../schemas/case.js";

const datasetPath = fileURLToPath(
  new URL("../../dataset/cases.json", import.meta.url),
);

export async function loadBenchmarkCases(): Promise<BenchmarkDataset> {
  const payload: unknown = JSON.parse(await readFile(datasetPath, "utf8"));
  return benchmarkDatasetSchema.parse(payload);
}
