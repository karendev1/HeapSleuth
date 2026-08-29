import { fileURLToPath } from "node:url";
import path from "node:path";

import { createServer, type ViteDevServer } from "vite";

export type BenchmarkServer = {
  origin: string;
  close: () => Promise<void>;
};

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const benchmarkRoot = path.join(projectRoot, "benchmark");

export async function startBenchmarkServer(): Promise<BenchmarkServer> {
  const server: ViteDevServer = await createServer({
    root: benchmarkRoot,
    configFile: path.join(benchmarkRoot, "vite.config.ts"),
    clearScreen: false,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });

  await server.listen();
  const address = server.httpServer?.address();

  if (
    address === null ||
    address === undefined ||
    typeof address === "string"
  ) {
    await server.close();
    throw new Error("Vite did not expose a numeric benchmark server port.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => server.close(),
  };
}
