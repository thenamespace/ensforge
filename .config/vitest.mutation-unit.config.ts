import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { sandboxSources } from "./vitest.mutation.ts";

// The SDK and HCA unit lanes, against the sandbox's sources, for `pnpm test:mutation`.
export default defineConfig({
  root: fileURLToPath(new URL("../tests/unit", import.meta.url)),
  resolve: { conditions: ["workspace-source"], alias: sandboxSources(["sdk", "hca"]) },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["{sdk,hca}/**/*.test.ts"],
    // Source scans (documented throws) kill no mutant.
    exclude: ["*/types/**", "*/conformance/throws-coverage.test.ts"],
    setupFiles: ["../harness/src/setup.ts"],
  },
});
