import { z } from "zod";

import { diagnosisSchema } from "./diagnosis.js";

const issueSchema = z.string().min(1);
const verificationSummarySchema = z.string().min(1);
const inconclusiveDiagnosisSchema = diagnosisSchema.extend({
  verdict: z.literal("inconclusive"),
});

const acceptedVerificationSchema = z.strictObject({
  decision: z.literal("accept"),
  issues: z.array(issueSchema).length(0),
  revisedDiagnosis: z.null(),
  verificationSummary: verificationSummarySchema,
});

const revisedVerificationSchema = z.strictObject({
  decision: z.literal("revise"),
  issues: z.array(issueSchema).min(1),
  revisedDiagnosis: diagnosisSchema,
  verificationSummary: verificationSummarySchema,
});

const inconclusiveVerificationSchema = z.strictObject({
  decision: z.literal("inconclusive"),
  issues: z.array(issueSchema).min(1),
  revisedDiagnosis: inconclusiveDiagnosisSchema,
  verificationSummary: verificationSummarySchema,
});

export const verificationSchema = z.discriminatedUnion("decision", [
  acceptedVerificationSchema,
  revisedVerificationSchema,
  inconclusiveVerificationSchema,
]);

export type Verification = z.infer<typeof verificationSchema>;
