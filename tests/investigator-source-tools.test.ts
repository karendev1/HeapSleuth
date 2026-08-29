import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readInvestigatorSources,
  searchInvestigatorSources,
} from "../src/investigator/source-tools.js";

describe("Investigator source tools", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "heapsleuth-source-tool-"));
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "case.ts"),
      "export function mount() {\n  return 'bounded';\n}\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads, hashes, and searches only an authorized source file", async () => {
    const sources = await readInvestigatorSources({
      projectRoot: root,
      allowedPaths: ["src/case.ts"],
    });
    expect(sources[0]).toMatchObject({
      path: "src/case.ts",
    });
    expect(sources[0]?.byteCount).toBeGreaterThan(0);
    expect(sources[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(searchInvestigatorSources({ sources, query: "MOUNT" })).toEqual([
      {
        path: "src/case.ts",
        line: 1,
        excerpt: "export function mount() {",
      },
    ]);
  });

  it("rejects unlisted, absolute, traversing, and missing source requests", async () => {
    await expect(
      readInvestigatorSources({
        projectRoot: root,
        allowedPaths: ["src/case.ts"],
        requestedPaths: ["src/other.ts"],
      }),
    ).rejects.toThrow("not listed");
    await expect(
      readInvestigatorSources({
        projectRoot: root,
        allowedPaths: [path.join(root, "src", "case.ts")],
      }),
    ).rejects.toThrow("Absolute source paths");
    await expect(
      readInvestigatorSources({
        projectRoot: root,
        allowedPaths: ["../case.ts"],
      }),
    ).rejects.toThrow("leaves the project workspace");
    await expect(
      readInvestigatorSources({
        projectRoot: root,
        allowedPaths: ["src/missing.ts"],
      }),
    ).rejects.toThrow("does not exist");
  });

  it("bounds source search input and output", async () => {
    const sources = await readInvestigatorSources({
      projectRoot: root,
      allowedPaths: ["src/case.ts"],
    });
    expect(() => searchInvestigatorSources({ sources, query: "" })).toThrow(
      "1 to 100",
    );
    expect(() =>
      searchInvestigatorSources({ sources, query: "return", maxMatches: 51 }),
    ).toThrow("between 1 and 50");
  });
});
