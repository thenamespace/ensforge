import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Plan } from "@ensforge/sdk";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures, type FixturesApi } from "@ensforge/test-fixtures";
import { expectRejection, type ExpectedError } from "@ensforge/test-harness";
import { parseGwei, type Address } from "viem";

import { call, ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { testWallet } from "../support/wallet.ts";

type AccountName = "alice" | "bob" | "carol" | "user";

/** A write that must be refused, typed, before the wallet is asked to sign. */
type Refusal = {
  readonly label: string;
  readonly path: string;
  readonly account: AccountName;
  readonly options: (fixtures: FixturesApi, devnet: DevnetInstance) => Record<string, unknown>;
  readonly expected: ExpectedError;
};

const year = 31_536_000n;
const bad = "0x1234";
const stranger = "0x000000000000000000000000000000000000dEaD";
const unregistered = "nothing-here.eth";
const at = (id: string) => (fixtures: FixturesApi) => fixtures.byId(id).name;
const err = (_tag: string, code: string): ExpectedError => ({ _tag, code });

const nameState = (code: string) => err("NameStateError", code);
const invalid = (code: string) => err("InvalidInputError", code);
const unsupported = (code: string) => err("UnsupportedError", code);
const unauthorized = (code: string) => err("UnauthorizedError", code);
const notFound = (code: string) => err("NotFoundError", code);

const refusals: readonly Refusal[] = [
  // Input checked after reading the chain.
  {
    label: "a bad owner",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an unknown coin",
    path: "record.set",
    account: "alice",
    options: (f, d) => ({ name: at("records.v1")(f), addresses: { nope: d.accounts.alice } }),
    expected: invalid("INVALID_COIN_TYPE"),
  },
  {
    label: "an unknown content hash",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), contentHash: "nope://x" }),
    expected: invalid("INVALID_CONTENT_HASH"),
  },
  {
    label: "a bad owner",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad referrer",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, referrer: "0x12" }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad owner",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad referrer",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, referrer: "0x12" }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad payment token",
    path: "registration.renew",
    account: "alice",
    options: (f) => ({ names: at("v2.registered")(f), duration: year, paymentToken: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a bad registry",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f), registry: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "a negative record id",
    path: "resolver.link",
    account: "bob",
    options: (f) => ({ name: at("records.v2.linked")(f), to: { recordId: -1n } }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "a bad owner",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${at("v2.registered")(f)}`, owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "roles beyond uint256",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${at("v2.registered")(f)}`, roles: 1n << 300n }),
    expected: invalid("INVALID_ROLES"),
  },
  {
    label: "record keys that are not coins",
    path: "permission.setRecordAccess",
    account: "bob",
    options: (f, d) => ({
      name: at("records.v2")(f),
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
    options: (f, d) => ({ name: at("v1.wrapped.expired")(f), to: d.accounts.carol }),
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
    options: (f) => ({ name: at("v1.unwrapped.expired")(f) }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: at("v2.unregistered.renewed")(f) }),
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
    options: (f, d) => ({ name: at("v1.unwrapped.expired")(f), manager: d.accounts.carol }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({ name: at("v2.unregistered.renewed")(f), manager: d.accounts.carol }),
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
    options: (f) => ({ name: at("v1.unwrapped.expired")(f), ttl: 60n }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: at("v2.unregistered.renewed")(f), ttl: 60n }),
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
    options: (f, d) => ({ name: at("v2.expired")(f), to: d.accounts.carol }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "name.transfer",
    account: "alice",
    options: (f, d) => ({ name: at("v2.unregistered.renewed")(f), to: d.accounts.carol }),
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
    options: (f) => ({ name: at("v2.unregistered.renewed")(f), texts: { url: "x" } }),
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
    options: (f) => ({ name: at("v2.expired")(f), registry: null }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired name",
    path: "resolver.create",
    account: "alice",
    options: (f) => ({ name: at("v2.expired")(f) }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "a reserved name",
    path: "resolver.create",
    account: "alice",
    options: (f) => ({ name: at("v2.unregistered.renewed")(f) }),
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
    options: (f) => ({ name: at("v2.expired")(f), to: at("records.v2")(f) }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired parent",
    path: "subname.create",
    account: "alice",
    options: (f) => ({ name: `x.${at("v2.expired")(f)}` }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an expired parent",
    path: "subname.remove",
    account: "alice",
    options: (f) => ({ name: `x.${at("v2.expired")(f)}` }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered child",
    path: "subname.remove",
    account: "alice",
    options: (f) => ({ name: `nope.${at("records.v1")(f)}` }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  // The other protocol.
  {
    label: "an ENSv2 name",
    path: "approval.setToken",
    account: "alice",
    options: (f, d) => ({ name: at("v2.registered")(f), to: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.reclaim",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f) }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.setManager",
    account: "alice",
    options: (f, d) => ({ name: at("v2.registered")(f), manager: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv2 name",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f), ttl: 60n }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "the registrant of a subname",
    path: "name.transfer",
    account: "bob",
    options: (f, d) => ({ name: at("v1.subname")(f), to: d.accounts.carol, role: "registrant" }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv1 name",
    path: "registry.attach",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), registry: null }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "an ENSv1 name",
    path: "registry.deploy",
    account: "alice",
    options: (f) => ({ attachTo: at("records.v1")(f) }),
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
      name: at("records.v1")(f),
    }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  // Resolvers and registries that are missing or cannot do it.
  {
    label: "a name without a resolver",
    path: "permission.setRecordAccess",
    account: "alice",
    options: (f, d) => ({ name: at("v2.registered")(f), grantee: d.accounts.carol }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "approval.setDelegate",
    account: "alice",
    options: (f, d) => ({
      name: at("resolver.none")(f),
      delegate: d.accounts.carol,
      approved: true,
    }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f), to: at("records.v2")(f) }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a resolver",
    path: "resolver.upgrade",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f) }),
    expected: notFound("RESOLVER_NOT_FOUND"),
  },
  {
    label: "a name without a registry",
    path: "registry.setUri",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f), uri: "x" }),
    expected: notFound("REGISTRY_NOT_FOUND"),
  },
  {
    label: "a name without a registry",
    path: "registry.upgrade",
    account: "alice",
    options: (f) => ({ name: at("v2.registered")(f) }),
    expected: notFound("REGISTRY_NOT_FOUND"),
  },
  {
    label: "a PublicResolver",
    path: "resolver.link",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), to: at("records.v2")(f) }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "a PublicResolver",
    path: "resolver.upgrade",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f) }),
    expected: unsupported("RESOLVER_PROFILE_UNSUPPORTED"),
  },
  {
    label: "data on a resolver without data records",
    path: "record.set",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), data: { key: "0x12" } }),
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
    options: (f) => ({ name: at("records.v2")(f), implementation: stranger }),
    expected: unsupported("UPGRADE_NOT_APPROVED"),
  },
  // Authorization.
  {
    label: "a stranger",
    path: "name.reclaim",
    account: "user",
    options: (f) => ({ name: at("records.v1")(f) }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger",
    path: "name.setManager",
    account: "user",
    options: (f, d) => ({ name: at("records.v1")(f), manager: d.accounts.carol }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger",
    path: "name.setTtl",
    account: "user",
    options: (f) => ({ name: at("records.v1")(f), ttl: 60n }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a burned CANNOT_SET_TTL",
    path: "name.setTtl",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.locked.cannot-set-ttl")(f), ttl: 60n }),
    expected: unauthorized("FUSE_BURNED"),
  },
  {
    label: "a stranger",
    path: "registry.attach",
    account: "user",
    options: (f) => ({ name: at("v2.registered")(f), registry: null }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "registry.deploy",
    account: "user",
    options: (f) => ({ attachTo: at("v2.registered")(f) }),
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
    options: (f) => ({ name: at("records.v1")(f) }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger's ENSv2 name",
    path: "resolver.create",
    account: "user",
    options: (f) => ({ name: at("v2.registered")(f) }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger",
    path: "resolver.link",
    account: "user",
    options: (f) => ({ name: at("records.v2.linked")(f), to: at("records.v2")(f) }),
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
      name: at("v2.roles")(f),
    }),
    expected: unauthorized("CANNOT_GRANT_ROLES"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.create",
    account: "user",
    options: (f) => ({ name: `x.${at("v2.registered")(f)}` }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.create",
    account: "user",
    options: (f) => ({ name: `x.${at("records.v1")(f)}` }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.remove",
    account: "user",
    options: (f) => ({ name: at("v2.subnames")(f) }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.remove",
    account: "user",
    options: (f) => ({ name: at("v1.subname")(f) }),
    expected: unauthorized("NOT_OWNER"),
  },
  // The NameWrapper and subname updates.
  {
    label: "a bad owner",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => ({ name: at("records.v1")(f), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an expired name",
    path: "wrapper.wrap",
    account: "alice",
    options: (f) => ({ name: at("v1.unwrapped.expired")(f) }),
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
    options: (f) => ({ name: at("records.v1")(f) }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a bad owner",
    path: "wrapper.unwrap",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped")(f), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "an expired name",
    path: "wrapper.unwrap",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.expired")(f) }),
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
    options: (f) => ({ name: at("v1.wrapped")(f) }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an expired name",
    path: "wrapper.setFuses",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.expired")(f), fuses: ["cannotUnwrap"] }),
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
    options: (f) => ({ name: at("v1.wrapped")(f), fuses: ["cannotUnwrap"] }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an unknown fuse",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.sub")(f), fuses: ["nope"] }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "an expiry beyond uint64",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.sub")(f), expiry: 1n << 64n }),
    expected: invalid("INVALID_EXPIRY"),
  },
  {
    label: "an expired name",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: at("v1.wrapped.expired")(f), fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an unregistered child",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: `nope.${at("v1.wrapped")(f)}`, fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an ENSv2 name",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: at("v2.subnames")(f), fuses: ["parentCannotControl"] }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "a stranger",
    path: "wrapper.setChildFuses",
    account: "user",
    options: (f) => ({ name: at("v1.wrapped.sub")(f), fuses: ["parentCannotControl"] }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "a bad owner",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: at("v1.subname")(f), owner: bad }),
    expected: invalid("INVALID_ADDRESS"),
  },
  {
    label: "nothing to change",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: at("v1.subname")(f) }),
    expected: invalid("INVALID_RECORD_VALUE"),
  },
  {
    label: "an earlier ENSv2 expiry",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: at("v2.subnames")(f), expiry: 1n }),
    expected: invalid("INVALID_EXPIRY"),
  },
  {
    label: "an unregistered child",
    path: "subname.update",
    account: "alice",
    options: (f, d) => ({ name: `nope.${at("records.v1")(f)}`, owner: d.accounts.carol }),
    expected: nameState("NAME_NOT_REGISTERED"),
  },
  {
    label: "an expired parent",
    path: "subname.update",
    account: "alice",
    options: (f) => ({ name: `x.${at("v2.expired")(f)}`, resolver: stranger }),
    expected: nameState("NAME_EXPIRED"),
  },
  {
    label: "an ENSv2 owner change",
    path: "subname.update",
    account: "alice",
    options: (f, d) => ({ name: at("v2.subnames")(f), owner: d.accounts.carol }),
    expected: unsupported("UNSUPPORTED_PROTOCOL"),
  },
  {
    label: "a stranger in ENSv2",
    path: "subname.update",
    account: "user",
    options: (f) => ({ name: at("v2.subnames")(f), resolver: stranger }),
    expected: unauthorized("MISSING_ROLES"),
  },
  {
    label: "a stranger in ENSv1",
    path: "subname.update",
    account: "user",
    options: (f, d) => ({ name: at("v1.subname")(f), owner: d.accounts.carol }),
    expected: unauthorized("NOT_OWNER"),
  },
  {
    label: "an unwrapped child",
    path: "wrapper.setChildFuses",
    account: "alice",
    options: (f) => ({ name: at("v1.subname")(f), fuses: ["parentCannotControl"] }),
    expected: nameState("NAME_NOT_WRAPPED"),
  },
  // Payment and migration.
  {
    label: "an account without funds",
    path: "registration.register",
    account: "user",
    options: () => ({ names: "qqqqq.eth", duration: year }),
    expected: err("InsufficientFundsError", "INSUFFICIENT_TOKEN_BALANCE"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.register",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, paymentToken: stranger }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.commit",
    account: "alice",
    options: () => ({ names: "qqqqq.eth", duration: year, paymentToken: stranger }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a token the registrar refuses",
    path: "registration.renew",
    account: "alice",
    options: (f) => ({ names: at("v2.registered")(f), duration: year, paymentToken: stranger }),
    expected: unsupported("PAYMENT_TOKEN_UNSUPPORTED"),
  },
  {
    label: "a migrated name",
    path: "migration.migrate",
    account: "alice",
    options: (f) => ({ names: at("migration.unwrapped")(f), resolver: "keep" }),
    expected: err("MigrationError", "ALREADY_MIGRATED"),
  },
  {
    label: "records it cannot see",
    path: "migration.migrate",
    account: "alice",
    options: (f) => ({ names: at("v2.reserved")(f), resolver: "new" }),
    expected: err("MigrationError", "RECORDS_UNKNOWN"),
  },
];

describe("write refusals", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    for (const refusal of refusals) {
      it.effect(`${refusal.path} refuses ${refusal.label}`, () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const account = devnet.accounts[refusal.account];
          const wallet = testWallet(devnet, account);
          const [domain = "", name = ""] = refusal.path.split(".");
          const group =
            (
              ensforge(devnet, { account, wallet }) as unknown as Record<
                string,
                Record<string, (o: unknown) => Promise<unknown>>
              >
            )[domain] ?? {};
          const sync = group[`${name}Sync`];
          if (sync === undefined) return assert.fail(`${refusal.path} has no Sync form`);

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* expectRejection(
                () => sync({ ...refusal.options(fixtures, devnet), onStep: passWaits(devnet) }),
                refusal.expected,
              );
              assert.isFalse(wallet.prompted(), "refused before the wallet was asked");
            }),
          );
        }),
      );
    }

    it.effect("registration.commit refuses a commitment already made", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const ens = ensforge(devnet, { account: devnet.accounts.alice });
        const options = { names: "qqqqq.eth", duration: year } as const;
        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const { secret, readyAt } = yield* call(() => ens.registration.commitSync(options));
            // Until it is ready the commitment reads as too new; once ready, it must not be redone.
            yield* Effect.promise(async () => {
              await devnet.client.setNextBlockTimestamp({ timestamp: readyAt });
              await devnet.client.mine({ blocks: 1 });
            });
            yield* expectRejection(() => ens.registration.commit({ ...options, secret }), {
              _tag: "CommitmentError",
              code: "COMMITMENT_EXISTS",
            });
          }),
        );
      }),
    );

    it.effect("plan.send refuses a plan prepared for another account", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const plan = yield* call(() =>
          ensforge(devnet, { account: devnet.accounts.bob }).record.set.prepare({
            name: fixtures.byId("records.v2").name,
            texts: { url: "x" },
          }),
        );
        yield* expectRejection(
          () => ensforge(devnet, { account: devnet.accounts.carol }).plan.send({ plan }),
          {
            _tag: "PlanError",
            code: "PLAN_ACCOUNT_MISMATCH",
          },
        );
      }),
    );

    it.effect("plan.send fails CONTRACT_REVERTED for a step that reverts without a reason", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const ens = ensforge(devnet, { account: devnet.accounts.bob });
        const plan = yield* call(() =>
          ens.record.set.prepare({ name: fixtures.byId("records.v2").name, texts: { url: "x" } }),
        );
        // A call the resolver has no function for reverts with empty data.
        const [step] = plan.steps;
        const [first] = step?.calls ?? [];
        if (step === undefined || first === undefined) return assert.fail("the plan has no call");
        const garbled = {
          ...plan,
          steps: [{ ...step, calls: [{ ...first, data: "0xdeadbeef" as const }] }],
        };
        yield* expectRejection(() => ens.plan.send({ plan: garbled }), {
          _tag: "ContractRevertError",
          code: "CONTRACT_REVERTED",
        });
      }),
    );

    it.effect("plan.reconcile refuses an unknown plan, step or transaction", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { bob, carol, user } = devnet.accounts;
        const ens = ensforge(devnet, { account: bob, storage: Plan.memoryStorage() });

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const { hash, plan } = yield* call(() =>
              ens.record.setSync({ name: fixtures.byId("records.v2").name, texts: { url: "x" } }),
            );
            const { id } = plan;
            const step = plan.steps[0]?.id ?? "";
            // Neither from bob nor to the step's resolver.
            const unrelated = yield* Effect.promise(() =>
              devnet.client.sendTransaction({
                account: carol,
                chain: devnet.chain,
                to: user,
                value: 1n,
              }),
            );

            yield* expectRejection(() => ens.plan.reconcile({ id: "unknown", step, hash }), {
              _tag: "NotFoundError",
              code: "PLAN_NOT_FOUND",
            });
            yield* expectRejection(() => ens.plan.reconcile({ id, step: "unknown", hash }), {
              _tag: "InvalidInputError",
              code: "INVALID_RECORD_VALUE",
            });
            yield* expectRejection(() => ens.plan.reconcile({ id, step, hash: unrelated }), {
              _tag: "InvalidInputError",
              code: "INVALID_RECORD_VALUE",
            });
          }),
        );
      }),
    );
  });
});

