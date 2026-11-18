import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";

import { Live, onLive } from "../support/live.ts";

// Long-lived names whose facts only change if their owners act: invariants, not exact values.

describe("canary names", () => {
  onLive("mainnet")("mainnet", (it) => {
    it.effect("resolve, and a primary name round-trips", () =>
      Effect.gen(function* () {
        const { reader } = yield* Live;

        for (const name of ["nick.eth", "vitalik.eth", "ens.eth"]) {
          const state = yield* Actions.name.get(reader, { name });
          assert.strictEqual(state.status, "registered", name);
          assert.isNotNull(state.resolver, name);
          const nameAddress = yield* Actions.record.getAddress(reader, { name });
          assert.isNotNull(nameAddress, name);
        }

        const address = yield* Actions.record.getAddress(reader, { name: "vitalik.eth" });
        if (address === null) assert.fail("vitalik.eth resolves to no address");
        const primaryName = yield* Actions.primaryName.get(reader, { address });
        assert.strictEqual(primaryName, "vitalik.eth");
      }),
    );
  });
});
