import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet, type DevnetInstance, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures, type FixturesApi } from "@ensforge/test-fixtures";
import { expectRejection, type ExpectedError } from "@ensforge/test-harness";

import { call, ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { testWallet } from "../support/wallet.ts";

type AccountName = keyof DevnetInstance["accounts"];
type Refusal = ExpectedError & { readonly missingRoles?: readonly string[] };

/** One write as one account: allowed, or refused before the wallet is asked to sign. */
type Row = {
  readonly label: string;
  readonly path: string;
  readonly account: AccountName;
  readonly options: (fixtures: FixturesApi, devnet: DevnetInstance) => Record<string, unknown>;
  readonly expected: "allowed" | Refusal;
  readonly cases: readonly string[];
};

const notOwner: Refusal = { _tag: "UnauthorizedError", code: "NOT_OWNER" };
const missing = (...roles: string[]): Refusal => ({
  _tag: "UnauthorizedError",
  code: "MISSING_ROLES",
  missingRoles: roles,
});
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
      cases: ["M:A7"],
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
      expected: missing("setText"),
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
      expected: missing("setText"),
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
      expected: missing("setAddr"),
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
  ],
  "v1-v2-greenfield": [],
  "sepolia-shaped": [],
  "v2-only": [],
};

describe("access matrix", () => {
  for (const [profile, profileRows] of Object.entries(rows) as [ProfileName, readonly Row[]][]) {
    if (profileRows.length === 0) continue;
    onProfile(profile)(profile, (it) => {
      for (const row of profileRows) {
        it.effect(
          `${row.path} as ${row.label}`,
          () =>
            Effect.gen(function* () {
              const fixtures = yield* Fixtures;
              const devnet = yield* Devnet;
              const account = devnet.accounts[row.account];
              const wallet = testWallet(devnet, account);
              const [domain = "", name = ""] = row.path.split(".");
              const group =
                (
                  ensforge(devnet, { account, wallet }) as unknown as Record<
                    string,
                    Record<string, (o: unknown) => Promise<unknown>>
                  >
                )[domain] ?? {};
              const sync = group[`${name}Sync`];
              if (sync === undefined) return assert.fail(`${row.path} has no Sync form`);
              const options = { ...row.options(fixtures, devnet), onStep: passWaits(devnet) };

              yield* isolated(
                devnet,
                Effect.gen(function* () {
                  if (row.expected === "allowed") {
                    const { receipts } = (yield* call(() => sync(options))) as {
                      readonly receipts: readonly { readonly status: string }[];
                    };
                    assert.isTrue(receipts.every(({ status }) => status === "success"));
                    return;
                  }
                  const { missingRoles, ...expected } = row.expected;
                  const error = (yield* expectRejection(() => sync(options), expected)) as {
                    readonly missingRoles?: readonly string[];
                  };
                  if (missingRoles !== undefined)
                    assert.deepStrictEqual(error.missingRoles, missingRoles);
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
