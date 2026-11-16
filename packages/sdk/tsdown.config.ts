import defineConfig from "klarity/tsdown/library";
import type { UserConfig } from "tsdown";

export default defineConfig({
  alias: { "#/": "./src/" },
  entry: {
    batch: "src/entrypoints/batch.ts",
    capabilities: "src/entrypoints/capabilities.ts",
    dns: "src/entrypoints/dns.ts",
    events: "src/entrypoints/events.ts",
    "hca/admin": "src/entrypoints/hca-admin.ts",
    hca: "src/entrypoints/hca.ts",
    index: "src/index.ts",
    indexer: "src/entrypoints/indexer.ts",
    migration: "src/entrypoints/migration.ts",
    permissions: "src/entrypoints/permissions.ts",
    registration: "src/entrypoints/registration.ts",
    subnames: "src/entrypoints/subnames.ts",
    wagmi: "src/wagmi.ts",
    wrapping: "src/entrypoints/wrapping.ts",
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
