import { createHash } from "node:crypto";

import {
  loadAllowedSourceFiles,
  type LoadedSourceFile,
} from "../baseline/source-loader.js";

export type SourceToolObservation = {
  type: "tool-call" | "tool-result";
  tool: "read_source_file" | "search_source";
  summary: string;
  data?: Record<string, unknown>;
};

export type InvestigatorSourceFile = LoadedSourceFile & { sha256: string };

export async function readInvestigatorSources(input: {
  projectRoot: string;
  allowedPaths: readonly string[];
  requestedPaths?: readonly string[];
  observe?: (observation: SourceToolObservation) => void;
}): Promise<InvestigatorSourceFile[]> {
  const emit = input.observe ?? (() => undefined);
  const sources: InvestigatorSourceFile[] = [];
  const requestedPaths = input.requestedPaths ?? input.allowedPaths;

  for (const sourcePath of requestedPaths) {
    emit({
      type: "tool-call",
      tool: "read_source_file",
      summary: `Read the case-scoped source file ${sourcePath}.`,
      data: { path: sourcePath },
    });
    const [source] = await loadAllowedSourceFiles({
      projectRoot: input.projectRoot,
      allowedPaths: input.allowedPaths,
      requestedPaths: [sourcePath],
    });
    if (source === undefined) {
      throw new Error(`Source loader returned no data for ${sourcePath}.`);
    }
    const loaded = {
      ...source,
      sha256: createHash("sha256").update(source.content, "utf8").digest("hex"),
    };
    sources.push(loaded);
    emit({
      type: "tool-result",
      tool: "read_source_file",
      summary: `Read and hashed ${sourcePath}.`,
      data: {
        path: sourcePath,
        byteCount: loaded.byteCount,
        sha256: loaded.sha256,
      },
    });
  }

  return sources;
}

export type SourceSearchMatch = {
  path: string;
  line: number;
  excerpt: string;
};

export function searchInvestigatorSources(input: {
  sources: readonly InvestigatorSourceFile[];
  query: string;
  maxMatches?: number;
  observe?: (observation: SourceToolObservation) => void;
}): SourceSearchMatch[] {
  const query = input.query.trim();
  if (query.length === 0 || query.length > 100) {
    throw new Error("Source search queries must contain 1 to 100 characters.");
  }
  const maxMatches = input.maxMatches ?? 20;
  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 50) {
    throw new Error("Source search maxMatches must be between 1 and 50.");
  }
  const emit = input.observe ?? (() => undefined);
  emit({
    type: "tool-call",
    tool: "search_source",
    summary: "Search only the source files already authorized for the case.",
    data: { query, maxMatches },
  });

  const normalizedQuery = query.toLocaleLowerCase("en-US");
  const matches: SourceSearchMatch[] = [];
  for (const source of input.sources) {
    for (const [index, line] of source.content.split(/\r?\n/).entries()) {
      if (line.toLocaleLowerCase("en-US").includes(normalizedQuery)) {
        matches.push({
          path: source.path,
          line: index + 1,
          excerpt: line.trim().slice(0, 240),
        });
        if (matches.length === maxMatches) break;
      }
    }
    if (matches.length === maxMatches) break;
  }

  emit({
    type: "tool-result",
    tool: "search_source",
    summary: `Found ${matches.length} bounded source match(es).`,
    data: { matchCount: matches.length },
  });
  return matches;
}
