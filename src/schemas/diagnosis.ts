import { z } from "zod";

import { caseIdSchema } from "./case.js";

export const diagnosisVerdictSchema = z.enum([
  "leak",
  "no-leak",
  "inconclusive",
]);

export const diagnosisEvidenceSchema = z.object({
  source: z.enum(["runtime", "heap", "source", "console"]),
  claim: z.string().min(1),
});

export const diagnosisSchema = z.object({
  caseId: caseIdSchema,
  verdict: diagnosisVerdictSchema,
  mechanism: z.string().min(1).nullable(),
  rootCause: z
    .object({
      file: z.string().min(1),
      symbol: z.string().min(1),
    })
    .nullable(),
  evidence: z.array(diagnosisEvidenceSchema),
  confidence: z.number().min(0).max(1),
  recommendedFix: z.string().min(1).nullable(),
  limitations: z.array(z.string().min(1)),
});

export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type DiagnosisEvidence = z.infer<typeof diagnosisEvidenceSchema>;
