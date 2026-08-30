import type { Diagnosis } from "../schemas/diagnosis.js";
import {
  verificationSchema,
  type Verification,
} from "../schemas/verification.js";
import type { EvidenceSource } from "../investigator/validation.js";
import { validateDiagnosisGrounding } from "../investigator/validation.js";

export class VerifierOutputError extends Error {
  override readonly name = "VerifierOutputError";

  constructor(
    readonly category: "malformed-json" | "schema-validation",
    message: string,
  ) {
    super(message);
  }
}

export function parseVerifierOutput(input: {
  text: string;
  expectedCaseId: string;
  allowedSourcePaths: readonly string[];
  availableEvidenceSources: ReadonlySet<EvidenceSource>;
}): Verification {
  let payload: unknown;
  try {
    payload = JSON.parse(input.text);
  } catch {
    throw new VerifierOutputError(
      "malformed-json",
      "The Verifier response was not valid JSON.",
    );
  }

  const parsed = verificationSchema.safeParse(payload);
  if (!parsed.success) {
    throw new VerifierOutputError(
      "schema-validation",
      "The Verifier response did not match the verification schema.",
    );
  }
  const verification = parsed.data;
  if (verification.revisedDiagnosis !== null) {
    try {
      validateDiagnosisGrounding({
        diagnosis: verification.revisedDiagnosis,
        expectedCaseId: input.expectedCaseId,
        allowedSourcePaths: input.allowedSourcePaths,
        availableEvidenceSources: input.availableEvidenceSources,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new VerifierOutputError("schema-validation", message);
    }
  }
  return verification;
}

export function resolveVerifiedDiagnosis(
  investigatorDiagnosis: Diagnosis,
  verification: Verification,
): Diagnosis {
  return verification.decision === "accept"
    ? investigatorDiagnosis
    : verification.revisedDiagnosis;
}
