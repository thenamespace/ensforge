import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, pipe, String as Str } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, namehash, zeroAddress, type Address } from "viem";

import { clientFor, decodeCalls, other, resolverA, signer } from "../world.js";

// `verify: false` skips the forward-resolution check, which goes through the Universal Resolver.
/** `primaryName.set.prepare` naming `other`, a contract with this Ownable owner and namers. */
const prepareForContract = (
  contract: { readonly owner: Address; readonly namers: readonly Address[] },
  v1Only = false,
) =>
  Actions.primaryName.set.prepare(
    clientFor({ name: "alice.eth", v1Only, contracts: { [other]: contract } }).ens,
    { name: "alice.eth", address: other, verify: false },
  );

/** A route whose account is `hca`. */
// `sender` is the route's adapter boundary, a Promise by contract.
// oxlint-disable-next-line effecttsgo/async-function -- the Promise-typed sender boundary under test
const through = (hca: Address) => ({ id: "account", sender: async () => hca });

describe("primaryName.set.prepare", () => {
  it.effect.each([
    ["the signer's own name", { name: "Alice.eth" }, "Set primary name", "setName", ["alice.eth"]],
    // Removing the node's resolver, not an empty name, lets the default name apply on Ethereum.
    ["a clear", { name: null }, "Clear primary name", "claimWithResolver", [signer, zeroAddress]],
    [
      "the name of an account the signer operates, through the registrar's default resolver",
      { name: "alice.eth", address: other },
      "Set primary name",
      "setNameForAddr",
      [other, other, resolverA, "alice.eth"],
    ],
  ] as const)(
    "writes %s on the reverse registrar",
    ([, options, description, functionName, args]) =>
      Effect.gen(function* () {
        const { ens } = clientFor({ name: "alice.eth", approvedForAll: true });

        const plan = yield* Actions.primaryName.set.prepare(ens, { ...options, verify: false });

        const decoded = decodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          data: plan.calls[0]?.data ?? "0x",
        });
        assert.strictEqual(plan.steps[0]?.description, description);
        assert.strictEqual(plan.calls[0]?.to, Deployments.mainnet.v1.contracts.reverseRegistrar);
        assert.strictEqual(decoded.functionName, functionName);
        assert.deepStrictEqual(decoded.args, args);
      }),
  );

  it.effect("checks the target address before reading anything", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientFor({ name: "alice.eth" });

      yield* expectFailure(
        Actions.primaryName.set.prepare(ens, { name: "alice.eth", address: "0x12" }),
        { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      );

      assert.deepStrictEqual(calls, []);
    }),
  );

  // `other` is a contract here: the v1 registrar names it for its Ownable owner, the ENSv2 adapter
  // lets its ContractNamer claim its reverse node and then set the name there.
  it.effect("routes a contract's name by what the signer is to it", () =>
    Effect.gen(function* () {
      const v1 = Deployments.mainnet.v1.contracts;
      const abi = [
        ...Abis.v1.reverseRegistrar,
        ...Abis.v2.reverseRegistrarAdapter,
        ...Abis.v1.publicResolver,
      ];

      const owned = yield* prepareForContract({ owner: signer, namers: [] });
      assert.deepStrictEqual(decodeCalls(owned.calls, abi), [
        [v1.reverseRegistrar, "setNameForAddr", [other, other, resolverA, "alice.eth"]],
      ]);

      const named = yield* prepareForContract({ owner: zeroAddress, namers: [signer] });
      assert.strictEqual(named.steps.length, 1);
      assert.deepStrictEqual(decodeCalls(named.calls, abi), [
        [Deployments.mainnet.v2.contracts.reverseRegistrarAdapter, "claim", [other, resolverA]],
        [
          resolverA,
          "setName",
          [namehash(`${pipe(other, Str.slice(2), Str.toLowerCase)}.addr.reverse`), "alice.eth"],
        ],
      ]);

      yield* expectFailure(prepareForContract({ owner: zeroAddress, namers: [] }), {
        _tag: "UnauthorizedError",
        code: "NOT_APPROVED",
      });
      yield* expectFailure(prepareForContract({ owner: zeroAddress, namers: [signer] }, true), {
        _tag: "UnsupportedError",
        code: "UNSUPPORTED_ON_DEPLOYMENT",
      });
    }),
  );

  it.effect("refuses an account the signer may not name before sending", () =>
    expectFailure(
      Actions.primaryName.set.prepare(clientFor({ name: "alice.eth" }).ens, {
        name: "alice.eth",
        address: other,
        verify: false,
      }),
      { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
    ),
  );

  const reverseNode = namehash(`${pipe(signer, Str.slice(2), Str.toLowerCase)}.addr.reverse`);
  const v1 = Deployments.mainnet.v1.contracts;
  const v2 = Deployments.mainnet.v2.contracts;
  const abi = [
    ...Abis.v1.reverseRegistrar,
    ...Abis.v1.defaultReverseRegistrar,
    ...Abis.v2.reverseRegistrarAdapter,
    ...Abis.v2.defaultReverseRegistrarAdapter,
  ];
  /** A world whose `addr.reverse` node has a resolver answering `name`, or none. */
  const withAddrReverse = (name: string | undefined) => ({
    name: "alice.eth",
    ...(name === undefined
      ? {}
      : {
          names: {
            [`${pipe(signer, Str.slice(2), Str.toLowerCase)}.addr.reverse`]: {
              v1: { owner: signer, resolver: resolverA },
            },
          },
          nameRecords: { [reverseNode]: name },
        }),
  });
  const setDefault = [v1.defaultReverseRegistrar, "setName", ["alice.eth"]] as const;
  const clearDefault = [v1.defaultReverseRegistrar, "setName", [""]] as const;
  const clearEth = [v1.reverseRegistrar, "claimWithResolver", [signer, zeroAddress]] as const;

  // An `addr.reverse` entry with a resolver outranks `default.reverse` on Ethereum, even empty.
  it.effect.each([
    [
      "sets the default, clearing an entry with another name",
      "default",
      "alice.eth",
      "old.eth",
      [setDefault, clearEth],
    ],
    [
      "sets the default, clearing an entry with an empty name",
      "default",
      "alice.eth",
      "",
      [setDefault, clearEth],
    ],
    [
      "sets the default, keeping an entry with the same name",
      "default",
      "alice.eth",
      "alice.eth",
      [setDefault],
    ],
    ["sets the default when no entry hides it", "default", "alice.eth", undefined, [setDefault]],
    ["clears the default, leaving the Ethereum name", "default", null, "old.eth", [clearDefault]],
    ["clears both with all", "all", null, "old.eth", [clearDefault, clearEth]],
    ["sets all like the default", "all", "alice.eth", "old.eth", [setDefault, clearEth]],
  ] as const)("%s", ([, coin, name, entry, expected]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(withAddrReverse(entry));

      const plan = yield* Actions.primaryName.set.prepare(ens, { name, coin, verify: false });

      assert.deepStrictEqual<readonly unknown[]>(decodeCalls(plan.calls, abi), expected);
    }),
  );

  // The adapters accept the signer's HCA; it has no entry point for an `addr.reverse` name.
  it.effect.each([
    [
      "the default name, clearing an entry with another name",
      { name: "alice.eth", coin: "default" },
      [
        [v2.defaultReverseRegistrarAdapter, "setNameWithHCA", [signer, "alice.eth"]],
        [v2.reverseRegistrarAdapter, "claimWithHCA", [signer, zeroAddress]],
      ],
      [],
    ],
    [
      "all, like the default",
      { name: "alice.eth", coin: "all" },
      [
        [v2.defaultReverseRegistrarAdapter, "setNameWithHCA", [signer, "alice.eth"]],
        [v2.reverseRegistrarAdapter, "claimWithHCA", [signer, zeroAddress]],
      ],
      [],
    ],
    [
      "an Ethereum clear",
      { name: null, coin: "eth" },
      [[v2.reverseRegistrarAdapter, "claimWithHCA", [signer, zeroAddress]]],
      [],
    ],
    [
      "an Ethereum name, from the signer",
      { name: "alice.eth", coin: "eth" },
      [],
      [[v1.reverseRegistrar, "setName", ["alice.eth"]]],
    ],
  ] as const)("names the owner through its HCA: %s", ([, options, routed, own]) =>
    Effect.gen(function* () {
      const world = { ...withAddrReverse("old.eth"), hcas: { [signer]: other } };

      const plan = yield* Actions.primaryName.set.prepare(clientFor(world).ens, {
        ...options,
        verify: false,
        via: through(other),
      });

      const step = (from: "signer" | undefined) =>
        decodeCalls(
          Option.getOrUndefined(Arr.findFirst(plan.steps, (candidate) => candidate.from === from))
            ?.calls ?? [],
          abi,
        );
      assert.deepStrictEqual<readonly unknown[]>(step(undefined), routed);
      assert.deepStrictEqual<readonly unknown[]>(step("signer"), own);
      assert.deepStrictEqual(
        Arr.map(plan.warnings, (warning) => warning.code),
        own.length === 0 ? [] : ["PRIMARY_NAME_ROUTED_TO_SIGNER"],
      );
    }),
  );

  it.effect("sends from the signer through a route that is not its HCA", () =>
    Effect.gen(function* () {
      const plan = yield* Actions.primaryName.set.prepare(
        clientFor(withAddrReverse(undefined)).ens,
        {
          name: "alice.eth",
          coin: "default",
          verify: false,
          via: through(other),
        },
      );

      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.from),
        ["signer"],
      );
      assert.deepStrictEqual(decodeCalls(plan.calls, abi), [setDefault]);
      assert.deepStrictEqual(
        Arr.map(plan.warnings, (warning) => warning.code),
        ["PRIMARY_NAME_ROUTED_TO_SIGNER"],
      );
    }),
  );

  it.effect("refuses an L2 primary name through a route that sends as another account", () =>
    expectFailure(
      Actions.primaryName.set.prepare(clientFor({ name: "alice.eth" }).ens, {
        name: "alice.eth",
        coin: { chainId: 8453 },
        verify: false,
        via: through(other),
      }),
      { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
    ),
  );

  // Regression: a testnet L2 was accepted on mainnet and failed later, on a chain the client has
  // no transport for.
  it.effect("refuses an L2 of the other network, naming the network to use", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth" });

      const error = yield* expectFailure(
        Actions.primaryName.set.prepare(ens, {
          name: "alice.eth",
          coin: { chainId: 84532 },
          verify: false,
        }),
        { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
      );
      assert.include(error.hint, "Sepolia");
    }),
  );
});
