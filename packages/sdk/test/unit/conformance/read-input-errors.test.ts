import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";
import {
  expectRejection,
  noRpc,
  scriptedTransport,
  type ExpectedError,
} from "@ensforge/test-harness";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";

import * as Ensforge from "#/client/Ensforge";

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

const mainnetV1Only: Deployments.Profile = {
  name: "mainnet",
  chainId: 1,
  v1: Deployments.mainnet.v1,
};
const mainnetV2Only: Deployments.Profile = {
  name: "mainnet",
  chainId: 1,
  v2: Deployments.mainnet.v2,
};

const invalidAddress: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };
const invalidCoin: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" };
const invalidValue: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" };
const noWallet: ExpectedError = { _tag: "ConfigError", code: "WALLET_NOT_CONFIGURED" };
const unsupported: ExpectedError = { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" };

const cases: readonly (readonly [string, () => Promise<unknown>, ExpectedError])[] = [
  [
    "approval.getDelegate",
    () => Actions.approval.getDelegate(client(), { name, delegate: badAddress }),
    invalidAddress,
  ],
  [
    "migration.get",
    () => Actions.migration.get(client(), { name, account: badAddress }),
    invalidAddress,
  ],
  [
    "permission.check",
    () => Actions.permission.check(client(), { name, operation: "transfer", account: badAddress }),
    invalidAddress,
  ],
  [
    "permission.check",
    () => Actions.permission.check(client(), { name, operation: "transfer" }),
    noWallet,
  ],
  [
    "permission.get",
    () => Actions.permission.get(client(), { name, account: badAddress }),
    invalidAddress,
  ],
  ["permission.get", () => Actions.permission.get(client(), { name }), noWallet],
  ["plan.list", () => Actions.plan.list(client(), { account: badAddress }), invalidAddress],
  [
    "primaryName.get",
    () => Actions.primaryName.get(client(), { address: badAddress }),
    invalidAddress,
  ],
  [
    "primaryName.get",
    () => Actions.primaryName.get(client(), { address, coin: "nope" }),
    invalidCoin,
  ],
  ["record.get", () => Actions.record.get(client(), { name, addresses: ["nope"] }), invalidCoin],
  [
    "record.getAddress",
    () => Actions.record.getAddress(client(), { name, coin: "nope" }),
    invalidCoin,
  ],
  [
    "registration.getCommitmentStatus",
    () => Actions.registration.getCommitmentStatus(client(), { commitment: "0x12" }),
    invalidValue,
  ],
  ["registry.get", () => Actions.registry.get(client(), { registry: badAddress }), invalidAddress],
  [
    "resolver.resolve",
    () => Actions.resolver.resolve(client(), { name, data: "zz" as never }),
    invalidValue,
  ],
  [
    "role.get",
    () => Actions.role.get(client(), { account: badAddress, target: "registry", name }),
    invalidAddress,
  ],
  [
    "role.get",
    () => Actions.role.get(client(), { account: address, target: "registry" }),
    invalidValue,
  ],
  ["name.getLabel", () => Actions.name.getLabel(client(), { labelhash: "0x12" }), invalidValue],
  [
    "name.getLabel",
    () => Actions.name.getLabel(client(mainnetV1Only), { labelhash: `0x${"00".repeat(32)}` }),
    unsupported,
  ],
  [
    "approval.getOperator",
    () =>
      Actions.approval.getOperator(client(mainnetV2Only), {
        owner: address,
        operator: address,
        contract: "registrar",
      }),
    unsupported,
  ],
];

describe("read input errors", () => {
  it.each(cases)("%s fails before reading the chain", (_, read, expected) =>
    Effect.runPromise(Effect.asVoid(expectRejection(read, expected))),
  );
});

// Options that satisfy every indexer read, so only the missing indexer is wrong.
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
  it.each(indexerReads)("%s fails without a configured indexer", (path) => {
    const read = Actions.indexer[path.slice("indexer.".length) as keyof typeof Actions.indexer] as (
      client: unknown,
      options: unknown,
    ) => Promise<unknown>;
    return Effect.runPromise(
      Effect.asVoid(
        // `getPermissions` takes exactly one subject.
        expectRejection(
          () => read(client(), path === "indexer.getPermissions" ? { name } : indexerOptions),
          {
            _tag: "ConfigError",
            code: "INDEXER_NOT_CONFIGURED",
          },
        ),
      ),
    );
  });
});
