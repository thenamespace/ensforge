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
    legacy: "src/legacy/index.ts",
    "legacy/storage": "src/legacy/storage/index.ts",
    "legacy/storage/browser": "src/legacy/storage/browser.ts",
    "legacy/testing": "src/legacy/testing/index.ts",
    "legacy/wagmi": "src/legacy/wagmi/index.ts",
  },
  exports: {
    devExports: "workspace-source",
    exclude: ["legacy/testing"],
    customExports: (exports, { isPublish }) =>
      isPublish
        ? exports
        : {
            ...exports,
            "./legacy/testing": {
              "workspace-source": "./src/legacy/testing/index.ts",
              default: "./dist/legacy/testing.js",
            },
          },
  },
  unbundle: true,
  publint: "ci-only",
  attw: {
    enabled: "ci-only",
    level: "error",
    profile: "esm-only",
  },
}) as UserConfig;
