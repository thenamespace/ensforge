import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/hca";
import { Actions as Batch } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";

import { hcaAddress, makeClient } from "../fixtures";

describe("Actions.batch with HCA reads", () => {
  it.effect("runs HCA reads together", () =>
    Effect.gen(function* () {
      const { client } = makeClient({ deployed: true });

      const { results } = yield* Batch.batch(client, {
        requests: {
          predicted: Actions.hca.predictAddress.request({}),
          account: Actions.hca.get.request({}),
        },
        allowFailure: false,
      });

      assert.strictEqual(results.predicted, hcaAddress);
      assert.strictEqual(results.account.address, hcaAddress);
      assert.isTrue(results.account.deployed);
    }),
  );

  it.effect("reports an HCA read's failure in its own result", () =>
    Effect.gen(function* () {
      const { client } = makeClient();

      const { results } = yield* Batch.batch(client, {
        requests: [
          Actions.hca.predictAddress.request({}),
          Actions.hca.verify.request({ address: "not-an-address" }),
        ],
      });

      assert.strictEqual(results[0].status, "success");
      assert.strictEqual(results[1].status, "failure");
    }),
  );

  it.effect("fails the batch on an HCA read's error without allowFailure", () =>
    Effect.gen(function* () {
      const { client } = makeClient();

      yield* expectFailure(
        Batch.batch(client, {
          requests: [Actions.hca.verify.request({ address: "not-an-address" })],
          allowFailure: false,
        }),
        { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      );
    }),
  );
});
