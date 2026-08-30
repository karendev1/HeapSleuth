import {
  diagnosisSchema,
  type DiagnosisEvidence,
} from "../schemas/diagnosis.js";
import type { Diagnosis } from "../schemas/diagnosis.js";

export type EvidenceSource = DiagnosisEvidence["source"];

export class InvestigatorOutputError extends Error {
  override readonly name = "InvestigatorOutputError";

  constructor(
    readonly category: "malformed-json" | "schema-validation",
    message: string,
  ) {
    super(message);
  }
}

export function validateDiagnosisGrounding(input: {
  diagnosis: Diagnosis;
  expectedCaseId: string;
  allowedSourcePaths: readonly string[];
  availableEvidenceSources: ReadonlySet<EvidenceSource>;
}): Diagnosis {
  const { diagnosis } = input;
  if (diagnosis.caseId !== input.expectedCaseId) {
    throw new InvestigatorOutputError(
      "schema-validation",
      `The diagnosis returned case ID ${diagnosis.caseId} instead of ${input.expectedCaseId}.`,
    );
  }
  if (
    diagnosis.rootCause !== null &&
    !input.allowedSourcePaths.includes(diagnosis.rootCause.file)
  ) {
    throw new InvestigatorOutputError(
      "schema-validation",
      `The diagnosis cited an unlisted root-cause file: ${diagnosis.rootCause.file}.`,
    );
  }
  const unsupportedEvidence = diagnosis.evidence.find(
    ({ source }) => !input.availableEvidenceSources.has(source),
  );
  if (unsupportedEvidence !== undefined) {
    throw new InvestigatorOutputError(
      "schema-validation",
      `The diagnosis cited unavailable ${unsupportedEvidence.source} evidence.`,
    );
  }
  return diagnosis;
}

export function parseInvestigatorDiagnosis(input: {
  text: string;
  expectedCaseId: string;
  allowedSourcePaths: readonly string[];
  availableEvidenceSources: ReadonlySet<EvidenceSource>;
}): Diagnosis {
  let payload: unknown;
  try {
    payload = JSON.parse(input.text);
  } catch {
    throw new InvestigatorOutputError(
      "malformed-json",
      "The Investigator response was not valid JSON.",
    );
  }

  const parsed = diagnosisSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvestigatorOutputError(
      "schema-validation",
      "The Investigator response did not match the diagnosis schema.",
    );
  }
  return validateDiagnosisGrounding({
    diagnosis: parsed.data,
    expectedCaseId: input.expectedCaseId,
    allowedSourcePaths: input.allowedSourcePaths,
    availableEvidenceSources: input.availableEvidenceSources,
  });
}
