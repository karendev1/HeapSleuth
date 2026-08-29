export type BaselineArguments = { caseId?: string };

export function parseBaselineArguments(
  arguments_: readonly string[],
): BaselineArguments {
  if (arguments_.length === 0) return {};

  if (arguments_.length === 2 && arguments_[0] === "--case") {
    const caseId = arguments_[1];
    if (caseId === undefined || caseId.length === 0) {
      throw new Error("--case requires a case ID.");
    }
    return { caseId };
  }

  if (arguments_.length === 1 && arguments_[0]?.startsWith("--case=")) {
    const caseId = arguments_[0].slice("--case=".length);
    if (caseId.length === 0) throw new Error("--case requires a case ID.");
    return { caseId };
  }

  throw new Error("Usage: npm run baseline [-- --case <case-id>]");
}
