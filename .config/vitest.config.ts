import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Fast lanes (018): `<package>:unit` and `<package>:types`, network-free. Chain lanes
// (integration, fuzz, services, fork, live) are added by phases 019–025.
const packages = ["contracts", "sdk", "hca", "react"] as const;

const unit = (name: (typeof packages)[number]) => ({
  extends: true as const,
  test: {
    name: `${name}:unit`,
    root: `packages/${name}`,
    include: ["test/unit/**/*.test.ts"],
    setupFiles: ["../../tests/harness/src/setup.ts"],
  },
});

// The wagmi adapter again on wagmi 2, which most wallet kits (RainbowKit, ConnectKit) still use.
const wagmi2 = {
  extends: true as const,
  resolve: { alias: [{ find: /^wagmi(\/.*)?$/, replacement: "wagmi-v2$1" }] },
  test: {
    name: "sdk-wagmi2:unit",
    root: "packages/sdk",
    include: ["test/unit/wagmi/**/*.test.ts"],
    setupFiles: ["../../tests/harness/src/setup.ts"],
  },
};

// React hooks render in jsdom; files that check server rendering opt into `node` per file.
const reactUnit = {
  extends: true as const,
  test: {
    name: "react:unit",
    root: "packages/react",
    include: ["test/unit/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["../../tests/harness/src/setup.ts"],
  },
};

// The repository CLI (`ensforge-dev`); its link checks open real TypeScript projects.
const tools = {
  extends: true as const,
  test: { name: "tools:unit", root: "tools/cli", include: ["test/unit/**/*.test.ts"] },
};

// Chain lane: every profile on a local anvil (`pnpm test:chain`; needs Foundry, see
// tests/devnet/foundry-version). Not part of `pnpm test`.
const devnet = {
  extends: true as const,
  test: {
    name: "devnet",
    root: "tests/devnet",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
};

// Fixtures: the catalog and ledger check runs in the fast lane; seeding runs on the chain lane.
const fixturesUnit = {
  extends: true as const,
  test: { name: "fixtures:unit", root: "tests/fixtures", include: ["test/unit/**/*.test.ts"] },
};
const fixturesChain = {
  extends: true as const,
  test: {
    name: "fixtures",
    root: "tests/fixtures",
    include: ["test/chain/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
};

// ensforge's actions against the seeded fixtures, on the chain lane.
const integration = {
  extends: true as const,
  test: {
    name: "integration",
    root: "tests/integration",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
};

const types = (name: (typeof packages)[number]) => ({
  extends: true as const,
  test: {
    name: `${name}:types`,
    root: `packages/${name}`,
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ["test/types/**/*.test-d.ts"],
      tsconfig: "test/tsconfig.json",
    },
  },
});

export default defineConfig({
  // Project paths below are relative to the repository root, not this folder.
  root: fileURLToPath(new URL("..", import.meta.url)),
  // Tests run against package sources, not builds.
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    projects: [
      ...packages.flatMap((name) =>
        name === "react" ? [reactUnit, types(name)] : [unit(name), types(name)],
      ),
      wagmi2,
      tools,
      devnet,
      fixturesUnit,
      fixturesChain,
      integration,
    ],
    passWithNoTests: true,
  },
});
