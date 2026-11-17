import { describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk";
import { expectRejection } from "@ensforge/test-harness";

import { clientFor, other, resolverA, signer } from "../world.js";

describe("approval.setDelegate.prepare", () => {
  // PublicResolver keys delegates by the approving account and honours only the owner's.
  it.effect("refuses a signer who does not own the name", () => {
    const { ens } = clientFor({ name: "alice.eth", v1: { owner: other, resolver: resolverA } });
    return expectRejection(
      () =>
        Actions.approval.setDelegate.prepare(ens, {
          name: "alice.eth",
          delegate: signer,
          approved: true,
        }),
      { _tag: "UnauthorizedError", code: "NOT_OWNER" },
    );
  });
});
