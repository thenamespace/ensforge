import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr, String as Str, Record as Rec, pipe } from "effect";

import type { Errors } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet, type AccountName, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures, type FixturesApi } from "@ensforge/test-fixtures";
import { expectFailure, type ExpectedError } from "@ensforge/test-harness";
import { zeroAddress } from "viem";

import { Clients, type Client } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

type Refusal = ExpectedError & { readonly missingRoles?: readonly string[] };

/** One write as one account: allowed, or refused before the wallet is asked to sign. */
type Row = {
  readonly label: string;
  readonly path: string;
  readonly account: AccountName;
  readonly options: (fixtures: FixturesApi, devnet: Devnet["Service"]) => Record<string, unknown>;
  readonly expected: "allowed" | Refusal;
  readonly cases: readonly string[];
};

const notOwner: Refusal = { _tag: "UnauthorizedError", code: "NOT_OWNER" };
const text =
  (id: string, key = "url") =>
  (fixtures: FixturesApi) => ({
    name: fixtures.byId(id).name,
    texts: { [key]: "https://matrix.example" },
  });

const rows: Readonly<Record<ProfileName, readonly Row[]>> = {
  "v1-live": [
    // A registry operator is not an operator of the PublicResolver, which keeps its own.
    {
      label: "registry operator",
      path: "record.set",
      account: "operator",
      options: () => ({ name: "v1-plain.eth", texts: { url: "x" } }),
      expected: notOwner,
      cases: ["M:D4"],
    },
    {
      label: "resolver delegate",
      path: "record.set",
      account: "approved",
      options: () => ({ name: "v1-plain.eth", texts: { url: "x" } }),
      expected: "allowed",
      cases: ["M:D6", "A02"],
    },
  ],
  "mainnet-shaped": [
    {
      label: "ENSv1 owner",
      path: "record.set",
      account: "alice",
      options: text("records.v1"),
      expected: "allowed",
      cases: ["M:D1"],
    },
    {
      label: "stranger",
      path: "record.set",
      account: "user",
      options: text("records.v1"),
      expected: notOwner,
      cases: ["M:D11"],
    },
    {
      label: "manager",
      path: "record.set",
      account: "bob",
      options: text("v1.unwrapped.manager"),
      expected: "allowed",
      cases: ["M:D2"],
    },
    {
      label: "registrant, not manager",
      path: "record.set",
      account: "alice",
      options: text("v1.unwrapped.manager"),
      expected: notOwner,
      cases: ["M:A3", "M:D3"],
    },
    {
      label: "wrapped owner",
      path: "record.set",
      account: "alice",
      options: text("v1.wrapped"),
      expected: "allowed",
      // The registry owner is the NameWrapper; the PublicResolver authorizes its token owner.
      cases: ["M:A7", "R27"],
    },
    {
      label: "token-approved",
      path: "record.set",
      account: "approved",
      options: text("v1.wrapped.approved"),
      expected: notOwner,
      cases: ["W12", "M:D5"],
    },
    {
      label: "frozen 2019 resolver",
      path: "record.set",
      account: "alice",
      options: text("resolver.frozen-2019"),
      expected: { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
      cases: ["R12", "M:B2"],
    },
    {
      label: "not premigrated",
      path: "record.set",
      account: "alice",
      options: () => ({ name: "v1-plain.eth", texts: { url: "x" } }),
      expected: { _tag: "NameStateError", code: "NAME_UNREACHABLE" },
      cases: ["O19"],
    },
    {
      label: "ENSv2 owner",
      path: "record.set",
      account: "bob",
      options: text("records.v2"),
      expected: "allowed",
      cases: ["M:B5"],
    },
    {
      label: "ENSv2 stranger",
      path: "record.set",
      account: "user",
      options: text("records.v2"),
      expected: { _tag: "UnauthorizedError", code: "MISSING_ROLES", missingRoles: ["setText"] },
      cases: ["M:B5"],
    },
    {
      label: "url role, url",
      path: "record.set",
      account: "carol",
      options: text("records.v2.partial-roles"),
      expected: "allowed",
      cases: ["M:B6", "M:D7"],
    },
    {
      label: "url role, description",
      path: "record.set",
      account: "carol",
      options: text("records.v2.partial-roles", "description"),
      expected: { _tag: "UnauthorizedError", code: "MISSING_ROLES", missingRoles: ["setText"] },
      cases: ["M:B6", "M:D7"],
    },
    {
      label: "url role, address",
      path: "record.set",
      account: "carol",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("records.v2.partial-roles").name,
        addresses: { eth: devnet.accounts.carol },
      }),
      expected: { _tag: "UnauthorizedError", code: "MISSING_ROLES", missingRoles: ["setAddr"] },
      cases: ["M:B6"],
    },
    {
      label: "role grant by stranger",
      path: "role.grant",
      account: "user",
      options: (fixtures, devnet) => ({
        grantee: devnet.accounts.carol,
        roles: ["setResolver"],
        target: "registry",
        name: fixtures.byId("v2.registered").name,
      }),
      expected: {
        _tag: "UnauthorizedError",
        code: "CANNOT_GRANT_ROLES",
        missingRoles: ["setResolver"],
      },
      cases: ["M:A24"],
    },
    {
      label: "resolver role, transfer",
      path: "name.transfer",
      account: "carol",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v2.roles").name,
        to: devnet.accounts.carol,
      }),
      expected: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
      cases: ["M:A24", "M:D7"],
    },
    {
      label: "record access by stranger",
      path: "permission.setRecordAccess",
      account: "user",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("records.v2").name,
        grantee: devnet.accounts.carol,
        records: { texts: ["url"] },
      }),
      expected: {
        _tag: "UnauthorizedError",
        code: "CANNOT_GRANT_ROLES",
        missingRoles: ["setText"],
      },
      cases: ["M:D7"],
    },
    {
      label: "someone else's name as primary",
      path: "primaryName.set",
      account: "user",
      options: (fixtures) => ({ name: fixtures.byId("primary.addr-reverse").name }),
      expected: { _tag: "NotFoundError", code: "PRIMARY_NAME_MISMATCH" },
      cases: ["P08"],
    },
    {
      label: "contract's owner names it",
      path: "primaryName.set",
      account: "user",
      options: (fixtures) => ({
        name: fixtures.byId("primary.contract").name,
        address: String(fixtures.byId("primary.contract").facts["address"]),
      }),
      expected: "allowed",
      cases: ["P22", "M:D10"],
    },
    {
      label: "stranger names a contract",
      path: "primaryName.set",
      account: "carol",
      options: (fixtures) => ({
        name: fixtures.byId("primary.contract").name,
        address: String(fixtures.byId("primary.contract").facts["address"]),
      }),
      expected: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
      cases: ["P22"],
    },
    {
      label: "token approval by stranger",
      path: "approval.setToken",
      account: "user",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped").name,
        to: devnet.accounts.carol,
      }),
      expected: notOwner,
      cases: ["W12"],
    },
    {
      label: "token approval, CANNOT_APPROVE",
      path: "approval.setToken",
      account: "alice",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped.locked.cannot-approve").name,
        to: devnet.accounts.carol,
      }),
      expected: { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
      cases: ["W11"],
    },
    {
      label: "delegate by stranger",
      path: "approval.setDelegate",
      account: "user",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("records.v1").name,
        delegate: devnet.accounts.carol,
        approved: true,
      }),
      expected: notOwner,
      cases: ["A02"],
    },
    {
      label: "wrapped owner, to self",
      path: "approval.setDelegate",
      account: "alice",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped").name,
        delegate: devnet.accounts.alice,
        approved: true,
      }),
      // "Setting delegate status for self", a `require` string (KL-02).
      expected: { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
      cases: ["R27"],
    },
    {
      label: "parent of an emancipated child",
      path: "name.transfer",
      account: "alice",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped.sub.emancipated").name,
        to: devnet.accounts.carol,
      }),
      expected: notOwner,
      cases: ["A07"],
    },
    {
      label: "parent of an emancipated child",
      path: "subname.remove",
      account: "alice",
      options: (fixtures) => ({ name: fixtures.byId("v1.wrapped.sub.emancipated").name }),
      expected: { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
      cases: ["A08"],
    },
    // ensforge takes recipients as addresses only: callers resolve names and trim input.
    {
      label: "owner, to a name",
      path: "name.transfer",
      account: "alice",
      options: (fixtures) => ({ name: fixtures.byId("v1.wrapped").name, to: "bob.eth" }),
      expected: { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      cases: ["A09"],
    },
    {
      label: "owner, to a padded address",
      path: "name.transfer",
      account: "alice",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped").name,
        to: ` ${devnet.accounts.carol} `,
      }),
      expected: { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      cases: ["A09"],
    },
    {
      label: "owner, to the zero address",
      path: "name.transfer",
      account: "alice",
      options: (fixtures) => ({ name: fixtures.byId("v1.wrapped").name, to: zeroAddress }),
      // The token contract refuses it in simulation (`ERC1155: transfer to the zero address`).
      expected: { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
      cases: ["A09"],
    },
    {
      label: "owner, to self",
      path: "name.transfer",
      account: "alice",
      options: (fixtures, devnet) => ({
        name: fixtures.byId("v1.wrapped").name,
        to: devnet.accounts.alice,
      }),
      expected: "allowed",
      cases: ["A09"],
    },
  ],
  "v1-v2-greenfield": [],
  "sepolia-shaped": [],
  "v2-only": [],
};

