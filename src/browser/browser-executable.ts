import { access } from "node:fs/promises";

export type BrowserExecutable = {
  family: "chrome" | "edge" | "chromium";
  path: string;
};

type Candidate = BrowserExecutable;

function getCandidates(): Candidate[] {
  const configuredPath = process.env.CHROME_PATH;
  const configured =
    configuredPath === undefined
      ? []
      : [{ family: "chromium" as const, path: configuredPath }];

  if (process.platform === "win32") {
    return [
      ...configured,
      {
        family: "chrome",
        path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      },
      {
        family: "chrome",
        path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      },
      {
        family: "edge",
        path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      },
      {
        family: "edge",
        path: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      },
    ];
  }

  if (process.platform === "darwin") {
    return [
      ...configured,
      {
        family: "chrome",
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        family: "edge",
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      },
    ];
  }

  return [
    ...configured,
    { family: "chrome", path: "/usr/bin/google-chrome" },
    { family: "chrome", path: "/usr/bin/google-chrome-stable" },
    { family: "chromium", path: "/usr/bin/chromium" },
    { family: "chromium", path: "/usr/bin/chromium-browser" },
  ];
}

export async function findBrowserExecutable(): Promise<BrowserExecutable> {
  for (const candidate of getCandidates()) {
    try {
      await access(candidate.path);
      return candidate;
    } catch {
      // Continue through the explicit candidate list.
    }
  }

  throw new Error(
    "No supported Chromium browser was found. Install Chrome or set CHROME_PATH.",
  );
}
