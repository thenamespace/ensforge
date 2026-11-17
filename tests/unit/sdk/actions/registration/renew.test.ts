import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions, Duration } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  createPublicClient,
  decodeFunctionData,
  isAddressEqual,
  numberToHex,
  zeroHash,
  type Abi,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";

import { other, signer } from "../world.js";

const { ethRegistrar } = Deployments.mainnet.v2.contracts;
const { ethRenewerV1 } = Deployments.mainnet.v2.migration;
const { usdc } = Deployments.mainnet.v2.paymentTokens;
const year = Duration.years(1);

type Renewal = {
  /** Labels each renewal route accepts, with their price. */
  readonly v2: Readonly<Record<string, bigint>>;
  readonly v1: Readonly<Record<string, bigint>>;
  /** The USDC balance of `holder` (default 10^12 for everyone). */
  readonly balanceOf?: (holder: Address) => bigint;
  readonly allowance?: (spender: Address) => bigint;
};

/** Scripted `isRenewable`/`getRenewPrice` of a renewal route accepting `prices`' labels. */
const renewer = (prices: Readonly<Record<string, bigint>>) => ({
  isRenewable: ([label]: readonly unknown[]) => (label as string) in prices,
  getRenewPrice: ([label]: readonly unknown[]) => prices[label as string] ?? 0n,
});

/** A client whose ENSv2 registrar and ENSv1 renewer accept the given labels at their prices. */
const clientFor = (renewal: Renewal) => {
  const { transport } = scriptedTransport(
    contractScript({
      contracts: [
        {
          address: ethRegistrar,
          abi: Abis.v2.ethRegistrar,
          functions: {
            rentPriceOracle: () => "0x00000000000000000000000000000000000000fe",
            ...renewer(renewal.v2),
          },
        },
        { address: ethRenewerV1, abi: Abis.v2.ethRegistrar, functions: renewer(renewal.v1) },
        {
          address: usdc,
          abi: Abis.shared.erc20 as Abi,
          functions: {
            balanceOf: ([holder]) => renewal.balanceOf?.(holder as Address) ?? 10n ** 12n,
            allowance: ([, spender]) => renewal.allowance?.(spender as Address) ?? 0n,
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

describe("registration.renew.prepare", () => {
  it.effect("renews each name through the contract that accepts it, approving each spender", () =>
    Effect.gen(function* () {
      const ens = clientFor({ v2: { alice: 5n }, v1: { bob: 7n, carol: 11n } });

      const plan = yield* Actions.registration.renew.prepare(ens, {
        names: ["alice.eth", "bob.eth", "carol.eth"],
        duration: year,
      });

      const [approve, renew] = plan.steps;
      assert.deepStrictEqual(
        plan.steps.map((step) => step.id),
        ["approve", "renew"],
      );
      assert.deepStrictEqual(
        (approve?.calls ?? []).map((call) => [
          call.to,
          decodeFunctionData({ abi: Abis.shared.erc20, data: call.data }).args,
        ]),
        [
          [usdc, [ethRegistrar, 5n]],
          [usdc, [ethRenewerV1, 18n]],
        ],
      );
      assert.deepStrictEqual(
        (renew?.calls ?? []).map((call) => [
          call.to,
          decodeFunctionData({ abi: Abis.v2.ethRegistrar, data: call.data }),
        ]),
        [
          [
            ethRegistrar,
            {
              functionName: "renew",
              args: [{ label: "alice", duration: year, referrer: zeroHash }, usdc],
            },
          ],
          [
            ethRenewerV1,
            {
              functionName: "renewBatch",
              args: [
                [
                  { label: "bob", duration: year, referrer: zeroHash },
                  { label: "carol", duration: year, referrer: zeroHash },
                ],
                usdc,
              ],
            },
          ],
        ],
      );
      assert.deepStrictEqual(plan.requirements, [{ kind: "balance", amount: 23n, token: usdc }]);
    }),
  );

  it.effect("skips approvals the allowance already covers and pads an address referrer", () =>
    Effect.gen(function* () {
      const ens = clientFor({ v2: { alice: 5n }, v1: {}, allowance: () => 5n });

      const plan = yield* Actions.registration.renew.prepare(ens, {
        names: "alice.eth",
        duration: year,
        referrer: other,
      });

      assert.deepStrictEqual(
        plan.steps.map((step) => step.id),
        ["renew"],
      );
      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v2.ethRegistrar, data: plan.calls[0]?.data ?? "0x" }),
        {
          functionName: "renew",
          args: [
            { label: "alice", duration: year, referrer: numberToHex(BigInt(other), { size: 32 }) },
            usdc,
          ],
        },
      );
    }),
  );

  it.effect.each([
    ["no contract accepts the name", { v2: {}, v1: {} }, "NameStateError", "NAME_NOT_RENEWABLE"],
    [
      "the balance does not cover the total",
      { v2: { alice: 5n }, v1: {}, balanceOf: () => 4n },
      "InsufficientFundsError",
      "INSUFFICIENT_TOKEN_BALANCE",
    ],
  ] as const)("fails before signing when %s", ([, renewal, tag, code]) =>
    expectFailure(
      Actions.registration.renew.prepare(clientFor(renewal), {
        names: "alice.eth",
        duration: year,
      }),
      { _tag: tag, code },
    ),
  );

  it.effect.each(["alice.bob.eth", "alice.com"])("rejects %s as not a .eth 2LD", (name) =>
    expectFailure(
      Actions.registration.renew.prepare(clientFor({ v2: {}, v1: {} }), {
        names: name,
        duration: year,
      }),
      { _tag: "InvalidInputError", code: "INVALID_NAME" },
    ),
  );

  // Regression: a route's account sends `renew` and pays, but the payment was planned for the signer.
  it.effect("plans the payment for the account a route sends from", () =>
    Effect.gen(function* () {
      // Only the signer holds the token.
      const ens = clientFor({
        v2: { alice: 5n },
        v1: {},
        balanceOf: (holder) => (isAddressEqual(holder, signer) ? 10n ** 12n : 0n),
      });
      const options = { names: "alice.eth", duration: year } as const;

      yield* Actions.registration.renew.prepare(ens, options);
      yield* expectFailure(
        Actions.registration.renew.prepare(ens, {
          ...options,
          // `sender` is the route's adapter boundary, a Promise by contract.
          via: { id: "account", sender: async () => other },
        }),
        { _tag: "InsufficientFundsError", code: "INSUFFICIENT_TOKEN_BALANCE" },
      );
    }),
  );
});
