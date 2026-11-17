import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { estimatePlan } from "@ensforge/sdk/internal/internal/write/simulate";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";

const account = "0x00000000000000000000000000000000000a11ce";
const target = "0x00000000000000000000000000000000000000c0";

describe("estimatePlan", () => {
  // A plan's estimate is what its calls are sent with, so a wallet that sends it does not run out.
  it.effect("adds the headroom the calls are sent with to each call's estimate", () =>
    Effect.gen(function* () {
      const { transport } = scriptedTransport(({ method }) =>
        method === "eth_estimateGas" ? "0x5208" : undefined,
      );
      const client = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
      });
      const plan = makePlan({
        operation: "test.op",
        chainId: mainnet.id,
        account,
        steps: [
          {
            id: "pay",
            description: "Approve and pay",
            calls: [
              { to: target, data: "0x01", value: 0n },
              { to: target, data: "0x02", value: 1n },
            ],
          },
        ],
      });

      const estimate = yield* estimatePlan(client, plan, account);

      assert.strictEqual(estimate.gas, 2n * 25_200n);
      assert.strictEqual(estimate.value, 1n);
    }),
  );
});
