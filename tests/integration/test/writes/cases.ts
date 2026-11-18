import { Duration } from "@ensforge/sdk";
import type { AccountName, Devnet } from "@ensforge/test-devnet";
import type { FixturesApi } from "@ensforge/test-fixtures";

/** One write as an account that may make it, on `mainnet-shaped`. */
export type WriteCase = {
  readonly account: AccountName;
  readonly options: Readonly<Record<string, unknown>>;
};

/** An allowed call of every write, from the seeded fixtures. */
export const writeCases = (
  fixtures: FixturesApi,
  { accounts }: Devnet["Service"],
): Readonly<Record<string, WriteCase>> => {
  const nameOf = (id: string) => fixtures.byId(id).name;
  const fact = (id: string, key: string) => String(fixtures.byId(id).facts[key]);
  return {
    "approval.setDelegate": {
      account: "alice",
      options: { name: nameOf("records.v1"), delegate: accounts.carol, approved: true },
    },
    "approval.setOperator": {
      account: "alice",
      options: { operator: accounts.carol, approved: true, contract: "registry" },
    },
    "approval.setToken": {
      account: "alice",
      options: { name: nameOf("v1.wrapped"), to: accounts.carol },
    },
    "migration.migrate": {
      account: "alice",
      options: { names: nameOf("v2.reserved"), resolver: "keep" },
    },
    "name.reclaim": { account: "alice", options: { name: nameOf("records.v1") } },
    "name.setManager": {
      account: "alice",
      options: { name: nameOf("records.v1"), manager: accounts.carol },
    },
    "name.setTtl": { account: "alice", options: { name: nameOf("records.v1"), ttl: 60n } },
    "name.transfer": {
      account: "alice",
      options: { name: nameOf("v2.registered"), to: accounts.carol },
    },
    "permission.setRecordAccess": {
      account: "bob",
      options: { name: nameOf("records.v2"), grantee: accounts.carol, records: { texts: ["url"] } },
    },
    "primaryName.set": { account: "alice", options: { name: nameOf("primary.addr-reverse") } },
    "record.set": {
      account: "bob",
      options: { name: nameOf("records.v2"), texts: { url: "https://w.example" } },
    },
    "registration.commit": {
      account: "alice",
      options: { names: "qqqqq.eth", duration: Duration.years(1) },
    },
    "registration.register": {
      account: "alice",
      options: { names: "qqqqq.eth", duration: Duration.years(1) },
    },
    "registration.renew": {
      account: "alice",
      options: { names: nameOf("v2.registered"), duration: Duration.years(1) },
    },
    "registry.attach": {
      account: "alice",
      options: { name: nameOf("v2.registered"), registry: fact("v2.subnames", "registry") },
    },
    "registry.deploy": { account: "alice", options: {} },
    "registry.setUri": {
      account: "alice",
      options: { name: "v2-parent.eth", uri: "https://uri.example/{id}" },
    },
    "registry.upgrade": { account: "bob", options: { name: "v2-parent.eth" } },
    "resolver.create": { account: "alice", options: {} },
    "resolver.link": {
      account: "bob",
      options: { name: nameOf("records.v2.linked"), to: nameOf("records.v2") },
    },
    "resolver.set": {
      account: "alice",
      options: { name: nameOf("records.v1"), resolver: "default" },
    },
    "resolver.upgrade": { account: "bob", options: { name: nameOf("records.v2") } },
    "role.grant": {
      account: "alice",
      options: {
        grantee: accounts.carol,
        roles: ["setResolver"],
        target: "registry",
        name: nameOf("v2.registered"),
      },
    },
    "role.revoke": {
      account: "alice",
      options: {
        holder: fact("v2.roles", "delegate"),
        roles: ["setResolver"],
        target: "registry",
        name: nameOf("v2.roles"),
      },
    },
    "subname.create": { account: "alice", options: { name: `new.${nameOf("records.v1")}` } },
    "subname.update": {
      account: "alice",
      options: { name: nameOf("v1.subname"), owner: accounts.carol },
    },
    "subname.remove": { account: "bob", options: { name: nameOf("v1.subname") } },
    "wrapper.wrap": { account: "alice", options: { name: nameOf("records.v1") } },
    "wrapper.unwrap": { account: "alice", options: { name: nameOf("v1.wrapped") } },
    "wrapper.setFuses": {
      account: "alice",
      options: { name: nameOf("v1.wrapped"), fuses: ["cannotUnwrap"] },
    },
    "wrapper.setChildFuses": {
      account: "alice",
      options: { name: nameOf("v1.wrapped.sub"), fuses: ["parentCannotControl"] },
    },
  };
};
