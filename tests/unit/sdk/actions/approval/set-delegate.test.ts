import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";

import { clientFor, other, resolverA, signer } from "../world.js";

describe("approval.setDelegate.prepare", () => {
  // PublicResolver keys delegates by the approving account and honours only the owner's.
  it.effect("refuses a signer who does not own the name", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth", v1: { owner: other, resolver: resolverA } });

      yield* expectFailure(
        Actions.approval.setDelegate.prepare(ens, {
          name: "alice.eth",
          delegate: signer,
          approved: true,
        }),
        { _tag: "UnauthorizedError", code: "NOT_OWNER" },
      );
    }),
  );
});
