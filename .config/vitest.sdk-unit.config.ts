import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The SDK's unit lane on its own, for manual mutation runs (`.config/stryker.config.json`).
export default defineConfig({
  root: fileURLToPath(new URL("../tests/unit", import.meta.url)),
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["sdk/**/*.test.ts"],
    exclude: ["sdk/types/**"],
    setupFiles: ["../harness/src/setup.ts"],
  },
});
