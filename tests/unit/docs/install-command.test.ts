import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { findInstallCommand } from "@ensforge/docs/internal/lib/analytics/install-command";

describe("findInstallCommand", () => {
  it("reads the package manager and the first ensforge package without its version", () => {
    assert.deepStrictEqual(findInstallCommand("pnpm add @ensforge/sdk@latest viem"), {
      packageManager: "pnpm",
      package: "@ensforge/sdk",
    });
    assert.deepStrictEqual(findInstallCommand("bun add viem effect@^4 @ensforge/react"), {
      packageManager: "bun",
      package: "@ensforge/react",
    });
  });

  it("finds the install inside chained and multi-line setup commands", () => {
    const quickstart = Arr.join(
      [
        "mkdir ens-quickstart && cd ens-quickstart",
        "npm init -y && npm pkg set type=module",
        "npm install @ensforge/sdk viem effect@^4 tsx",
      ],
      "\n",
    );

    assert.deepStrictEqual(findInstallCommand(quickstart), {
      packageManager: "npm",
      package: "@ensforge/sdk",
    });
    assert.deepStrictEqual(findInstallCommand("cd app; yarn add -D @ensforge/hca"), {
      packageManager: "yarn",
      package: "@ensforge/hca",
    });
  });

  it("ignores commands that install nothing from ensforge", () => {
    assert.isUndefined(findInstallCommand("npm install viem"));
    assert.isUndefined(findInstallCommand("pnpm remove @ensforge/core"));
    assert.isUndefined(findInstallCommand('import { createEnsClient } from "@ensforge/sdk"'));
  });
});
