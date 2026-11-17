import type { Address } from "viem";

import type { Constants } from "./world.ts";

/** An ENSv2 `.eth` name the fuzzer registered. */
export type V2Name = {
  readonly owner: Address;
  readonly expiry: bigint;
  /** The name's own PermissionedResolver, deployed at registration. */
  readonly resolver: Address | null;
  /** Holder of the resolver's roles: the registrant until records are handed over. */
  readonly recordsAdmin: Address;
  readonly url: string | null;
  /** Accounts other than the owner holding `setResolver` on the name. */
  readonly delegates: readonly Address[];
  /** Owner of `sub.<name>`, when created and not removed. */
  readonly sub: Address | null;
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
  readonly fuses: number;
  readonly url: string | null;
  readonly sub: Address | null;
  /** Moved to ENSv2: ENSv1 state is no longer the name's state. */
  readonly migrated: boolean;
};

export type Model = {
  readonly now: bigint;
  readonly v2: Readonly<Record<string, V2Name | undefined>>;
  readonly v1: Readonly<Record<string, V1Name>>;
  /** Primary name each actor set, by address. */
  readonly primary: Readonly<Record<Address, string | null>>;
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

export const withV2 = (model: Model, label: string, entry: V2Name | undefined): Model => ({
  ...model,
  v2: { ...model.v2, [label]: entry },
});

export const withV1 = (model: Model, name: string, entry: V1Name): Model => ({
  ...model,
  v1: { ...model.v1, [name]: entry },
});

/** Picks the `index`th of `items` (modulo), so any generated index names a live entity. */
export const pick = <A>(items: readonly A[], index: number): A | undefined =>
  items.length === 0 ? undefined : items[index % items.length];
