import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  groundTruthDatasetSchema,
  validateDatasetAlignment,
  type GroundTruthDataset,
} from "../schemas/ground-truth.js";
import { loadBenchmarkCases } from "../dataset/load-cases.js";

export async function loadEvaluatorGroundTruth(
  projectRoot: string,
): Promise<GroundTruthDataset> {
  const cases = await loadBenchmarkCases();
  const payload: unknown = JSON.parse(
    await readFile(
      path.join(projectRoot, "dataset", "ground-truth.json"),
      "utf8",
    ),
  );
  const groundTruth = groundTruthDatasetSchema.parse(payload);
  validateDatasetAlignment(cases, groundTruth);
  return groundTruth;
}
