import { describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk";
import { expectRejection } from "@ensforge/test-harness";

import { clientFor, signer } from "../world.js";

describe("migration.get", () => {
  it.effect("fails where ENSv2 is not deployed: there is nothing to migrate to", () => {
    const { ens } = clientFor({ name: "alice.eth", v1: { owner: signer }, v1Only: true });
    return expectRejection(() => Actions.migration.get(ens, { name: "alice.eth" }), {
      _tag: "UnsupportedError",
      code: "UNSUPPORTED_ON_DEPLOYMENT",
    });
  });
});
