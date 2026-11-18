import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions, Plan } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import type { Hash } from "viem";

import { Clients, type Client } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";
import { writeCases } from "./cases.ts";

// These tests drive the Promise API on purpose: prepare, simulate, estimateGas, send and batch.

type Write = ((options: unknown) => Promise<{ readonly hashes: readonly Hash[] }>) & {
  readonly prepare: (options: unknown) => Promise<Plan>;
  readonly simulate: (options: unknown) => Promise<{ readonly ok: boolean }>;
  readonly estimateGas: (options: unknown) => Promise<unknown>;
};
type Sync = (options: unknown) => Promise<{
  readonly receipts: readonly { readonly status: string }[];
}>;

// Writes left to their own lanes: DNS proofs, and the plan runtime.
const elsewhere = /^(dns\.|plan\.|event\.watch)/u;

/** Writes that refuse here, with why: no newer implementation is deployed. */
const refused = {
  "registry.upgrade": { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
  "resolver.upgrade": { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
} as const;

/** The Promise write at `path` (`record.set`) on `ens`, and its `…Sync` form. */
const writesOf = (ens: Client, path: string) => {
  const [domain = "", name = ""] = path.split(".");
  const group = (ens as unknown as Record<string, Record<string, unknown>>)[domain] ?? {};
  return { write: group[name] as Write | undefined, sync: group[`${name}Sync`] as Sync };
};

describe("every write", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("covers every write action", () =>
      Effect.gen(function* () {
        const cases = writeCases(yield* Fixtures, yield* Devnet);
        const writes = Object.entries(Actions as unknown as Record<string, Record<string, unknown>>)
          .flatMap(([domain, group]) =>
            Object.entries(group as Record<string, { readonly prepare?: unknown }>)
              .filter(([, action]) => action.prepare !== undefined)
              .map(([name]) => `${domain}.${name}`),
          )
          .filter((path) => !elsewhere.test(path));

        assert.sameMembers(Object.keys(cases), writes);
      }),
    );

    it.effect("prepares, simulates, estimates and sends each write", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const cases = writeCases(yield* Fixtures, devnet);

        for (const [path, { account: holder, options }] of Object.entries(cases)) {
          const account = devnet.accounts[holder];
          const { write, sync } = writesOf(
            clients.make({ account, wallet: wallets.make(account) }),
            path,
          );
          if (write === undefined) return assert.fail(`${path} is not on the client`);
          const failure = refused[path as keyof typeof refused];
          if (failure !== undefined) {
            yield* expectRejection(() => write.prepare(options), failure);
            continue;
          }

          const plan = yield* Effect.promise(() => write.prepare(options));
          assert.deepStrictEqual(Plan.deserialize(Plan.serialize(plan)), plan, `${path} plan`);
          assert.isTrue(
            (yield* Effect.promise(() => write.simulate(options))).ok,
            `${path} simulate`,
          );
          yield* Effect.promise(() => write.estimateGas(options));

          const withWaits = { ...options, onStep: chain.passWaits };
          yield* chain.isolated(
            Effect.gen(function* () {
              const { receipts } = yield* Effect.promise(() => sync(withWaits));
              assert.isTrue(
                receipts.every(({ status }) => status === "success"),
                `${path} sync`,
              );
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              const { hashes } = yield* Effect.promise(() => write(withWaits));
              const receipts = yield* Effect.forEach(hashes, chain.receipt);
              assert.isTrue(
                receipts.every(({ status }) => status === "success"),
                `${path} send`,
              );
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              const batched = clients.make({
                account,
                wallet: wallets.make(account, { atomic: true }),
              });
              const { receipts } = yield* Effect.promise(() =>
                writesOf(batched, path).sync({ ...withWaits, mode: "batch" }),
              );
              assert.isTrue(
                receipts.every(({ status }) => status === "success"),
                `${path} batch`,
              );
            }),
          );
        }
      }),
    );

    it.effect(
      "fails typed when the user rejects or there is no wallet",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const cases = writeCases(yield* Fixtures, devnet);

          for (const [path, { account: holder, options }] of Object.entries(cases)) {
            if (path in refused) continue;
            const account = devnet.accounts[holder];
            const rejecting = clients.make({
              account,
              wallet: wallets.make(account, { reject: true }),
            });
            const { write } = writesOf(rejecting, path);
            const readOnly = writesOf(clients.reader, path).write;
            if (write === undefined || readOnly === undefined) {
              return assert.fail(`${path} is not on the client`);
            }

            yield* expectRejection(() => write({ ...options, onStep: chain.passWaits }), {
              _tag: "UserRejectedError",
              code: "USER_REJECTED",
            });
            yield* expectRejection(() => readOnly(options), {
              _tag: "ConfigError",
              code: "WALLET_NOT_CONFIGURED",
            });
          }
        }),
      { meta: { cases: ["M:D12"] } },
    );
  });
});
