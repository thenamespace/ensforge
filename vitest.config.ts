import { defineConfig } from "vitest/config";

// Fast lanes (018): `<package>:unit` and `<package>:types`, network-free. Chain lanes
// (integration, fuzz, services, fork, live) are added by phases 019–025.
const packages = ["contracts", "sdk", "hca"] as const;

const unit = (name: (typeof packages)[number]) => ({
  extends: true as const,
  test: {
    name: `${name}:unit`,
    root: `packages/${name}`,
    include: ["test/unit/**/*.test.ts"],
    setupFiles: ["../../tests/harness/src/setup.ts"],
  },
});

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
  // Tests run against package sources, not builds.
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    projects: packages.flatMap((name) => [unit(name), types(name)]),
    passWithNoTests: true,
  },
});
