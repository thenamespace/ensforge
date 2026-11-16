import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";

export default defineConfig({
  alias: { "#/": "./src/" },
  entry: {
    index: "src/index.ts",
    internal: "src/internal.ts",
    shared: "src/shared/index.ts",
    v1: "src/v1/index.ts",
    v2: "src/v2/index.ts",
    "v2/experimental/hca": "src/v2/experimental/hca/index.ts",
  },
  exports: { devExports: "workspace-source" },
  unbundle: true,
  publint: "ci-only",
  attw: {
    enabled: "ci-only",
    level: "error",
    profile: "esm-only",
  },
}) as UserConfig;
