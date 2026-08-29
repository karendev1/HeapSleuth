export type InvestigatorArguments = { caseId: string };

export function parseInvestigatorArguments(
  arguments_: readonly string[],
): InvestigatorArguments {
  if (arguments_.length === 2 && arguments_[0] === "--case") {
    const caseId = arguments_[1];
    if (caseId !== undefined && caseId.length > 0) return { caseId };
  }
  if (arguments_.length === 1 && arguments_[0]?.startsWith("--case=")) {
    const caseId = arguments_[0].slice("--case=".length);
    if (caseId.length > 0) return { caseId };
  }
  throw new Error("Usage: npm run solution -- --case <case-id>");
}
