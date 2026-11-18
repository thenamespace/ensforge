import type { Actions } from "@ensforge/sdk";
import type { DevnetInstance, ProfileName } from "@ensforge/test-devnet";

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

/** A fact that may differ per stage. */
export type PerStage = boolean | Readonly<Record<Stage, boolean>>;

export const atStage = (value: PerStage, stage: Stage): boolean =>
  typeof value === "boolean" ? value : value[stage];

/** An owner: a named devnet account, or nobody. */
export type Holder = keyof DevnetInstance["accounts"] | null;

export type NameExpectation = {
  readonly cases: readonly string[];
  readonly kind: NameKind;
  readonly status: NameStatus;
  readonly owner: Holder;
  readonly reachable: PerStage;
  readonly available: PerStage;
  readonly renewable: PerStage;
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

/**
 * An ENSv1 name below a `.eth` second-level name: never registered or renewed. Unreachable from
 * ENSv2 like its unreserved parent; {@link belowPremigrated} makes it reachable.
 */
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
  reachable: { v1: true, greenfield: false, launched: false },
  available: status === "expired" || status === "available",
  renewable: false,
});

/** An ENSv1 DNS name: ENSv2 resolves it through the DNS TLD resolver, which reads ENSv1 first. */
export const v1Dns = (
  cases: readonly string[],
  owner: Holder,
  kind: NameKind = "v1-unwrapped",
): NameExpectation => ({ ...v1Sub(cases, owner, "registered", kind), reachable: true });

/** An ENSv1 subname whose `.eth` ancestor ENSv2 reserved: resolved through the ENSv1 bridge. */
export const belowPremigrated = (expectation: NameExpectation): NameExpectation => ({
  ...expectation,
  reachable: true,
});

/** An ENSv2 `.eth` second-level name, native or migrated: registrable and renewable by status. */
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

/** An ENSv2 name below a second-level name: held in its parent's registry, never renewed. */
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
