import { assert, describe, it } from "@effect/vitest";
/* oxlint-disable typescript/no-unsafe-type-assertion -- stub arguments arrive as `unknown[]`, decoded against the stubbed ABI */
import { Array as Arr, Effect, Option, Record as Rec } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions, Duration } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  decodeFunctionData,
  isAddressEqual,
  labelhash,
  multicall3Abi,
  numberToHex,
  zeroHash,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";

import { other, signer } from "../world.js";

const { ethRegistrar } = Deployments.mainnet.v2.contracts;
const { ethRenewerV1 } = Deployments.mainnet.v2.migration;
const { usdc } = Deployments.mainnet.v2.paymentTokens;
const year = Duration.years(1);
const now = 1_800_000_000n;

type Renewal = {
  /** Labels each renewal route accepts, with their price. */
  readonly v2: Readonly<Record<string, bigint>>;
  readonly v1: Readonly<Record<string, bigint>>;
  /** The USDC balance of `holder` (default 10^12 for everyone). */
  readonly balanceOf?: (holder: Address) => bigint;
  readonly allowance?: (spender: Address) => bigint;
  /** Each label's expiry on its route (default a year from now). */
  readonly expiry?: Readonly<Record<string, bigint>>;
};

/** Scripted `isRenewable`/`getRenewPrice` of a renewal route accepting `prices`' labels. */
const renewer = (prices: Readonly<Record<string, bigint>>) => ({
  isRenewable: ([label]: readonly unknown[]) => String(label) in prices,
  getRenewPrice: ([label]: readonly unknown[]) => prices[String(label)] ?? 0n,
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
          abi: Abis.shared.erc20,
          functions: {
            balanceOf: ([holder]) => renewal.balanceOf?.(holder as Address) ?? 10n ** 12n,
            allowance: ([, spender]) => renewal.allowance?.(spender as Address) ?? 0n,
          },
        },
        {
          address: Deployments.mainnet.v2.contracts.ethRegistry,
          abi: Abis.v2.permissionedRegistry,
          functions: {
            findExpiry: ([label]) => renewal.expiry?.[String(label)] ?? now + year,
          },
        },
        {
          address: Deployments.mainnet.v1.contracts.baseRegistrar,
          abi: Abis.v1.baseRegistrar,
          functions: {
            nameExpires: ([id]) =>
              Arr.findFirst(
                Rec.toEntries(renewal.expiry ?? {}),
                ([label]) => BigInt(labelhash(label)) === id,
              ).pipe(Option.match({ onNone: () => now + year, onSome: ([, expiry]) => expiry })),
          },
        },
        {
          address: mainnet.contracts.multicall3.address,
          abi: multicall3Abi,
          functions: { getCurrentBlockTimestamp: () => now },
        },
      ],
    }),
  );

  return Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport },
    publicRpc: false,
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

      // Each route's renew call is its own step, so a resume never renews a mined one again.
      const [approve, ...renews] = plan.steps;
      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.id),
        ["approve", "renew:v2:0", "renew:v1:0"],
      );
      assert.deepStrictEqual(
        Arr.map(approve?.calls ?? [], (call) => [
          call.to,
          decodeFunctionData({ abi: Abis.shared.erc20, data: call.data }).args,
        ]),
        [
          [usdc, [ethRegistrar, 5n]],
          [usdc, [ethRenewerV1, 18n]],
        ],
      );
      assert.deepStrictEqual(
        Arr.map(
          Arr.flatMap(renews, (step) => step.calls),
          (call) => [call.to, decodeFunctionData({ abi: Abis.v2.ethRegistrar, data: call.data })],
        ),
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
        Arr.map(plan.steps, (step) => step.id),
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

  // Regression: a route's account sends `renew` and pays, but the payment was planned for the
  // signer. The signer's balance counts too, since a route funds its account first.
  it.effect("plans the payment for the account a route sends from, funded by the signer", () =>
    Effect.gen(function* () {
      const options = {
        names: "alice.eth",
        duration: year,
        // `sender` is the route's adapter boundary, a Promise by contract.
        // oxlint-disable-next-line effecttsgo/async-function -- the Promise-typed sender boundary under test
        via: { id: "account", sender: async () => other },
      } as const;
      const funded = clientFor({
        v2: { alice: 5n },
        v1: {},
        balanceOf: (holder) => (isAddressEqual(holder, signer) ? 10n ** 12n : 0n),
      });
      const empty = clientFor({ v2: { alice: 5n }, v1: {}, balanceOf: () => 0n });

      const plan = yield* Actions.registration.renew.prepare(funded, options);
      assert.deepInclude(plan.requirements[0], { kind: "balance", account: other });
      yield* expectFailure(Actions.registration.renew.prepare(empty, options), {
        _tag: "InsufficientFundsError",
        code: "INSUFFICIENT_TOKEN_BALANCE",
      });
    }),
  );

  // Regression: a name renewed in grace by less than it has been expired was paid for and stayed
  // expired.
  it.effect("refuses a grace renewal that leaves the name expired, naming the minimum", () =>
    Effect.gen(function* () {
      const ens = clientFor({ v2: { alice: 5n }, v1: {}, expiry: { alice: now - 20n * 86_400n } });

      const error = yield* expectFailure(
        Actions.registration.renew.prepare(ens, { names: "alice.eth", duration: 7n * 86_400n }),
        { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
      );
      assert.include(error.hint, `${21n * 86_400n + 1n} seconds`);
      yield* Actions.registration.renew.prepare(ens, {
        names: "alice.eth",
        duration: 21n * 86_400n + 1n,
      });
    }),
  );

  it.effect("renews each name up to `until`, skipping names that already reach it", () =>
    Effect.gen(function* () {
      const until = now + 2n * year;
      const ens = clientFor({
        v2: { alice: 5n, bob: 7n },
        v1: { carol: 11n },
        expiry: { alice: now + year, bob: until, carol: now + 10n },
      });

      const plan = yield* Actions.registration.renew.prepare(ens, {
        names: ["alice.eth", "bob.eth", "carol.eth"],
        until,
      });

      assert.deepStrictEqual(
        Arr.flatMap(plan.steps, (step) =>
          step.id === "approve"
            ? []
            : Arr.map(step.calls, (call) => {
                const decoded = decodeFunctionData({ abi: Abis.v2.ethRegistrar, data: call.data });
                return decoded.functionName === "renew" ? decoded.args[0] : undefined;
              }),
        ),
        [
          { label: "alice", duration: year, referrer: zeroHash },
          { label: "carol", duration: 2n * year - 10n, referrer: zeroHash },
        ],
      );
      assert.deepStrictEqual(
        Arr.map(plan.warnings, (warning) => warning.code),
        ["NAME_ALREADY_RENEWED"],
      );
    }),
  );

  it.effect.each([
    ["every name already reaches it", now + year, "NameStateError", "NAME_ALREADY_RENEWED"],
    ["it is in the past", now, "InvalidInputError", "INVALID_EXPIRY"],
  ] as const)("refuses `until` when %s", ([, until, tag, code]) =>
    expectFailure(
      Actions.registration.renew.prepare(clientFor({ v2: { alice: 5n }, v1: {} }), {
        names: "alice.eth",
        until,
      }),
      { _tag: tag, code },
    ),
  );

  it.effect.each([
    ["0x01", numberToHex(1n, { size: 32 })],
    [other, numberToHex(BigInt(other), { size: 32 })],
  ] as const)("left-pads a referrer of up to 32 bytes: %s", ([referrer, padded]) =>
    Effect.gen(function* () {
      const plan = yield* Actions.registration.renew.prepare(
        clientFor({ v2: { alice: 5n }, v1: {}, allowance: () => 5n }),
        { names: "alice.eth", duration: year, referrer },
      );

      const decoded = decodeFunctionData({
        abi: Abis.v2.ethRegistrar,
        data: plan.calls[0]?.data ?? "0x",
      });
      assert.deepInclude(decoded.args?.[0], { referrer: padded });
    }),
  );

  it.effect("warns when a name was written in another form", () =>
    Effect.gen(function* () {
      const plan = yield* Actions.registration.renew.prepare(
        clientFor({ v2: { alice: 5n }, v1: {} }),
        { names: "Alice.ETH", duration: year },
      );

      assert.deepStrictEqual(
        Arr.map(plan.warnings, (warning) => warning.code),
        ["NAME_NORMALIZED"],
      );
    }),
  );
});