/** Alice revokes `holder`'s resolver role, paying more than a pending write so it is mined first. */
const revokeFirst = (devnet: DevnetInstance, tokenId: bigint, holder: Address) =>
  devnet.client
    .writeContract({
      account: devnet.accounts.alice,
      chain: devnet.chain,
      address: devnet.contracts["v2.ethRegistry"] as Address,
      abi: Abis.v2.permissionedRegistry,
      functionName: "revokeRoles",
      args: [tokenId, Roles.registry.setResolver, holder],
      maxFeePerGas: parseGwei("1000"),
      maxPriorityFeePerGas: parseGwei("100"),
    })
    .then(() => devnet.client.mine({ blocks: 1 }));

describe("send failures", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    // Every write sends through the same runner; one write stands for all of them.
    it.effect("fails typed when a sent transaction reverts on chain", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { carol } = devnet.accounts;
        const { name, facts } = fixtures.byId("v2.roles");

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            // Carol's write passes simulation; the owner's revoke, paid more, is mined before it.
            yield* Effect.promise(() => devnet.client.setAutomine(false));
            yield* expectRejection(
              () =>
                ensforge(devnet, { account: carol }).resolver.setSync({
                  name,
                  resolver: stranger,
                  onStep: (event) => {
                    if (event.status === "submitted")
                      void revokeFirst(devnet, BigInt(String(facts["tokenId"])), carol);
                  },
                }),
              { _tag: "TransactionError", code: "TRANSACTION_REVERTED" },
            );
            yield* Effect.promise(() => devnet.client.setAutomine(true));
          }),
        );
      }),
    );

    it.effect("fails typed when a receipt does not come in time", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            yield* Effect.promise(() => devnet.client.setAutomine(false));
            yield* expectRejection(
              () =>
                ensforge(devnet, { account: devnet.accounts.bob }).record.setSync({
                  name: fixtures.byId("records.v2").name,
                  texts: { url: "x" },
                  timeout: 300,
                }),
              { _tag: "TransactionError", code: "RECEIPT_TIMEOUT" },
            );
            yield* Effect.promise(() => devnet.client.setAutomine(true));
          }),
        );
      }),
    );
  });
});
