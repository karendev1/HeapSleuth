import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type LoadedSourceFile = {
  path: string;
  content: string;
  byteCount: number;
};

export class SourceBoundaryError extends Error {
  override readonly name = "SourceBoundaryError";
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function loadAllowedSourceFiles(input: {
  projectRoot: string;
  allowedPaths: readonly string[];
  requestedPaths?: readonly string[];
}): Promise<LoadedSourceFile[]> {
  const requestedPaths = input.requestedPaths ?? input.allowedPaths;
  const allowedPaths = new Set(input.allowedPaths);
  const resolvedRoot = await realpath(input.projectRoot);
  const loadedSources: LoadedSourceFile[] = [];

  for (const sourcePath of requestedPaths) {
    if (path.isAbsolute(sourcePath)) {
      throw new SourceBoundaryError(
        `Absolute source paths are not allowed: ${sourcePath}`,
      );
    }
    if (!allowedPaths.has(sourcePath)) {
      throw new SourceBoundaryError(
        `Source path is not listed for this case: ${sourcePath}`,
      );
    }

    const resolvedCandidate = path.resolve(resolvedRoot, sourcePath);
    if (!isWithinRoot(resolvedRoot, resolvedCandidate)) {
      throw new SourceBoundaryError(
        `Source path leaves the project workspace: ${sourcePath}`,
      );
    }

    let canonicalCandidate: string;
    try {
      canonicalCandidate = await realpath(resolvedCandidate);
    } catch {
      throw new SourceBoundaryError(
        `Source file does not exist: ${sourcePath}`,
      );
    }

    if (!isWithinRoot(resolvedRoot, canonicalCandidate)) {
      throw new SourceBoundaryError(
        `Source path resolves outside the project workspace: ${sourcePath}`,
      );
    }
    if (!(await stat(canonicalCandidate)).isFile()) {
      throw new SourceBoundaryError(`Source path is not a file: ${sourcePath}`);
    }

    const content = await readFile(canonicalCandidate, "utf8");
    loadedSources.push({
      path: sourcePath,
      content,
      byteCount: Buffer.byteLength(content, "utf8"),
    });
  }

  return loadedSources;
}
