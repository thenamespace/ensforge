import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";

export default defineConfig({
  alias: { "#/": "./src/" },
  entry: {
    actions: "src/actions/index.ts",
    effect: "src/effect.ts",
    index: "src/index.ts",
    legacy: "src/legacy/index.ts",
    "legacy/batch": "src/legacy/actions/batch/index.ts",
    "legacy/capabilities": "src/legacy/actions/capabilities/index.ts",
    "legacy/dns": "src/legacy/actions/dns/index.ts",
    "legacy/events": "src/legacy/actions/events/index.ts",
    "legacy/hca": "src/legacy/actions/hca/index.ts",
    "legacy/hca/admin": "src/legacy/actions/hca/admin/index.ts",
    "legacy/indexer": "src/legacy/actions/indexer/index.ts",
    "legacy/indexer/history": "src/legacy/actions/indexer/history/index.ts",
    "legacy/indexer/names": "src/legacy/actions/indexer/names/index.ts",
    "legacy/indexer/records": "src/legacy/actions/indexer/records/index.ts",
    "legacy/indexer/registrations": "src/legacy/actions/indexer/registrations/index.ts",
    "legacy/indexer/registries": "src/legacy/actions/indexer/registries/index.ts",
    "legacy/indexer/resolvers": "src/legacy/actions/indexer/resolvers/index.ts",
    "legacy/migration": "src/legacy/actions/migration/index.ts",
    "legacy/name": "src/legacy/actions/name/index.ts",
    "legacy/ownership": "src/legacy/actions/ownership/index.ts",
    "legacy/permissions": "src/legacy/actions/permissions/index.ts",
    "legacy/records": "src/legacy/actions/records/index.ts",
    "legacy/registration": "src/legacy/actions/registration/index.ts",
    "legacy/resolution": "src/legacy/actions/resolution/index.ts",
    "legacy/reverse": "src/legacy/actions/reverse/index.ts",
    "legacy/storage": "src/legacy/storage/index.ts",
    "legacy/storage/browser": "src/legacy/storage/browser.ts",
    "legacy/subnames": "src/legacy/actions/subnames/index.ts",
    "legacy/testing": "src/legacy/testing/index.ts",
    "legacy/wagmi": "src/legacy/wagmi/index.ts",
    "legacy/wrapping": "src/legacy/actions/wrapping/index.ts",
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
