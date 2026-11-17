import type { Actions } from "@ensforge/sdk";
import type { DevnetInstance, ProfileName } from "@ensforge/test-devnet";
import type { FixtureEntry } from "@ensforge/test-fixtures";
import type { Address } from "viem";

type NameState = Actions.name.get.ReturnType;
type NameKind = NameState["kind"];
type NameStatus = NameState["status"];

/**
 * Where a profile is in ENS's history: ENSv1 only, ENSv1 and ENSv2 before the launch, or after it
 * (ENSv1 no longer registers or renews; ENSv2 registers every label it has not reserved).
 */
export type Stage = "v1" | "greenfield" | "launched";

export const stageOf = (profile: ProfileName): Stage =>
  profile === "v1-live" ? "v1" : profile === "v1-v2-greenfield" ? "greenfield" : "launched";

/** A value that may differ per stage. */
export type PerStage<A> = A | { readonly v1?: A; readonly greenfield?: A; readonly launched?: A };

export const atStage = <A>(value: PerStage<A>, stage: Stage): A =>
  typeof value === "object" &&
  value !== null &&
  ("v1" in value || "greenfield" in value || "launched" in value)
    ? ((value as Record<Stage, A>)[stage] as A)
    : (value as A);

/** An owner: a named devnet account, a fixture fact holding an address, or nobody. */
export type Holder = keyof DevnetInstance["accounts"] | { readonly fact: string } | null;

export const holder = (
  devnet: DevnetInstance,
  fixture: FixtureEntry,
  value: Holder,
): Address | null =>
  value === null
    ? null
    : typeof value === "string"
      ? devnet.accounts[value]
      : (fixture.facts[value.fact] as Address);

export type NameExpectation = {
  readonly cases: readonly string[];
  readonly kind: NameKind;
  readonly status: NameStatus;
  readonly owner: Holder;
  readonly reachable: PerStage<boolean>;
  readonly available: PerStage<boolean>;
  readonly renewable: PerStage<boolean>;
  readonly wrapped?: boolean;
  readonly migrated?: boolean;
};

const live = (status: NameStatus) => status === "registered" || status === "grace";

/**
 * An ENSv1 `.eth` second-level name without an ENSv2 reservation: unreachable from ENSv2 once it
 * exists; registrable there; renewable only while ENSv1 still renews.
 */
export const v1Eth = (
  cases: readonly string[],
  owner: Holder,
  status: NameStatus = "registered",
  kind: NameKind = "v1-unwrapped",
): NameExpectation => ({
  cases,
  kind,
  status,
  owner,
  wrapped: kind === "v1-wrapped",
  reachable: { v1: true, greenfield: false, launched: false },
  available: live(status) ? { v1: false, greenfield: true, launched: true } : true,
  renewable: live(status) ? { v1: true, greenfield: true, launched: false } : false,
});

/** An ENSv1 `.eth` name ENSv2 reserved for it (premigrated): reachable, renews through ENSv2. */
export const v1Reserved = (cases: readonly string[], owner: Holder): NameExpectation => ({
  cases,
  kind: "v1-unwrapped",
  status: "registered",
  owner,
  reachable: true,
  available: false,
  renewable: true,
});

/**
 * An ENSv1 `.eth` name that `mainnet-shaped`'s premigration reserved: resolved through the ENSv1
 * bridge and renewed through its reservation. A reservation ends 62 days after the ENSv1 expiry,
 * inside the 90-day grace period, so an expired name is back to unreserved.
 */
export const premigrated = (expectation: NameExpectation): NameExpectation =>
  expectation.status === "expired"
    ? expectation
    : { ...expectation, reachable: true, available: false, renewable: true };

/** An ENSv1 name below a second-level name (or not under `.eth`): never registered or renewed. */
export const v1Sub = (
  cases: readonly string[],
  owner: Holder,
  status: NameStatus = "registered",
  kind: NameKind = "v1-unwrapped",
): NameExpectation => ({
  cases,
  kind,
  status,
  owner,
  wrapped: kind === "v1-wrapped",
  reachable: true,
  available: status === "expired" || status === "available",
  renewable: false,
});

export const v2Eth = (
  cases: readonly string[],
  owner: Holder,
  status: NameStatus = "registered",
  kind: NameKind = "v2-native",
): NameExpectation => ({
  cases,
  kind,
  status,
  owner,
  migrated: kind === "v2-migrated",
  reachable: true,
  available: !live(status),
  renewable: live(status),
});

export const v2Sub = (cases: readonly string[], owner: Holder): NameExpectation => ({
  cases,
  kind: "v2-native",
  status: "registered",
  owner,
  reachable: true,
  available: false,
  renewable: false,
});

/** A name nobody holds in the registry that now answers for it. */
export const unclaimed = (cases: readonly string[]): NameExpectation => ({
  cases,
  kind: "available",
  status: "available",
  owner: null,
  reachable: true,
  available: true,
  renewable: false,
});
