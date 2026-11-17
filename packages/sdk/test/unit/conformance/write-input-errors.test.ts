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

// Write options that cannot be right fail with a typed error before any RPC request (`noRpc`).

const name = "nick.eth";
const account = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
const badAddress = "0x1234";

const client = (deployment?: Deployments.Profile) =>
  Ensforge.create({
    publicClient: createPublicClient({
      chain: mainnet,
      transport: scriptedTransport(noRpc).transport,
    }),
    account,
    ...(deployment === undefined ? {} : { deployment }),
  });
const v1Only: Deployments.Profile = { name: "mainnet", chainId: 1, v1: Deployments.mainnet.v1 };
const v2Only: Deployments.Profile = { name: "mainnet", chainId: 1, v2: Deployments.mainnet.v2 };

const invalidAddress: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };
const invalidValue: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" };
const invalidRoles: ExpectedError = { _tag: "InvalidInputError", code: "INVALID_ROLES" };
const unsupported: ExpectedError = { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" };
const year = 31_536_000n;

const cases: readonly (readonly [string, () => Promise<unknown>, ExpectedError])[] = [
  [
    "approval.setDelegate",
    () =>
      Actions.approval.setDelegate.prepare(client(), {
        name,
        delegate: badAddress,
        approved: true,
      }),
    invalidAddress,
  ],
  [
    "approval.setOperator",
    () =>
      Actions.approval.setOperator.prepare(client(), {
        operator: badAddress,
        approved: true,
        contract: "registry",
      }),
    invalidAddress,
  ],
  [
    "approval.setOperator",
    () =>
      Actions.approval.setOperator.prepare(client(v2Only), {
        operator: account,
        approved: true,
        contract: "registrar",
      }),
    unsupported,
  ],
  [
    "approval.setToken",
    () => Actions.approval.setToken.prepare(client(), { name, to: badAddress }),
    invalidAddress,
  ],
  [
    "migration.migrate",
    () => Actions.migration.migrate.prepare(client(), { names: name, owner: badAddress }),
    invalidAddress,
  ],
  [
    "name.setManager",
    () => Actions.name.setManager.prepare(client(), { name, manager: badAddress }),
    invalidAddress,
  ],
  ["name.setTtl", () => Actions.name.setTtl.prepare(client(), { name, ttl: -1n }), invalidValue],
  [
    "name.transfer",
    () => Actions.name.transfer.prepare(client(), { name, to: badAddress }),
    invalidAddress,
  ],
  [
    "permission.setRecordAccess",
    () => Actions.permission.setRecordAccess.prepare(client(), { name, grantee: badAddress }),
    invalidAddress,
  ],
  [
    "registration.commit",
    () => Actions.registration.commit.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registration.register",
    () => Actions.registration.register.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registration.renew",
    () => Actions.registration.renew.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registry.deploy",
    () => Actions.registry.deploy.prepare(client(), { owner: badAddress }),
    invalidAddress,
  ],
  [
    "registry.deploy",
    () => Actions.registry.deploy.prepare(client(), { grants: [{ account, roles: 1n << 300n }] }),
    invalidRoles,
  ],
  ["registry.deploy", () => Actions.registry.deploy.prepare(client(v1Only), {}), unsupported],
  [
    "registry.setUri",
    () => Actions.registry.setUri.prepare(client(), { registry: badAddress, uri: "x" }),
    invalidAddress,
  ],
  [
    "registry.upgrade",
    () => Actions.registry.upgrade.prepare(client(), { registry: badAddress }),
    invalidAddress,
  ],
  [
    "resolver.create",
    () => Actions.resolver.create.prepare(client(), { owner: badAddress }),
    invalidAddress,
  ],
  [
    "resolver.create",
    () => Actions.resolver.create.prepare(client(), { grants: [{ account, roles: 1n << 300n }] }),
    invalidRoles,
  ],
  ["resolver.create", () => Actions.resolver.create.prepare(client(v1Only), {}), unsupported],
  [
    "resolver.upgrade",
    () => Actions.resolver.upgrade.prepare(client(), { name, implementation: badAddress }),
    invalidAddress,
  ],
  [
    "role.grant",
    () =>
      Actions.role.grant.prepare(client(), {
        grantee: badAddress,
        roles: ["setResolver"],
        target: "registry",
        name,
      }),
    invalidAddress,
  ],
  [
    "role.grant",
    () =>
      Actions.role.grant.prepare(client(), {
        grantee: account,
        roles: 1n << 300n,
        target: "registry",
        name,
      }),
    invalidRoles,
  ],
  [
    "role.revoke",
    () =>
      Actions.role.revoke.prepare(client(), {
        holder: badAddress,
        roles: ["setResolver"],
        target: "registry",
        name,
      }),
    invalidAddress,
  ],
  [
    "role.revoke",
    () =>
      Actions.role.revoke.prepare(client(), {
        holder: account,
        roles: 1n << 300n,
        target: "registry",
        name,
      }),
    invalidRoles,
  ],
  [
    "role.revoke",
    () =>
      Actions.role.revoke.prepare(client(), {
        holder: account,
        roles: ["setResolver"],
        target: "registry",
      }),
    invalidValue,
  ],
  [
    "role.grant",
    () =>
      Actions.role.grant.prepare(client(), {
        grantee: account,
        roles: -1n,
        target: "registry",
        name,
      }),
    invalidRoles,
  ],
];

describe("write input errors", () => {
  it.each(cases)("%s fails before reading the chain", (_, write, expected) =>
    Effect.runPromise(Effect.asVoid(expectRejection(write, expected))),
  );
});
