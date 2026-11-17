import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk";
import { Actions as Effects } from "@ensforge/sdk/effect";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures, type FixturesApi } from "@ensforge/test-fixtures";
import {
  encodeFunctionData,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  toHex,
  type Address,
  type Log,
} from "viem";

import { call, ensforge, onProfile } from "../support/chain.ts";

type Read = (client: unknown, options: unknown) => Promise<unknown>;
type Group = Record<string, Read & { readonly request?: (options: unknown) => unknown }>;

/** Options for every read action on `mainnet-shaped`, from the fixtures. */
const optionsOf = (
  fixtures: FixturesApi,
  devnet: DevnetInstance,
  logs: readonly Log[],
): Record<string, unknown> => {
  const { accounts } = devnet;
  const nameOf = (id: string) => fixtures.byId(id).name;
  return {
    "approval.getDelegate": { name: nameOf("records.v1"), delegate: accounts.approved },
    "approval.getOperator": {
      owner: accounts.alice,
      operator: accounts.operator,
      contract: "registry",
    },
    "approval.getToken": { name: nameOf("v1.wrapped.approved") },
    "event.decode": { logs },
    "event.get": { name: nameOf("v2.registered"), fromBlock: 0n },
    "migration.get": { name: nameOf("v2.reserved"), account: accounts.alice },
    "name.get": { name: nameOf("v1.wrapped") },
    "name.getLabel": { labelhash: labelhash("v2-plain") },
    "permission.check": {
      name: nameOf("v2.roles"),
      operation: "transfer",
      account: accounts.alice,
    },
    "permission.get": { name: nameOf("records.v2"), account: accounts.bob },
    "primaryName.get": { address: String(fixtures.byId("primary.addr-reverse").facts["address"]) },
    "record.get": {
      name: nameOf("records.v2"),
      texts: ["url"],
      addresses: ["eth"],
      contentHash: true,
    },
    "record.getAddress": { name: nameOf("records.v2") },
    "record.getAvatar": { name: nameOf("records.avatar.https") },
    "record.getContentHash": { name: nameOf("records.v2") },
    "record.getText": { name: nameOf("records.v2"), key: "url" },
    "registration.getCommitmentStatus": { commitment: keccak256(toHex("never committed")) },
    "registration.getParameters": {},
    "registration.getPrice": { name: "qqqqq.eth", duration: 31_536_000n },
    "registration.getRenewalPrice": { names: nameOf("v2.registered"), duration: 31_536_000n },
    "registration.isAvailable": { name: "qqqqq.eth" },
    "registry.get": { name: "v2-parent.eth" },
    "resolver.get": { name: nameOf("records.v2") },
    "resolver.getLink": { name: nameOf("records.v2.linked") },
    "resolver.resolve": {
      name: nameOf("records.v2"),
      data: encodeFunctionData({
        abi: parseAbi(["function text(bytes32, string) view returns (string)"]),
        args: [namehash(nameOf("records.v2")), "url"],
      }),
    },
    "role.get": {
      account: String(fixtures.byId("v2.roles").facts["delegate"]),
      target: "registry",
      name: nameOf("v2.roles"),
    },
    "wrapper.getFuses": { name: nameOf("v1.wrapped.locked") },
  };
};

// Reads that need an indexer, DNS gateways or stored plans are covered in their own lanes.
const elsewhere = /^(indexer|dns|plan)\./u;

describe("every read", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("gives one result bound, standalone, as an Effect and batched", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const ens = ensforge(devnet);
        // The ETH registry's history, as `event.decode` gets it from a log source.
        const logs = yield* Effect.promise(() =>
          devnet.client.getLogs({
            address: devnet.contracts["v2.ethRegistry"] as Address,
            fromBlock: 0n,
          }),
        );
        const options = optionsOf(fixtures, devnet, logs);

        const effects = Effects as unknown as Record<
          string,
          Record<string, (client: unknown, options: unknown) => Effect.Effect<unknown, unknown>>
        >;
        const bound = ens as unknown as Record<
          string,
          Record<string, (options: unknown) => Promise<unknown>>
        >;
        const reads = Object.entries(Actions as unknown as Record<string, Group>)
          .filter(([domain]) => domain !== "batch")
          .flatMap(([domain, group]) =>
            Object.entries(group).map(([name, read]) => ({
              domain,
              name,
              read,
              path: `${domain}.${name}`,
            })),
          )
          .filter(({ read, path }) => read.request !== undefined && !elsewhere.test(path));
        assert.sameMembers(
          Object.keys(options),
          reads.map(({ path }) => path),
        );

        for (const { domain, name, read, path } of reads) {
          const input = options[path];
          const asEffect = effects[domain]?.[name];
          const asBound = bound[domain]?.[name];
          if (asEffect === undefined || asBound === undefined || read.request === undefined) {
            return assert.fail(`${path} is missing from the Effect API or the client`);
          }
          const request = read.request(input);

          const direct = yield* call(() => read(ens, input));
          assert.deepStrictEqual(yield* call(() => asBound(input)), direct, `${path} bound`);
          assert.deepStrictEqual(
            yield* Effect.orDie(asEffect(ens, input)),
            direct,
            `${path} Effect`,
          );
          const { results } = yield* call(() =>
            Actions.batch(ens, { requests: [request as never] }),
          );
          assert.deepStrictEqual(
            results[0],
            { status: "success", result: direct },
            `${path} batched`,
          );
        }
      }),
    );
  });
});
