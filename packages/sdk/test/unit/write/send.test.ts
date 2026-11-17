import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, createWalletClient, numberToHex, pad, type Hex } from "viem";
import { mainnet } from "viem/chains";

import * as Ensforge from "#/client/Ensforge";
import { sendPlan } from "#/internal/write/send";
import { sendSequential } from "#/internal/write/transport";

const account = "0x00000000000000000000000000000000000a11ce";
const target = "0x00000000000000000000000000000000000000c0";

const receipt = (hash: Hex) => ({
  transactionHash: hash,
  transactionIndex: "0x0",
  blockHash: pad("0x1"),
  blockNumber: "0x1",
  from: account,
  to: target,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x1",
  contractAddress: null,
  logs: [],
  logsBloom: pad("0x0", { size: 256 }),
  status: "0x1",
  type: "0x2",
});

describe("sendSequential", () => {
  // An approval and the payment that spends it: the payment is estimated after the approval lands.
  it.effect("sends each call only after the previous one is mined, with gas to spare", () =>
    Effect.gen(function* () {
      let sent = 0;
      const { transport, calls } = scriptedTransport(({ method, params }) => {
        if (method === "eth_sendTransaction") return pad(numberToHex(++sent));
        if (method === "eth_getTransactionReceipt") return receipt(params[0] as Hex);
        if (method === "eth_blockNumber") return "0x1";
        if (method === "eth_estimateGas") return "0x5208";
        return undefined;
      });
      const client = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport, pollingInterval: 1 }),
      });
      const walletClient = createWalletClient({ chain: mainnet, transport, account });

      const hashes = yield* sendSequential(client, { walletClient, account } as never, {
        id: "pay",
        description: "Approve and pay",
        calls: [
          { to: target, data: "0x01", value: 0n },
          { to: target, data: "0x02", value: 0n },
        ],
      });

      assert.strictEqual(hashes.length, 2);
      // Sent with a fifth more gas than estimated (21,000 → 25,200).
      const gasLimits = calls
        .filter(({ method }) => method === "eth_sendTransaction")
        .map(({ params }) => (params as readonly { readonly gas?: Hex }[])[0]?.gas);
      assert.deepStrictEqual(gasLimits, ["0x6270", "0x6270"]);
      const order = calls
        .map(({ method }) => method)
        .filter(
          (method) => method === "eth_sendTransaction" || method === "eth_getTransactionReceipt",
        );
      assert.deepStrictEqual(order.slice(0, 3), [
        "eth_sendTransaction",
        "eth_getTransactionReceipt",
        "eth_sendTransaction",
      ]);
    }),
  );
});

/** The `onStep` statuses of a one-step plan sent with or without `confirmLast`. */
const statuses = (confirmLast: boolean) =>
  Effect.gen(function* () {
    let sent = 0;
    const { transport } = scriptedTransport(({ method, params }) => {
      if (method === "eth_sendTransaction") return pad(numberToHex(++sent));
      if (method === "eth_getTransactionReceipt") return receipt(params[0] as Hex);
      if (method === "eth_blockNumber") return "0x1";
      if (method === "eth_estimateGas") return "0x5208";
      return undefined;
    });
    const client = Ensforge.create({
      publicClient: createPublicClient({ chain: mainnet, transport, pollingInterval: 1 }),
    });
    const walletClient = createWalletClient({ chain: mainnet, transport, account });
    const events: string[] = [];
    const plan = {
      id: "plan",
      operation: "test",
      chainId: 1,
      account,
      steps: [
        {
          id: "only",
          description: "Only step",
          calls: [{ to: target, data: "0x01", value: 0n }],
        },
      ],
      calls: [{ to: target, data: "0x01", value: 0n }],
    } as const;
    yield* sendPlan(client, plan as never, { walletClient, account } as never, {
      simulate: false,
      mode: "sequential",
      confirmLast,
      onStep: (event) => events.push(event.status),
    });
    return events;
  });

describe("sendPlan", () => {
  // `…Sync` writes wait for the last step too; its listeners hear it confirmed like the others.
  it.effect("reports the last step confirmed when asked to wait for it", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* statuses(true), ["submitted", "confirmed"]);
      assert.deepStrictEqual(yield* statuses(false), ["submitted"]);
    }),
  );
});
