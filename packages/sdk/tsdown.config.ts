import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";

export default defineConfig({
  alias: { "#/": "./src/" },
  entry: {
    actions: "src/actions/index.ts",
    effect: "src/effect.ts",
    indexer: "src/indexer/index.ts",
    extension: "src/extension.ts",
    index: "src/index.ts",
    wagmi: "src/wagmi/index.ts",
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