describe("access matrix", () => {
  for (const [profile, profileRows] of Rec.toEntries(rows)) {
    if (profileRows.length === 0) continue;
    onProfile(profile)(profile, (it) => {
      for (const row of profileRows) {
        it.effect(
          `${row.path} as ${row.label}`,
          () =>
            Effect.gen(function* () {
              const fixtures = yield* Fixtures;
              const devnet = yield* Devnet;
              const chain = yield* Chain;
              const clients = yield* Clients;
              const account = devnet.accounts[row.account];
              const wallet = (yield* Wallets).make(account);
              const ens = clients.make({ account, wallet });
              const [domain, action = ""] = pipe(row.path, Str.split("."));
              // Every write is looked up by its path, so the namespace is indexed as a record.
              /* oxlint-disable typescript/no-unsafe-type-assertion */
              const sync = (
                Actions as unknown as Record<
                  string,
                  Record<
                    string,
                    (
                      ens: Client,
                      options: unknown,
                    ) => Effect.Effect<
                      { readonly receipts: readonly { readonly status: string }[] },
                      Errors.AnyError
                    >
                  >
                >
              )[domain]?.[`${action}Sync`];
              /* oxlint-enable typescript/no-unsafe-type-assertion */
              if (sync === undefined) assert.fail(`${row.path} has no Sync form`);
              const options = { ...row.options(fixtures, devnet), onStep: chain.passWaits };

              yield* chain.isolated(
                Effect.gen(function* () {
                  if (row.expected === "allowed") {
                    const { receipts } = yield* sync(ens, options);
                    assert.isTrue(Arr.every(receipts, ({ status }) => status === "success"));
                    return;
                  }

                  const { missingRoles, ...expected } = row.expected;
                  const error = yield* expectFailure(sync(ens, options), expected);
                  if (missingRoles !== undefined) {
                    assert.deepStrictEqual(
                      "missingRoles" in error && error.missingRoles,
                      missingRoles,
                    );
                  }
                  // Refused before the wallet was asked to sign anything.
                  assert.isFalse(wallet.prompted());
                }),
              );
            }),
          { meta: { cases: row.cases } },
        );
      }
    });
  }
});
