import { describe, it } from "@effect/vitest";
import { String as Str, type Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import {
  expectFailure,
  expectRejection,
  noRpc,
  scriptedTransport,
  type ExpectedError,
} from "@ensforge/test-harness";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";

import { asPromiseAction, propertyOf } from "./action-tree";

// Read options that cannot be right fail with a typed error before any RPC request (`noRpc`).

const name = "nick.eth";
const address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
const badAddress = "0x1234";

const client = (deployment?: Deployments.Profile) =>
  Ensforge.create({
    publicClient: createPublicClient({
      chain: mainnet,
      transport: scriptedTransport(noRpc).transport,
    }),
    ...(deployment === undefined ? {} : { deployment }),
  });

const invalidAddress: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };
const invalidCoin: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" };
const invalidValue: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" };

// Each case runs through the Promise and the Effect actions alike: both take the same arguments
// (`paths.test.ts`), and the Effect form must fail with the typed error, never a defect.
type Call = (actions: typeof Actions) => Promise<unknown>;
const asEffect = (call: Call) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Effect actions take the same arguments but return Effects, not Promises
  call(EffectActions as unknown as typeof Actions) as unknown as Effect.Effect<
    object,
    { readonly _tag: string }
  >;

const cases: readonly (readonly [string, Call, ExpectedError])[] = [
  [
    "approval.getDelegate",
    (actions) => actions.approval.getDelegate(client(), { name, delegate: badAddress }),
    invalidAddress,
  ],
  [
    "migration.get",
    (actions) => actions.migration.get(client(), { name, account: badAddress }),
    invalidAddress,
  ],
  [
    "permission.check",
    (actions) =>
      actions.permission.check(client(), { name, operation: "transfer", account: badAddress }),
    invalidAddress,
  ],
  [
    "permission.check",
    (actions) => actions.permission.check(client(), { name, operation: "transfer" }),
    { _tag: "ConfigError", code: "WALLET_NOT_CONFIGURED" },
  ],
  [
    "permission.get",
    (actions) => actions.permission.get(client(), { name, account: badAddress }),
    invalidAddress,
  ],
  [
    "permission.get",
    (actions) => actions.permission.get(client(), { name }),
    { _tag: "ConfigError", code: "WALLET_NOT_CONFIGURED" },
  ],
  ["plan.list", (actions) => actions.plan.list(client(), { account: badAddress }), invalidAddress],
  [
    "primaryName.get",
    (actions) => actions.primaryName.get(client(), { address: badAddress }),
    invalidAddress,
  ],
  [
    "primaryName.get",
    (actions) => actions.primaryName.get(client(), { address, coin: "nope" }),
    invalidCoin,
  ],
  [
    "record.get",
    (actions) => actions.record.get(client(), { name, addresses: ["nope"] }),
    invalidCoin,
  ],
  [
    "record.getAddress",
    (actions) => actions.record.getAddress(client(), { name, coin: "nope" }),
    invalidCoin,
  ],
  [
    "registration.getCommitmentStatus",
    (actions) => actions.registration.getCommitmentStatus(client(), { commitment: "0x12" }),
    invalidValue,
  ],
  [
    "registry.get",
    (actions) => actions.registry.get(client(), { registry: badAddress }),
    invalidAddress,
  ],
  [
    "resolver.resolve",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately invalid calldata
    (actions) => actions.resolver.resolve(client(), { name, data: "zz" as never }),
    invalidValue,
  ],
  [
    "role.get",
    (actions) => actions.role.get(client(), { account: badAddress, target: "registry", name }),
    invalidAddress,
  ],
  [
    "role.get",
    (actions) => actions.role.get(client(), { account: address, target: "registry" }),
    invalidValue,
  ],
  [
    "name.getLabel",
    (actions) => actions.name.getLabel(client(), { labelhash: "0x12" }),
    invalidValue,
  ],
  [
    "name.getLabel",
    (actions) =>
      actions.name.getLabel(client({ name: "mainnet", chainId: 1, v1: Deployments.mainnet.v1 }), {
        labelhash: `0x${Str.repeat(32)("00")}`,
      }),
    { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
  ],
  [
    "approval.getOperator",
    (actions) =>
      actions.approval.getOperator(
        client({ name: "mainnet", chainId: 1, v2: Deployments.mainnet.v2 }),
        {
          owner: address,
          operator: address,
          contract: "registrar",
        },
      ),
    { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
  ],
];

describe("read input errors", () => {
  it.effect.each(cases)("%s fails before reading the chain", ([, read, expected]) =>
    // Only the rejection matters, so a success is not typed `unknown`.
    expectRejection(() => read(Actions).then(() => undefined), expected),
  );

  it.effect.each(cases)("%s fails as an Effect with the same error", ([, read, expected]) =>
    expectFailure(asEffect(read), expected),
  );
});

// Options that satisfy every indexer read, so only the missing indexer is wrong.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- one object stands in for the options of every indexer read
const indexerOptions = {
  name,
  address,
  account: address,
  roleHolder: address,
  registry: { address },
  inputs: [name],
  query: "nick",
  before: 1_800_000_000n,
} as never;

const indexerReads = [
  "indexer.getEvents",
  "indexer.getHistory",
  "indexer.getNamesByExpiry",
  "indexer.getNamesForAddress",
  "indexer.getNamespace",
  "indexer.getPermissions",
  "indexer.getPrimaryName",
  "indexer.getRecords",
  "indexer.getRegistry",
  "indexer.getRegistryLabels",
  "indexer.getResolver",
  "indexer.getResolverLinks",
  "indexer.getResolverRoles",
  "indexer.getResolvers",
  "indexer.lookup",
  "indexer.search",
] as const;

describe("indexer reads", () => {
  it.effect.each(indexerReads)("%s fails without a configured indexer", (path) => {
    const read = asPromiseAction(propertyOf(Actions.indexer, Str.slice("indexer.".length)(path)));

    // `getPermissions` takes exactly one subject.
    return expectRejection(
      () => read(client(), path === "indexer.getPermissions" ? { name } : indexerOptions),
      { _tag: "ConfigError", code: "INDEXER_NOT_CONFIGURED" },
    );
  });
});
