import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import type { Gateways } from "@ensforge/sdk/internal/client/types";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  createPublicClient,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  toFunctionSelector,
  type Abi,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

import { resolverA } from "../world.js";

const cid = "bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";
const textSelector = toFunctionSelector("text(bytes32,string)");

// A name whose avatar record is `ipfs://<cid>`, without an ETH address.
const clientWith = (gateways?: Gateways) =>
  Ensforge.create({
    publicClient: createPublicClient({
      chain: mainnet,
      transport: scriptedTransport(
        contractScript({
          contracts: [
            {
              address: Deployments.mainnet.v2.contracts.universalResolver,
              abi: Abis.v2.universalResolver as Abi,
              functions: {
                resolve: ([, data]) => {
                  const { args } = decodeFunctionData({
                    abi: Abis.shared.multicallResolver,
                    data: data as Hex,
                  });
                  const answers = (args[0] as readonly Hex[]).map((call) =>
                    call.startsWith(textSelector)
                      ? encodeAbiParameters([{ type: "string" }], [`ipfs://${cid}`])
                      : encodeAbiParameters([{ type: "bytes" }], ["0x"]),
                  );
                  return [
                    encodeFunctionResult({
                      abi: Abis.shared.multicallResolver,
                      functionName: "multicall",
                      result: answers,
                    }),
                    resolverA,
                  ];
                },
              },
            },
          ],
        }),
      ).transport,
    }),
    batch: { multicall: false },
    ...(gateways === undefined ? {} : { gateways }),
  });

describe("record.getAvatar", () => {
  it.effect("loads storage URIs through the call's gateways, else the client's, else ipfs.io", () =>
    Effect.gen(function* () {
      const name = "alice.eth";
      const configured = clientWith({ ipfs: "https://client.example/" });

      assert.deepStrictEqual(
        yield* Effect.all([
          Actions.record.getAvatar(clientWith(), { name }),
          Actions.record.getAvatar(configured, { name }),
          Actions.record.getAvatar(configured, {
            name,
            gateways: { ipfs: "https://call.example" },
          }),
          // A call that sets only another gateway keeps the client's IPFS gateway.
          Actions.record.getAvatar(configured, {
            name,
            gateways: { arweave: "https://ar.example" },
          }),
        ]),
        [
          `https://ipfs.io/ipfs/${cid}`,
          `https://client.example/ipfs/${cid}`,
          `https://call.example/ipfs/${cid}`,
          `https://client.example/ipfs/${cid}`,
        ],
      );
    }),
  );
});
