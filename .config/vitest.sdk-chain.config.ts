import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { sandboxSources } from "./vitest.mutation.ts";

// The devnet write tests of the send and route runtime, against the sandbox's sources, for
// `pnpm test:mutation:chain`. Each file starts its own anvil on a free port.
export default defineConfig({
  root: fileURLToPath(new URL("../tests/integration", import.meta.url)),
  resolve: { conditions: ["workspace-source"], alias: sandboxSources(["sdk", "hca"]) },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["test/writes/{plans,modes,hca,registration,primary-l2}.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
