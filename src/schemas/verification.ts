import { z } from "zod";

import { diagnosisSchema } from "./diagnosis.js";

export const verificationSchema = z.object({
  decision: z.enum(["accept", "revise", "inconclusive"]),
  issues: z.array(z.string().min(1)),
  revisedDiagnosis: diagnosisSchema.nullable(),
  verificationSummary: z.string().min(1),
});

export type Verification = z.infer<typeof verificationSchema>;
