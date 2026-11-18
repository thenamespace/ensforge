// This test walks every read action by name, so it indexes the API namespaces as records.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr, Record as Rec } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration, type Errors, Actions as Promises } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { encodeFunctionData, keccak256, labelhash, namehash, toHex } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

type PromiseRead = ((client: unknown, options: unknown) => Promise<unknown>) & {
  readonly request?: (options: unknown) => unknown;
};
type EffectRead = (client: unknown, options: unknown) => Effect.Effect<unknown, Errors.AnyError>;
type BoundRead = (options: unknown) => Promise<unknown>;

describe("every read", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("gives one result bound, standalone, as an Effect and batched", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { accounts } = devnet;
        const chain = yield* Chain;
        const { reader } = yield* Clients;
        const nameOf = (id: string) => fixtures.byId(id).name;
        // The ETH registry's history, as `event.decode` gets it from a log source.
        const logs = yield* chain.logs({
          address: devnet.contract("v2.ethRegistry"),
          fromBlock: 0n,
        });

        const options: Record<string, unknown> = {
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
          "primaryName.get": {
            address: String(fixtures.byId("primary.addr-reverse").facts["address"]),
          },
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
          "registration.getPrice": { name: "qqqqq.eth", duration: Duration.years(1) },
          "registration.getRenewalPrice": {
            names: nameOf("v2.registered"),
            duration: Duration.years(1),
          },
          "registration.isAvailable": { name: "qqqqq.eth" },
          "registry.get": { name: "v2-parent.eth" },
          "resolver.get": { name: nameOf("records.v2") },
          "resolver.getLink": { name: nameOf("records.v2.linked") },
          "resolver.resolve": {
            name: nameOf("records.v2"),
            data: encodeFunctionData({
              abi: Abis.shared.textResolver,
              functionName: "text",
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

        // Every read action with a `.request`; reads that need an indexer, DNS gateways or stored
        // plans are covered in their own lanes.
        const reads = Arr.filter(
          Arr.flatMap(
            Arr.filter(
              Rec.toEntries(Promises as unknown as Record<string, object>),
              ([domain]) => domain !== "batch",
            ),
            ([domain, group]) =>
              Arr.map(Rec.toEntries(group as Record<string, PromiseRead>), ([name, read]) => ({
                domain,
                name,
                read,
                path: `${domain}.${name}`,
              })),
          ),
          ({ read, path }) => read.request !== undefined && !/^(indexer|dns|plan)\./u.test(path),
        );
        assert.sameMembers(
          Rec.keys(options),
          Arr.map(reads, ({ path }) => path),
        );

        const effects = Actions as unknown as Record<string, Record<string, EffectRead>>;
        const bound = reader as unknown as Record<string, Record<string, BoundRead>>;
        for (const { domain, name, read, path } of reads) {
          const input = options[path];
          const asEffect = effects[domain]?.[name];
          const asBound = bound[domain]?.[name];
          if (asEffect === undefined || asBound === undefined || read.request === undefined) {
            assert.fail(`${path} is missing from the Effect API or the client`);
          }

          const direct = yield* Effect.promise(() => read(reader, input));
          const boundResult = yield* Effect.promise(() => asBound(input));
          assert.deepStrictEqual(boundResult, direct, `${path} bound`);
          const effectResult = yield* Effect.orDie(asEffect(reader, input));
          assert.deepStrictEqual(effectResult, direct, `${path} Effect`);
          const { results } = yield* Actions.batch(reader, {
            requests: [read.request(input) as never],
          });
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
