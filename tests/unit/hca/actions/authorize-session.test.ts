import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Actions } from "@ensforge/hca/effect";

import { hcaAddress, makeClient, owner, ownerSignature } from "../fixtures";

// The owner approves a session with one typed-data signature, so the HCA need not exist yet: the
// session names the address the factory will create, and the validator checks the approval when
// the account is first used.
describe("hca.authorizeSession on an HCA that is not deployed", () => {
  it.effect("signs for the predicted address and sends no transaction", () =>
    Effect.gen(function* () {
      const { client, calls } = makeClient({ wallet: true });
      const resolver = "0x00000000000000000000000000000000000000bb";

      const session = yield* Actions.hca.authorizeSession(client, {
        sessionKey: "0x00000000000000000000000000000000000000cc",
        resolver,
        validUntil: 4_000_000_000,
      });

      assert.strictEqual(session.hca, hcaAddress);
      assert.strictEqual(session.owner, owner);
      assert.strictEqual(session.terms.sessionNonce, 0n);
      assert.strictEqual(session.ownerSignature, ownerSignature);
      assert.isFalse(
        Arr.some(
          calls,
          ({ method }) => method === "eth_sendTransaction" || method === "wallet_sendCalls",
        ),
      );
    }),
  );
});
