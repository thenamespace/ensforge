import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";

export default defineConfig({
  alias: { "#/": "./src/" },
  entry: {
    index: "src/index.ts",
    atoms: "src/atoms/index.ts",
    server: "src/server/index.ts",
  },
  deps: { dts: { neverBundle: true } },
  exports: { devExports: "workspace-source" },
  unbundle: true,
  // Unbundled output keeps each module's "use client" directive; the warning targets bundling.
  inputOptions: {
    onLog(level, log, handler) {
      if (log.code === "MODULE_LEVEL_DIRECTIVE") return;
      handler(level, log);
    },
  },
  publint: "ci-only",
  attw: {
    enabled: "ci-only",
    level: "error",
    profile: "esm-only",
  },
}) as UserConfig;
