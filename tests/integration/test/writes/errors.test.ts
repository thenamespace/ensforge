import { assert, describe } from "@effect/vitest";
import { Effect, String as Str, Array as Arr, pipe } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Duration, Name, Plan, type Errors } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet, type AccountName } from "@ensforge/test-devnet";
import { Fixtures, type FixturesApi } from "@ensforge/test-fixtures";
import { type ExpectedError, expectFailure } from "@ensforge/test-harness";
import { labelhash, parseGwei } from "viem";

import { Clients, type Client } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

/** A write that must be refused, typed, before the wallet is asked to sign. */
type Refusal = {
  readonly label: string;
  readonly path: string;
  readonly account: AccountName;
  readonly options: (fixtures: FixturesApi, devnet: Devnet["Service"]) => Record<string, unknown>;
  readonly expected: ExpectedError;
  readonly cases?: readonly string[];
};

const bad = "0x1234";
const stranger = "0x000000000000000000000000000000000000dEaD";
const unregistered = "nothing-here.eth";
// A child of `rsv-offchain.eth`, whose resolver answers every name with an `OffchainLookup`.
const offchainName = (fixtures: FixturesApi) => `nope.${fixtures.byId("resolver.offchain").name}`;
const err = (_tag: string, code: string): ExpectedError => ({ _tag, code });

const nameState = (code: string) => err("NameStateError", code);
const invalid = (code: string) => err("InvalidInputError", code);
const unsupported = (code: string) => err("UnsupportedError", code);
const unauthorized = (code: string) => err("UnauthorizedError", code);
const notFound = (code: string) => err("NotFoundError", code);

