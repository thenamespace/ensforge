import { Array as Arr, Option } from "effect";

import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { Name } from "@ensforge/sdk";
import type { Address } from "viem";

import type { Constants, World } from "./world.ts";

/** An ENSv2 `.eth` name: registered by the fuzzer, or migrated from ENSv1. */
export type V2Name = {
  readonly owner: Address;
  readonly expiry: bigint;
  readonly resolver: Address | null;
  /** The resolver the name started with, to set back after clearing it. */
  readonly ownResolver: Address | null;
  /** Holder of the resolver's roles: the registrant, or `null` when the model does not know. */
  readonly recordsAdmin: Address | null;
  readonly url: string | null;
  /** The resolver's ETH address record. */
  readonly addr: Address | null;
  /** Accounts other than the owner holding `setResolver` on the name. */
  readonly delegates: readonly Address[];
  /** Owner of `sub.<name>`, when created and not removed. */
  readonly sub: Address | null;
  /** Deployer of the name's subregistry: its roles stay with them when the name moves. */
  readonly subregistryAdmin: Address | null;
};

/** A seeded ENSv1 `.eth` name. */
export type V1Name = {
  readonly wrapped: boolean;
  /** Registry owner, or the NameWrapper token holder once wrapped. */
  readonly manager: Address;
  /** Registrar token holder (the NameWrapper while wrapped). */
  readonly registrant: Address;
  readonly expiry: bigint;
  readonly resolver: Address | null;
  readonly ownResolver: Address | null;
  /** NameWrapper fuses, as the wrapper stores them. */
  readonly fuses: number;
  readonly url: string | null;
  readonly addr: Address | null;
  readonly sub: Address | null;
  /** When the name's ENSv2 reservation (its ENSv1 expiry plus the migration bonus) ends. */
  readonly reservation: bigint;
  /** Moved to ENSv2: the name now lives in `Model.v2` under its label. */
  readonly migrated: boolean;
};

export type Model = {
  readonly now: bigint;
  readonly v2: Readonly<Record<string, V2Name | undefined>>;
  readonly v1: Readonly<Record<string, V1Name>>;
  /** Primary name each actor set, by address. */
  readonly primary: Readonly<Record<Address, string | null>>;
  /** ETH registry operators: `owner → operators`. */
  readonly operators: Readonly<Record<Address, readonly Address[]>>;
};

export type Status = "available" | "registered" | "grace" | "expired";

/** `name.get` status of an ENSv2 `.eth` name: registered until expiry, grace, then expired. */
export const v2Status = (model: Model, constants: Constants, label: string): Status => {
  const entry = model.v2[label];
  if (entry === undefined) return "available";
  if (model.now < entry.expiry) return "registered";
  return model.now < entry.expiry + constants.gracePeriod ? "grace" : "expired";
};

/** Whether a name in `status` can be registered again. */
export const isFree = (status: Status) => status === "available" || status === "expired";

/** ENSv1 `.eth` names: grace includes its last second (BaseRegistrar `expires + GRACE >= now`). */
export const v1Status = (model: Model, constants: Constants, name: string): Status => {
  const entry = model.v1[name];
  if (entry === undefined) return "available";
  if (model.now < entry.expiry) return "registered";
  return model.now <= entry.expiry + constants.v1GracePeriod ? "grace" : "expired";
};

/**
 * Whether an ENSv1 name still resolves: after the launch it resolves through its ENSv2
 * reservation, which ends before BaseRegistrar's grace does.
 */
export const v1Resolves = (model: Model, name: string) => {
  const entry = model.v1[name];
  return entry !== undefined && model.now < entry.reservation;
};

export const burned = (entry: V1Name, fuse: keyof typeof nameWrapperFuses) =>
  entry.wrapped && (entry.fuses & nameWrapperFuses[fuse]) !== 0;

/** Whether `actor` is an ETH registry operator of `owner`. */
export const isOperator = (model: Model, owner: Address, actor: Address) =>
  model.operators[owner]?.includes(actor) ?? false;

/** Where a target name lives now: on ENSv1 (until migrated) or as an ENSv2 label. */
export type Target =
  | { readonly protocol: "v1"; readonly name: string; readonly entry: V1Name }
  | { readonly protocol: "v2"; readonly name: string; readonly label: string };

export const targetOf = (model: Model, world: World, name: string): Target => {
  const entry = model.v1[name];
  return world.v1Names.includes(name) && entry !== undefined && !entry.migrated
    ? { protocol: "v1", name, entry }
    : { protocol: "v2", name, label: Name.parse(name).label };
};

export const withV2 = (model: Model, label: string, entry: V2Name | undefined): Model => ({
  ...model,
  v2: { ...model.v2, [label]: entry },
});

export const withV1 = (model: Model, name: string, entry: V1Name): Model => ({
  ...model,
  v1: { ...model.v1, [name]: entry },
});

/**
 * Picks the `index`th of `items` (modulo), so any generated index names a live entity. The lists
 * picked from are never empty; an empty one is a defect.
 */
export const pick = <A>(items: readonly A[], index: number): A =>
  Option.getOrThrowWith(Arr.get(items, index % items.length), () => new Error("pick from nothing"));
