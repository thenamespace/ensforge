import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

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

// Each case runs through the Promise and the Effect actions alike: both take the same arguments
// (`paths.test.ts`), and the Effect form must fail with the typed error, never a defect.
type Call = (actions: typeof Actions) => Promise<unknown>;
const asEffect = (call: Call) =>
  call(EffectActions as unknown as typeof Actions) as unknown as Effect.Effect<unknown, unknown>;

const cases: readonly (readonly [string, Call, ExpectedError])[] = [
  [
    "approval.setDelegate",
    (actions) =>
      actions.approval.setDelegate.prepare(client(), {
        name,
        delegate: badAddress,
        approved: true,
      }),
    invalidAddress,
  ],
  [
    "approval.setOperator",
    (actions) =>
      actions.approval.setOperator.prepare(client(), {
        operator: badAddress,
        approved: true,
        contract: "registry",
      }),
    invalidAddress,
  ],
  [
    "approval.setOperator",
    (actions) =>
      actions.approval.setOperator.prepare(client(v2Only), {
        operator: account,
        approved: true,
        contract: "registrar",
      }),
    unsupported,
  ],
  [
    "approval.setToken",
    (actions) => actions.approval.setToken.prepare(client(), { name, to: badAddress }),
    invalidAddress,
  ],
  [
    "migration.migrate",
    (actions) => actions.migration.migrate.prepare(client(), { names: name, owner: badAddress }),
    invalidAddress,
  ],
  [
    "name.setManager",
    (actions) => actions.name.setManager.prepare(client(), { name, manager: badAddress }),
    invalidAddress,
  ],
  [
    "name.setTtl",
    (actions) => actions.name.setTtl.prepare(client(), { name, ttl: -1n }),
    invalidValue,
  ],
  [
    "name.transfer",
    (actions) => actions.name.transfer.prepare(client(), { name, to: badAddress }),
    invalidAddress,
  ],
  [
    "permission.setRecordAccess",
    (actions) =>
      actions.permission.setRecordAccess.prepare(client(), { name, grantee: badAddress }),
    invalidAddress,
  ],
  [
    "registration.commit",
    (actions) =>
      actions.registration.commit.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registration.register",
    (actions) =>
      actions.registration.register.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registration.renew",
    (actions) =>
      actions.registration.renew.prepare(client(v1Only), { names: name, duration: year }),
    unsupported,
  ],
  [
    "registry.deploy",
    (actions) => actions.registry.deploy.prepare(client(), { owner: badAddress }),
    invalidAddress,
  ],
  [
    "registry.deploy",
    (actions) =>
      actions.registry.deploy.prepare(client(), { grants: [{ account, roles: 1n << 300n }] }),
    invalidRoles,
  ],
  [
    "registry.deploy",
    (actions) => actions.registry.deploy.prepare(client(v1Only), {}),
    unsupported,
  ],
  [
    "registry.setUri",
    (actions) => actions.registry.setUri.prepare(client(), { registry: badAddress, uri: "x" }),
    invalidAddress,
  ],
  [
    "registry.upgrade",
    (actions) => actions.registry.upgrade.prepare(client(), { registry: badAddress }),
    invalidAddress,
  ],
  [
    "resolver.create",
    (actions) => actions.resolver.create.prepare(client(), { owner: badAddress }),
    invalidAddress,
  ],
  [
    "resolver.create",
    (actions) =>
      actions.resolver.create.prepare(client(), { grants: [{ account, roles: 1n << 300n }] }),
    invalidRoles,
  ],
  [
    "resolver.create",
    (actions) => actions.resolver.create.prepare(client(v1Only), {}),
    unsupported,
  ],
  [
    "resolver.upgrade",
    (actions) => actions.resolver.upgrade.prepare(client(), { name, implementation: badAddress }),
    invalidAddress,
  ],
  [
    "role.grant",
    (actions) =>
      actions.role.grant.prepare(client(), {
        grantee: badAddress,
        roles: ["setResolver"],
        target: "registry",
        name,
      }),
    invalidAddress,
  ],
  [
    "role.grant",
    (actions) =>
      actions.role.grant.prepare(client(), {
        grantee: account,
        roles: 1n << 300n,
        target: "registry",
        name,
      }),
    invalidRoles,
  ],
  [
    "role.revoke",
    (actions) =>
      actions.role.revoke.prepare(client(), {
        holder: badAddress,
        roles: ["setResolver"],
        target: "registry",
        name,
      }),
    invalidAddress,
  ],
  [
    "role.revoke",
    (actions) =>
      actions.role.revoke.prepare(client(), {
        holder: account,
        roles: 1n << 300n,
        target: "registry",
        name,
      }),
    invalidRoles,
  ],
  [
    "role.revoke",
    (actions) =>
      actions.role.revoke.prepare(client(), {
        holder: account,
        roles: ["setResolver"],
        target: "registry",
      }),
    invalidValue,
  ],
  [
    "role.grant",
    (actions) =>
      actions.role.grant.prepare(client(), {
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
    Effect.runPromise(Effect.asVoid(expectRejection(() => write(Actions), expected))),
  );
  it.effect.each(cases)("%s fails as an Effect with the same error", ([, write, expected]) =>
    Effect.asVoid(expectFailure(asEffect(write), expected)),
  );
});
