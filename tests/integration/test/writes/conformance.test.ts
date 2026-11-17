import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions, Plan } from "@ensforge/sdk";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import type { Address } from "viem";

import { call, ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { testWallet, type WalletOptions } from "../support/wallet.ts";
import { writeCases } from "./cases.ts";

type Write = ((options: unknown) => Promise<unknown>) & {
  readonly prepare: (options: unknown) => Promise<Plan>;
  readonly simulate: (options: unknown) => Promise<{ readonly ok: boolean }>;
  readonly estimateGas: (options: unknown) => Promise<unknown>;
};
type Sync = (options: unknown) => Promise<{
  readonly hashes: readonly string[];
  readonly receipts: readonly { readonly status: string }[];
}>;

// Writes left to their own lanes: DNS proofs (024), and the plan runtime (022f).
const elsewhere = /^(dns\.|plan\.|event\.watch)/u;

/** Writes that refuse here, with why: no newer implementation is deployed. */
const refused = {
  "registry.upgrade": { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
  "resolver.upgrade": { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
} as const;

const writesOf = (
  devnet: DevnetInstance,
  account: Address,
  path: string,
  wallet: WalletOptions = {},
) => {
  const [domain = "", name = ""] = path.split(".");
  const ens = ensforge(devnet, { account, wallet: testWallet(devnet, account, wallet) });
  const group = (ens as unknown as Record<string, Record<string, unknown>>)[domain] ?? {};
  return { write: group[name] as Write, sync: group[`${name}Sync`] as Sync };
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
        const cases = writeCases(yield* Fixtures, devnet);

        for (const [path, { account: holder, options }] of Object.entries(cases)) {
          const account = devnet.accounts[holder];
          const { write, sync } = writesOf(devnet, account, path);
          const failure = refused[path as keyof typeof refused];
          if (failure !== undefined) {
            yield* expectRejection(() => write.prepare(options), failure);
            continue;
          }

          const plan = yield* call(() => write.prepare(options));
          assert.deepStrictEqual(Plan.deserialize(Plan.serialize(plan)), plan, `${path} plan`);
          assert.isTrue((yield* call(() => write.simulate(options))).ok, `${path} simulate`);
          yield* call(() => write.estimateGas(options));

          const withWaits = { ...options, onStep: passWaits(devnet) };
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const result = yield* call(() => sync(withWaits));
              assert.isTrue(
                result.receipts.every((receipt) => receipt.status === "success"),
                `${path} sync`,
              );
            }),
          );
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { hashes } = (yield* call(() => write(withWaits))) as {
                readonly hashes: readonly `0x${string}`[];
              };
              const receipts = yield* Effect.forEach(hashes, (hash) =>
                Effect.promise(() => devnet.client.waitForTransactionReceipt({ hash })),
              );
              assert.isTrue(
                receipts.every(({ status }) => status === "success"),
                `${path} send`,
              );
            }),
          );
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const batched = writesOf(devnet, account, path, { atomic: true }).sync;
              const result = yield* call(() => batched({ ...withWaits, mode: "batch" }));
              assert.isTrue(
                result.receipts.every((receipt) => receipt.status === "success"),
                `${path} batch`,
              );
            }),
          );
        }
      }),
    );

    it.effect("fails typed when the user rejects or there is no wallet", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const cases = writeCases(yield* Fixtures, devnet);

        for (const [path, { account: holder, options }] of Object.entries(cases)) {
          if (path in refused) continue;
          const { write } = writesOf(devnet, devnet.accounts[holder], path, { reject: true });
          yield* expectRejection(() => write({ ...options, onStep: passWaits(devnet) }), {
            _tag: "UserRejectedError",
            code: "USER_REJECTED",
          });

          const [domain = "", name = ""] = path.split(".");
          const readOnly = (ensforge(devnet) as unknown as Record<string, Record<string, Write>>)[
            domain
          ]?.[name];
          if (readOnly === undefined) return assert.fail(`${path} is not on the client`);
          yield* expectRejection(() => readOnly(options), {
            _tag: "ConfigError",
            code: "WALLET_NOT_CONFIGURED",
          });
        }
      }),
    );
  });
});