const refusals: readonly Refusal[] = [
  // A write needs the plain label; `[labelhash]` names only what is already on chain.
  {
    label: "an encoded label",
    path: "registration.commit",
    account: "alice",
    options: () => ({
      names: `${Name.fromLabelhash(labelhash("qqqqq"))}.eth`,
      duration: Duration.years(1),
    }),
    expected: invalid("INVALID_NAME"),
    cases: ["H11"],
  },
  {
    label: "an encoded label",
    path: "subname.create",
    account: "alice",
    options: (f) => ({
      name: `${Name.fromLabelhash(labelhash("x"))}.${f.byId("records.v1").name}`,
    }),
    expected: invalid("INVALID_NAME"),
    cases: ["H11"],
  },
  {
    label: "an encoded label",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => {
      const [label, ...parent] = pipe(f.byId("records.v1").name, Str.split("."));
      return { name: Arr.join([Name.fromLabelhash(labelhash(label)), ...parent], ".") };
    },
    expected: invalid("INVALID_NAME"),
    cases: ["H11"],
  },
  // Input checked after reading the chain.
  {
    label: "a bad owner",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an unknown coin",
    path: "record.set",
    account: "alice",
    options: (f, d) => ({ name: f.byId("records.v1").name, addresses: { nope: d.accounts.alice } }),
    expected: invalid("INVALID_COIN_TYPE"),
  },
  {
    label: "an unknown content hash",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, contentHash: "nope://x" }),
    expected: invalid("INVALID_CONTENT_HASH"),
  },
  {
    label: "a bad owner",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad referrer",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), referrer: "0x12" }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad owner",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad referrer",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), referrer: "0x12" }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad payment token",
    path: "registration.renew",
    account: "alice",
    options: (f) => ({
      names: f.byId("v2.registered").name,
      duration: Duration.years(1),
      paymentToken: bad,
    }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad registry",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name, registry: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a negative record id",
    path: "resolver.link",
    account: "bob",
    options: (f) => ({ name: f.byId("records.v2.linked").name, to: { recordId: -1n } }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad owner",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${f.byId("v2.registered").name}`, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "roles beyond uint256",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${f.byId("v2.registered").name}`, roles: 1n << 300n }),
    expected: invalid("INVALID_ROLES"),
  },
  {
    label: "record keys that are not coins",
    path: "permission.setRecordAccess",
    account: "bob",
    options: (f, d) => ({
      name: f.byId("records.v2").name,
      grantee: d.accounts.carol,
      records: { addresses: ["nope"] },
    }),
    expected: invalid("INVALID_COIN_TYPE"),
  },
  // Name state.
  {
    label: "an expired name",
    path: "approval.setToken",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v1.wrapped.expired").name, to: d.accounts.carol }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered name",
    path: "approval.setToken",
    account: "alice",
    options: (_, d) => ({ name: unregistered, to: d.accounts.carol }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.unwrapped.expired").name }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.unregistered.renewed").name }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "name.reclaim",
    account: "alice",
    options: () => ({ name: unregistered }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v1.unwrapped.expired").name, manager: d.accounts.carol }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({
      name: f.byId("v2.unregistered.renewed").name,
      manager: d.accounts.carol,
    }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "name.setManager",
    account: "alice",
    options: (_, d) => ({ name: unregistered, manager: d.accounts.carol }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.unwrapped.expired").name, ttl: 60n }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.unregistered.renewed").name, ttl: 60n }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "name.setTtl",
    account: "alice",
    options: () => ({ name: unregistered, ttl: 60n }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "name.transfer",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.expired").name, to: d.accounts.carol }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.transfer",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.unregistered.renewed").name, to: d.accounts.carol }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "name.transfer",
    account: "alice",
    options: (_, d) => ({ name: unregistered, to: d.accounts.carol }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "a reserved name",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.unregistered.renewed").name, texts: { url: "x" } }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "record.set",
    account: "alice",
    options: () => ({ name: unregistered, texts: { url: "x" } }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an unregistered name",
    path: "registry.attach",
    account: "alice",
    options: () => ({ name: unregistered, registry: null }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.expired").name, registry: null }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired name",
    path: "resolver.create",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.expired").name }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "resolver.create",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.unregistered.renewed").name }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "resolver.create",
    account: "alice",
    options: () => ({ name: unregistered }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired name",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.expired").name, to: f.byId("records.v2").name }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired parent",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${f.byId("v2.expired").name}` }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired parent",
    path: "subname.remove",
    account: "alice",
    options: (f) => ({ name: `x.${f.byId("v2.expired").name}` }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered child",
    path: "subname.remove",
    account: "alice",
    options: (f) => ({ name: `nope.${f.byId("records.v1").name}` }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  // The other protocol.
  {
    label: "an ENSv2 name",
    path: "approval.setToken",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.registered").name, to: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.registered").name, manager: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name, ttl: 60n }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "the registrant of a subname",
    path: "name.transfer",
    account: "bob",
    options: (f, d) => ({
      name: f.byId("v1.subname").name,
      to: d.accounts.carol,
      role: "registrant",
    }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv1 name",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, registry: null }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv1 name",
    path: "registry.deploy",
    account: "alice",
    options: (f) => ({ attachTo: f.byId("records.v1").name }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv1 name",
    path: "role.revoke",
    account: "alice",
    options: (f, d) => ({
      holder: d.accounts.carol,
      roles: ["setResolver"],
      target: "registry",
      name: f.byId("records.v1").name,
    }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  // Resolvers and registries that are missing or cannot do it.
  {
    label: "a name without a resolver",
    path: "permission.setRecordAccess",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.registered").name, grantee: d.accounts.carol }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "approval.setDelegate",
    account: "alice",
    options: (f, d) => ({
      name: f.byId("resolver.none").name,
      delegate: d.accounts.carol,
      approved: true,
    }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name, to: f.byId("records.v2").name }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "resolver.upgrade",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a registry",
    path: "registry.setUri",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name, uri: "x" }),
    expected: notFound("REGISTRY_NOT_FOUND"),
  },
  {
    label: "a name without a registry",
    path: "registry.upgrade",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.registered").name }),
    expected: notFound("REGISTRY_NOT_FOUND"),
  },
  {
    label: "a PublicResolver",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, to: f.byId("records.v2").name }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "a PublicResolver",
    path: "resolver.upgrade",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "data on a resolver without data records",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, data: { key: "0x12" } }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "a target that refuses the registry",
    path: "registry.upgrade",
    account: "alice",
    options: () => ({ name: "v2-parent.eth", implementation: stranger }),
    expected: unsupported("UPGRADE_NOT_APPROVED"),
  },
  {
    label: "a target that refuses the resolver",
    path: "resolver.upgrade",
    account: "bob",
    options: (f) => ({ name: f.byId("records.v2").name, implementation: stranger }),
    expected: unsupported("UPGRADE_NOT_APPROVED"),
  },
  // Authorization.
  {
    label: "a stranger",
    path: "name.reclaim",
    account: "user",
    options: (f) => ({ name: f.byId("records.v1").name }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger",
    path: "name.setManager",
    account: "user",
    options: (f, d) => ({ name: f.byId("records.v1").name, manager: d.accounts.carol }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger",
    path: "name.setTtl",
    account: "user",
    options: (f) => ({ name: f.byId("records.v1").name, ttl: 60n }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a burned CANNOT_SET_TTL",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.locked.cannot-set-ttl").name, ttl: 60n }),
    expected: unauthorized("FUSE_BURNED"),
  },
  {
    label: "a stranger",
    path: "registry.attach",
    account: "user",
    options: (f) => ({ name: f.byId("v2.registered").name, registry: null }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "registry.deploy",
    account: "user",
    options: (f) => ({ attachTo: f.byId("v2.registered").name }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "registry.setUri",
    account: "user",
    options: () => ({ name: "v2-parent.eth", uri: "x" }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "registry.upgrade",
    account: "user",
    options: () => ({ name: "v2-parent.eth", implementation: stranger }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger's ENSv1 name",
    path: "resolver.create",
    account: "user",
    options: (f) => ({ name: f.byId("records.v1").name }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger's ENSv2 name",
    path: "resolver.create",
    account: "user",
    options: (f) => ({ name: f.byId("v2.registered").name }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "resolver.link",
    account: "user",
    options: (f) => ({ name: f.byId("records.v2.linked").name, to: f.byId("records.v2").name }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "role.revoke",
    account: "user",
    options: (f) => ({
      holder: String(f.byId("v2.roles").facts["delegate"]),
      roles: ["setResolver"],
      target: "registry",
      name: f.byId("v2.roles").name,
    }),
    expected: unauthorized("CANNOT_GRANT_ROLES"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.create",
    account: "user",
    options: (f) => ({ name: `x.${f.byId("v2.registered").name}` }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.create",
    account: "user",
    options: (f) => ({ name: `x.${f.byId("records.v1").name}` }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.remove",
    account: "user",
    options: (f) => ({ name: f.byId("v2.subnames").name }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.remove",
    account: "user",
    options: (f) => ({ name: f.byId("v1.subname").name }),
    expected: unauthorized("NOT_OWNER"),
  },
  // The NameWrapper and subname updates.
  {
    label: "a bad owner",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an expired name",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.unwrapped.expired").name }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered name",
    path: "wrapper.wrap",
    account: "alice",
    options: () => ({ name: unregistered }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "a stranger",
    path: "wrapper.wrap",
    account: "user",
    options: (f) => ({ name: f.byId("records.v1").name }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a bad owner",
    path: "wrapper.unwrap",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped").name, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an expired name",
    path: "wrapper.unwrap",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.expired").name }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered name",
    path: "wrapper.unwrap",
    account: "alice",
    options: () => ({ name: unregistered }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "a stranger",
    path: "wrapper.unwrap",
    account: "user",
    options: (f) => ({ name: f.byId("v1.wrapped").name }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an expired name",
    path: "wrapper.setFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.expired").name, fuses: ["cannotUnwrap"] }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered name",
    path: "wrapper.setFuses",
    account: "alice",
    options: () => ({ name: unregistered, fuses: ["cannotUnwrap"] }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "a stranger",
    path: "wrapper.setFuses",
    account: "user",
    options: (f) => ({ name: f.byId("v1.wrapped").name, fuses: ["cannotUnwrap"] }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an unknown fuse",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.sub").name, fuses: ["nope"] }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "an expiry beyond uint64",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.sub").name, expiry: 1n << 64n }),
    expected: invalid("INVALID_EXPIRY"),
  },
  {
    label: "an expired name",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.wrapped.expired").name, fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered child",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: `nope.${f.byId("v1.wrapped").name}`, fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an ENSv2 name",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.subnames").name, fuses: ["parentCannotControl"] }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "a stranger",
    path: "wrapper.setChildFuses",
    account: "user",
    options: (f) => ({ name: f.byId("v1.wrapped.sub").name, fuses: ["parentCannotControl"] }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a bad owner",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.subname").name, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "nothing to change",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.subname").name }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "an earlier ENSv2 expiry",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.subnames").name, expiry: 1n }),
    expected: invalid("INVALID_EXPIRY"),
  },
  {
    label: "an unregistered child",
    path: "subname.update",
    account: "alice",
    options: (f, d) => ({ name: `nope.${f.byId("records.v1").name}`, owner: d.accounts.carol }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired parent",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: `x.${f.byId("v2.expired").name}`, resolver: stranger }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an ENSv2 owner change",
    path: "subname.update",
    account: "alice",
    options: (f, d) => ({ name: f.byId("v2.subnames").name, owner: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.update",
    account: "user",
    options: (f) => ({ name: f.byId("v2.subnames").name, resolver: stranger }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.update",
    account: "user",
    options: (f, d) => ({ name: f.byId("v1.subname").name, owner: d.accounts.carol }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an unwrapped child",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.subname").name, fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_NOT_WRAPPED"),
  },
  {
    label: "a stranger on a wrapped name",
    path: "name.transfer",
    account: "bob",
    options: (f, d) => ({ name: f.byId("v1.wrapped").name, to: d.accounts.carol }),
    expected: unauthorized("NOT_OWNER"),
  },
  // DNS records on public resolvers.
  {
    label: "nothing to write",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "records that are not DNS wire format",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: f.byId("records.v1").name, records: "0x0377777700" }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "an expired name",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: f.byId("v1.unwrapped.expired").name, zonehash: null }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: f.byId("v2.unregistered.renewed").name, zonehash: null }),
    expected: nameState("NAME_RESERVED"),
  },
  {
    label: "an unregistered name",
    path: "dns.setRecords",
    account: "alice",
    options: () => ({ name: unregistered, zonehash: null }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "a name without a resolver",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: f.byId("resolver.none").name, zonehash: null }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a resolver without DNS records",
    path: "dns.setRecords",
    account: "bob",
    options: (f) => ({ name: f.byId("records.v2").name, zonehash: null }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "a stranger",
    path: "dns.setRecords",
    account: "user",
    options: (f) => ({ name: f.byId("records.v1").name, zonehash: null }),
    expected: unauthorized("NOT_OWNER"),
  },
  // Payment and migration.
  {
    label: "an account without funds",
    path: "registration.register",
    account: "user",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1) }),
    expected: err("InsufficientFundsError", "INSUFFICIENT_TOKEN_BALANCE"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), paymentToken: stranger }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: Duration.years(1), paymentToken: stranger }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.renew",
    account: "alice",
    options: (f) => ({
      names: f.byId("v2.registered").name,
      duration: Duration.years(1),
      paymentToken: stranger,
    }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a migrated name",
    path: "migration.migrate",
    account: "alice",
    options: (f) => ({ names: f.byId("migration.unwrapped").name, resolver: "keep" }),
    expected: err("MigrationError", "ALREADY_MIGRATED"),
  },
  {
    label: "records it cannot see",
    path: "migration.migrate",
    account: "alice",
    options: (f) => ({ names: f.byId("v2.reserved").name, resolver: "new" }),
    expected: err("MigrationError", "RECORDS_UNKNOWN"),
  },
  // A name in no registry that its parent's off-chain resolver serves is managed by that
  // namespace (an L2 or a gateway), not through ENS's registries.
  {
    label: "an off-chain name",
    path: "approval.setToken",
    account: "alice",
    options: (f, d) => ({ name: offchainName(f), to: d.accounts.carol }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "dns.setRecords",
    account: "alice",
    options: (f) => ({ name: offchainName(f), zonehash: null }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: offchainName(f) }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({ name: offchainName(f), manager: d.accounts.carol }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: offchainName(f), ttl: 60n }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "name.transfer",
    account: "alice",
    options: (f, d) => ({ name: offchainName(f), to: d.accounts.carol }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: offchainName(f), texts: { url: "x" } }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: offchainName(f), registry: null }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "resolver.create",
    account: "alice",
    options: (f) => ({ name: offchainName(f) }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: offchainName(f), to: f.byId("records.v2").name }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "resolver.set",
    account: "alice",
    options: (f, d) => ({ name: offchainName(f), resolver: d.accounts.carol }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "a subname of an off-chain name",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${offchainName(f)}` }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "subname.remove",
    account: "alice",
    options: (f) => ({ name: offchainName(f) }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "subname.update",
    account: "alice",
    options: (f, d) => ({ name: offchainName(f), owner: d.accounts.carol }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => ({ name: offchainName(f) }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "wrapper.unwrap",
    account: "alice",
    options: (f) => ({ name: offchainName(f) }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "wrapper.setFuses",
    account: "alice",
    options: (f) => ({ name: offchainName(f), fuses: ["cannotUnwrap"] }),
    expected: nameState("NAME_EXTERNAL"),
  },
  {
    label: "an off-chain name",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: offchainName(f), fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_EXTERNAL"),
  },
];

describe("write refusals", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    for (const refusal of refusals) {
      it.effect(
        `${refusal.path} refuses ${refusal.label}`,
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const clients = yield* Clients;
            const account = devnet.accounts[refusal.account];
            const wallet = (yield* Wallets).make(account);
            const ens = clients.make({ account, wallet });
            const [domain, action = ""] = pipe(refusal.path, Str.split("."));
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
                  ) => Effect.Effect<{ readonly receipts: readonly unknown[] }, Errors.AnyError>
                >
              >
            )[domain]?.[`${action}Sync`];
            /* oxlint-enable typescript/no-unsafe-type-assertion */
            if (sync === undefined) assert.fail(`${refusal.path} has no Sync form`);

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* expectFailure(
                  sync(ens, { ...refusal.options(fixtures, devnet), onStep: chain.passWaits }),
                  refusal.expected,
                );
                assert.isFalse(wallet.prompted(), "refused before the wallet was asked");
              }),
            );
          }),
        { meta: { cases: [...(refusal.cases ?? [])] } },
      );
    }

    it.effect(
      "registration.commit refuses a commitment already made",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: devnet.accounts.alice });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { secret, readyAt } = yield* Actions.registration.commitSync(ens, options);
              // Until it is ready the commitment reads as too new; once ready, it must not be redone.
              yield* chain.setNextBlockTimestamp(readyAt);
              yield* chain.mine();

              yield* expectFailure(Actions.registration.commit(ens, { ...options, secret }), {
                _tag: "CommitmentError",
                code: "COMMITMENT_EXISTS",
              });
            }),
          );
        }),
      { meta: { cases: ["G07"] } },
    );

    it.effect("plan.send refuses a plan prepared for another account", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const clients = yield* Clients;

        const plan = yield* Actions.record.set.prepare(clients.make({ account: accounts.bob }), {
          name: fixtures.byId("records.v2").name,
          texts: { url: "x" },
        });
        yield* expectFailure(
          Actions.plan.send(clients.make({ account: accounts.carol }), { plan }),
          { _tag: "PlanError", code: "PLAN_ACCOUNT_MISMATCH" },
        );
      }),
    );

    it.effect("plan.send fails CONTRACT_REVERTED for a step that reverts without a reason", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const ens = (yield* Clients).make({ account: accounts.bob });
        const plan = yield* Actions.record.set.prepare(ens, {
          name: fixtures.byId("records.v2").name,
          texts: { url: "x" },
        });

        // A call the resolver has no function for reverts with empty data.
        const [step] = plan.steps;
        const [first] = step?.calls ?? [];
        if (step === undefined || first === undefined) assert.fail("the plan has no call");
        const garbled = {
          ...plan,
          steps: [{ ...step, calls: [{ ...first, data: "0xdeadbeef" as const }] }],
        };
        yield* expectFailure(Actions.plan.send(ens, { plan: garbled }), {
          _tag: "ContractRevertError",
          code: "CONTRACT_REVERTED",
        });
      }),
    );

    it.effect("plan.reconcile refuses an unknown plan, step or transaction", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { accounts } = devnet;
        const chain = yield* Chain;
        const ens = (yield* Clients).make({ account: accounts.bob, storage: Plan.memoryStorage() });

        yield* chain.isolated(
          Effect.gen(function* () {
            const { hash, plan } = yield* Actions.record.setSync(ens, {
              name: fixtures.byId("records.v2").name,
              texts: { url: "x" },
            });
            const { id } = plan;
            const step = plan.steps[0]?.id ?? "";
            // Neither from bob nor to the step's resolver.
            const unrelated = yield* chain.send({
              account: accounts.carol,
              chain: devnet.chain,
              to: accounts.user,
              value: 1n,
            });

            yield* expectFailure(Actions.plan.reconcile(ens, { id: "unknown", step, hash }), {
              _tag: "NotFoundError",
              code: "PLAN_NOT_FOUND",
            });
            yield* expectFailure(Actions.plan.reconcile(ens, { id, step: "unknown", hash }), {
              _tag: "InvalidInputError",
              code: "INVALID_RECORD_VALUE",
            });
            yield* expectFailure(
              Actions.plan.reconcile(ens, { id, step, hash: unrelated.transactionHash }),
              { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
            );
          }),
        );
      }),
    );
  });
});

describe("send failures", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    // Every write sends through the same runner; one write stands for all of them.
    it.effect("fails typed when a sent transaction reverts on chain", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const context = yield* Effect.context();
        const { carol, alice } = devnet.accounts;
        const { name, facts } = fixtures.byId("v2.roles");
        const registry = {
          address: devnet.contract("v2.ethRegistry"),
          abi: Abis.v2.permissionedRegistry,
        };

        // The owner revokes carol's resolver role while her write waits in the pool, paying more
        // so it is mined first.
        const revokeFirst = chain
          .submit({
            ...registry,
            account: alice,
            functionName: "revokeRoles",
            args: [BigInt(String(facts["tokenId"])), Roles.registry.setResolver, carol],
            maxFeePerGas: parseGwei("1000"),
            maxPriorityFeePerGas: parseGwei("100"),
          })
          .pipe(Effect.andThen(chain.mine()));

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.setAutomine(false);
            yield* expectFailure(
              Actions.resolver.setSync(clients.make({ account: carol }), {
                name,
                // Any address will do: the write is about to lose its role.
                resolver: stranger,
                allowNonContract: true,
                onStep: (event) => {
                  if (event.status === "submitted") Effect.runForkWith(context)(revokeFirst);
                },
              }),
              { _tag: "TransactionError", code: "TRANSACTION_REVERTED" },
            ).pipe(Effect.ensuring(Effect.orDie(chain.setAutomine(true))));
          }),
        );
      }),
    );

    it.effect("fails typed when a receipt does not come in time", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const ens = (yield* Clients).make({ account: accounts.bob });

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.setAutomine(false);
            yield* expectFailure(
              Actions.record.setSync(ens, {
                name: fixtures.byId("records.v2").name,
                texts: { url: "x" },
                timeout: 300,
              }),
              { _tag: "TransactionError", code: "RECEIPT_TIMEOUT" },
            ).pipe(Effect.ensuring(Effect.orDie(chain.setAutomine(true))));
          }),
        );
      }),
    );
  });
});
