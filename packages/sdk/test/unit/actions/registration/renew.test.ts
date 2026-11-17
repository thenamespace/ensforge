import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";
import { expectRejection, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { createPublicClient, decodeFunctionData, pad, zeroHash, type Abi } from "viem";
import { mainnet } from "viem/chains";

import * as Ensforge from "#/client/Ensforge";

import { deployment, other, signer, year } from "../world.js";

const { ethRegistrar } = deployment.v2.contracts;
const { ethRenewerV1 } = deployment.v2.migration;
const { usdc } = deployment.v2.paymentTokens;
const oracle = "0x00000000000000000000000000000000000000fe";

type Chain = {
  /** Labels each renewal route accepts, with their price. */
  readonly v2: Readonly<Record<string, bigint>>;
  readonly v1: Readonly<Record<string, bigint>>;
  readonly balance?: bigint;
  readonly allowance?: (spender: string) => bigint;
};

const renewer = (prices: Readonly<Record<string, bigint>>) => ({
  isRenewable: ([label]: readonly unknown[]) => (label as string) in prices,
  getRenewPrice: ([label]: readonly unknown[]) => prices[label as string] ?? 0n,
});

const clientFor = (chain: Chain) => {
  const { transport } = scriptedTransport(
    contractScript({
      contracts: [
        {
          address: ethRegistrar,
          abi: Abis.v2.ethRegistrar,
          functions: { rentPriceOracle: () => oracle, ...renewer(chain.v2) },
        },
        { address: ethRenewerV1, abi: Abis.v2.ethRegistrar, functions: renewer(chain.v1) },
        {
          address: usdc,
          abi: Abis.shared.erc20 as Abi,
          functions: {
            balanceOf: () => chain.balance ?? 10n ** 12n,
            allowance: ([, spender]) => chain.allowance?.(spender as string) ?? 0n,
          },
        },
      ],
    }),
  );
  return Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    account: signer,
    batch: { multicall: false },
  });
};

const decode = (data: `0x${string}`) =>
  decodeFunctionData({ abi: Abis.v2.ethRegistrar, data }) as {
    functionName: string;
    args: readonly unknown[];
  };

describe("registration.renew.prepare", () => {
  it("renews each name through the contract that accepts it, approving each spender", async () => {
    const ens = clientFor({ v2: { alice: 5n }, v1: { bob: 7n, carol: 11n } });

    const plan = await Actions.registration.renew.prepare(ens, {
      names: ["alice.eth", "bob.eth", "carol.eth"],
      duration: year,
    });

    assert.deepStrictEqual(
      plan.steps.map((step) => step.id),
      ["approve", "renew"],
    );
    assert.deepStrictEqual(
      (plan.steps[0]?.calls ?? []).map((call) => [
        call.to,
        decodeFunctionData({ abi: Abis.shared.erc20, data: call.data }).args,
      ]),
      [
        [usdc, [ethRegistrar, 5n]],
        [usdc, [ethRenewerV1, 18n]],
      ],
    );
    const [v2Call, v1Call] = plan.steps[1]?.calls ?? [];
    assert.strictEqual(v2Call?.to, ethRegistrar);
    assert.deepStrictEqual(decode(v2Call?.data ?? "0x"), {
      functionName: "renew",
      args: [{ label: "alice", duration: year, referrer: zeroHash }, usdc],
    });
    assert.strictEqual(v1Call?.to, ethRenewerV1);
    assert.deepStrictEqual(decode(v1Call?.data ?? "0x"), {
      functionName: "renewBatch",
      args: [
        [
          { label: "bob", duration: year, referrer: zeroHash },
          { label: "carol", duration: year, referrer: zeroHash },
        ],
        usdc,
      ],
    });
    assert.deepStrictEqual(plan.requirements, [{ kind: "balance", amount: 23n, token: usdc }]);
  });

  it("skips approvals the allowance already covers and pads an address referrer", async () => {
    const ens = clientFor({ v2: { alice: 5n }, v1: {}, allowance: () => 5n });

    const plan = await Actions.registration.renew.prepare(ens, {
      names: "alice.eth",
      duration: year,
      referrer: other,
    });

    assert.deepStrictEqual(
      plan.steps.map((step) => step.id),
      ["renew"],
    );
    const { args } = decode(plan.calls[0]?.data ?? "0x");
    assert.strictEqual((args[0] as { referrer: string }).referrer, pad(other, { size: 32 }));
  });

  it.each([
    ["no contract accepts the name", { v2: {}, v1: {} }, "NameStateError", "NAME_NOT_RENEWABLE"],
    [
      "the balance does not cover the total",
      { v2: { alice: 5n }, v1: {}, balance: 4n },
      "InsufficientFundsError",
      "INSUFFICIENT_TOKEN_BALANCE",
    ],
  ] as const)("fails before signing when %s", (_, chain, tag, code) =>
    Effect.runPromise(
      Effect.asVoid(
        expectRejection(
          () =>
            Actions.registration.renew.prepare(clientFor(chain), {
              names: "alice.eth",
              duration: year,
            }),
          { _tag: tag, code },
        ),
      ),
    ),
  );

  it.each(["alice.bob.eth", "alice.com"])("rejects %s as not a .eth 2LD", (name) =>
    Effect.runPromise(
      Effect.asVoid(
        expectRejection(
          () =>
            Actions.registration.renew.prepare(clientFor({ v2: {}, v1: {} }), {
              names: name,
              duration: year,
            }),
          { _tag: "InvalidInputError", code: "INVALID_NAME" },
        ),
      ),
    ),
  );
});
