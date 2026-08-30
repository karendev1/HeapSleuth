import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("submission documentation", () => {
  it("documents the frozen result without inventing cost", () => {
    const readme = read("README.md");
    const evaluation = read("docs/EVALUATION.md");

    expect(readme).toContain("3/8 (37.5%)");
    expect(readme).toContain("5/8 (62.5%)");
    expect(evaluation).toContain(
      "6c8c0f3f9fa017deb386e9b947c5a897a41dbb9d152f5157eadea6fa50980dff",
    );
    expect(`${readme}\n${evaluation}`).not.toMatch(
      /(?:actual billed cost|monetary cost)[^\n|]*\$?0(?:\.00)?/i,
    );
  });

  it("keeps the environment template credential-free", () => {
    const example = read(".env.example");

    expect(example).toMatch(/^GEMINI_API_KEY=\s*$/m);
    expect(example).toMatch(/^CHROME_PATH=\s*$/m);
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it.each([
    [
      "event-listener",
      "trajectories/event-listener/890e02a2-d6f4-4f5c-997b-ab3a35416cba.jsonl",
    ],
    [
      "healthy-control",
      "trajectories/healthy-control/26d5d537-0007-4963-b12b-816cfdfdbaed.jsonl",
    ],
  ])("selects a complete %s two-agent trajectory", (_caseId, path) => {
    const records = read(path)
      .trim()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const serialized = JSON.stringify(records);

    expect(records.length).toBeGreaterThan(10);
    expect(serialized).toContain("investigator");
    expect(serialized).toContain("verifier");
    expect(serialized).toContain("final-result");
  });

  it("documents only commands that exist in the package contract", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const reproduction = read("docs/REPRODUCTION.md");

    for (const script of [
      "validate",
      "smoke:benchmark",
      "evaluate",
      "benchmark",
      "spike",
      "baseline",
      "solution",
    ]) {
      expect(packageJson.scripts).toHaveProperty(script);
      expect(reproduction).toContain(`npm run ${script}`);
    }
  });

  it.each([
    "README.md",
    "docs/REPRODUCTION.md",
    "docs/EVALUATION.md",
    "docs/TRAJECTORIES.md",
  ])("keeps every relative link in %s resolvable", (documentPath) => {
    const markdown = read(documentPath);
    const links = [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].map(
      (match) => match[1],
    );
    const relativeLinks = links.filter(
      (link) =>
        link !== undefined &&
        !link.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(link),
    );

    expect(relativeLinks.length).toBeGreaterThan(0);
    for (const link of relativeLinks) {
      const pathWithoutFragment = link?.split("#", 1)[0];
      expect(
        existsSync(
          resolve(root, dirname(documentPath), pathWithoutFragment ?? ""),
        ),
        `Broken link in ${documentPath}: ${link}`,
      ).toBe(true);
    }
  });
});
