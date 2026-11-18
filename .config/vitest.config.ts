import { fileURLToPath } from "node:url";

import { Array as Arr } from "effect";

import { defineConfig } from "vitest/config";

// Fast lanes: `<package>:unit` and `<package>:types` from `tests/unit/<package>`, network-free.
const packages = ["contracts", "sdk", "hca", "react"] as const;

const unit = (name: (typeof packages)[number]) => ({
  extends: true as const,
  test: {
    name: `${name}:unit`,
    root: "tests/unit",
    include: [`${name}/**/*.test.{ts,tsx}`],
    exclude: [`${name}/types/**`],
    setupFiles: [
      "../harness/src/setup.ts",
      "../harness/src/error-types.ts",
      ...(name === "react" ? ["react/setup.ts"] : []),
    ],
    // React hooks render in jsdom; files that check server rendering opt into `node` per file.
    ...(name === "react" ? { environment: "jsdom" } : {}),
  },
});

// The wagmi adapter again on wagmi 2, which most wallet kits (RainbowKit, ConnectKit) still use.
const wagmi2 = {
  extends: true as const,
  resolve: { alias: [{ find: /^wagmi(\/.*)?$/, replacement: "wagmi-v2$1" }] },
  test: {
    name: "sdk-wagmi2:unit",
    root: "tests/unit",
    include: ["sdk/wagmi/**/*.test.ts"],
    setupFiles: ["../harness/src/setup.ts", "../harness/src/error-types.ts"],
  },
};

// The repository CLI (`ensforge-dev`); its link checks open real TypeScript projects.
const tools = {
  extends: true as const,
  test: { name: "tools:unit", root: "tests/unit", include: ["tools/**/*.test.ts"] },
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
    setupFiles: ["../harness/src/error-types.ts"],
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
    setupFiles: ["../harness/src/error-types.ts"],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
};

// Random ENS operation sequences against a model (`pnpm test:fuzz`; manual and release CI).
const fuzz = {
  extends: true as const,
  test: {
    name: "fuzz",
    root: "tests/fuzz",
    include: ["test/**/*.test.ts"],
    setupFiles: ["../harness/src/error-types.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
  },
};

// ensforge against off-chain services in Docker (`pnpm test:services`; manual and release CI).
const services = {
  extends: true as const,
  test: {
    name: "services",
    root: "tests/services",
    include: ["test/**/*.test.ts"],
    setupFiles: ["../harness/src/error-types.ts"],
    testTimeout: 600_000,
    // The first stack compiles bigname from source, which takes most of this on a cold runner.
    hookTimeout: 2_700_000,
    // One stack per file; several at once would compete for the emulated indexer.
    fileParallelism: false,
  },
};

// Forks of mainnet and Sepolia at pinned blocks (`pnpm test:fork`; needs Foundry and archive RPCs
// in .env). One fork at a time keeps the RPC under its rate limit.
const fork = {
  extends: true as const,
  test: {
    name: "fork",
    root: "tests/fork",
    include: ["test/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
};

// Read-only checks against mainnet and Sepolia (`pnpm test:live`; needs RPCs in .env). One file at
// a time, and every request throttled, keeps the RPC under its rate limit.
const live = {
  extends: true as const,
  test: {
    name: "live",
    root: "tests/live",
    include: ["test/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
};

const types = (name: (typeof packages)[number]) => ({
  extends: true as const,
  test: {
    name: `${name}:types`,
    root: "tests/unit",
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: [`${name}/types/**/*.test-d.ts`],
      tsconfig: "tsconfig.json",
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
      ...Arr.flatMap(packages, (name) => [unit(name), types(name)]),
      wagmi2,
      tools,
      devnet,
      fixturesUnit,
      fixturesChain,
      integration,
      fuzz,
      services,
      fork,
      live,
    ],
    passWithNoTests: true,
  },
});
