import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The SDK's unit lane on its own, for manual mutation runs (`.config/stryker.config.json`).
export default defineConfig({
  root: fileURLToPath(new URL("../packages/sdk", import.meta.url)),
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["test/unit/**/*.test.ts"],
    setupFiles: ["../../tests/harness/src/setup.ts"],
  },
});
