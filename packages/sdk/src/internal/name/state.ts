import { hexToBigInt, maxUint64 } from "viem";

import type { NameKind, NameState, NameStatus } from "../../actions/name/get/types.js";
import { nonZeroAddress } from "../address.js";
import { RegistryStatus, type NameData, type V1Data, type V2Data } from "./read.js";
import type { ServedKind } from "./served.js";

// ENSv1 counts the last second of a window as inside it: BaseRegistrar renews and withholds a
// name through `expiry + GRACE_PERIOD`, and NameWrapper expires a token only once `expiry < now`.
// Registrar tokens (with a grace period) still expire at `expiry`.
const v1Status = (now: bigint, expiry: bigint, gracePeriod: bigint | undefined): NameStatus => {
  if (gracePeriod === undefined) return now <= expiry ? "registered" : "expired";
  if (now < expiry) return "registered";
  return now <= expiry + gracePeriod ? "grace" : "expired";
};

const flags = (status: NameStatus, isEth2ld: boolean) => ({
  available: status === "available" || status === "expired",
  renewable: isEth2ld && (status === "registered" || status === "grace"),
});

// The `.eth` rules of contracts-v2 v1.0.1 for a label's ENSv2 entry. ETHRegistrar registers a
// label once it is AVAILABLE and past grace; ETHRenewerV1 renews an ENSv1 name only through the
// reservation ENSv2 holds for it, or within grace after that reservation lapsed.
const v2Registers = (now: bigint, v2: V2Data): boolean =>
  v2.state.status === RegistryStatus.available && now - v2.state.expiry >= (v2.gracePeriod ?? 0n);

export const v2RenewsForV1 = (now: bigint, v2: V2Data): boolean =>
  v2.state.status === RegistryStatus.reserved ||
  (v2.state.status === RegistryStatus.available &&
    nonZeroAddress(v2.state.latestOwner) === null &&
    now - v2.state.expiry < (v2.gracePeriod ?? 0n));

/** A name's state as its registries hold it: `name.get` without where it is served from. */
export type RegistryState = Omit<
  NameState,
  "inheritedResolver" | "chainId" | "namespace" | "protocol"
> & {
  /** ENS's registries hold the name; L2 names are read on their L2. */
  readonly protocol: "v1" | "v2";
};

/** How the deployment registers and renews `.eth` names. */
export type Registration = {
  /** ENSv1's controllers still register and renew (before the ENSv2 launch). */
  readonly v1Registers: boolean;
};

const fromV2 = (
  data: NameData,
  v2: V2Data,
  kind: NameKind,
): Omit<RegistryState, "name" | "kind" | "reachable"> => {
  const { state } = v2;
  const neverExpires = state.expiry === maxUint64;
  const status: NameStatus =
    kind === "v2-reserved"
      ? "reserved"
      : neverExpires || data.now < state.expiry
        ? "registered"
        : v2.gracePeriod !== undefined && data.now < state.expiry + v2.gracePeriod
          ? "grace"
          : "expired";

  return {
    protocol: "v2",
    status,
    // An expired token has no holder, in grace too: `latestOwner` is history, not ownership.
    owner: status === "registered" ? nonZeroAddress(state.latestOwner) : null,
    manager: null,
    registrant: null,
    registry: v2.registry,
    subregistry: nonZeroAddress(v2.subregistry),
    resolver: nonZeroAddress(v2.resolver),
    expiry: neverExpires || state.expiry === 0n ? null : state.expiry,
    gracePeriodEnd:
      v2.gracePeriod === undefined || neverExpires ? null : state.expiry + v2.gracePeriod,
    tokenId: state.tokenId,
    resource: state.resource,
    ttl: null,
    wrapped: false,
    migrated: kind === "v2-migrated",
    ...(kind === "v2-reserved"
      ? { available: false, renewable: false }
      : flags(status, data.parts.isEth2ld)),
  };
};

const fromV1 = (
  data: NameData,
  v1: V1Data,
  wrapped: boolean,
  registration: Registration,
): Omit<RegistryState, "name" | "kind" | "reachable"> => {
  const { registrar } = v1;
  const unwrapped2ld = !wrapped && registrar !== undefined;
  const expiry =
    registrar !== undefined
      ? registrar.expiry
      : wrapped && v1.wrapper.expiry > 0n
        ? v1.wrapper.expiry
        : null;
  const status: NameStatus =
    expiry === null || expiry === 0n
      ? nonZeroAddress(v1.registryOwner) === null
        ? "available"
        : "registered"
      : v1Status(data.now, expiry, registrar?.gracePeriod);

  return {
    protocol: "v1",
    status,
    owner: wrapped
      ? nonZeroAddress(v1.wrapper.owner)
      : unwrapped2ld
        ? nonZeroAddress(registrar.registrant)
        : nonZeroAddress(v1.registryOwner),
    manager: wrapped ? null : nonZeroAddress(v1.registryOwner),
    registrant: unwrapped2ld ? nonZeroAddress(registrar.registrant) : null,
    registry: v1.registry,
    subregistry: null,
    resolver: nonZeroAddress(v1.resolver),
    expiry: expiry === 0n ? null : expiry,
    gracePeriodEnd:
      registrar === undefined || registrar.expiry === 0n
        ? null
        : registrar.expiry + registrar.gracePeriod,
    tokenId: wrapped
      ? hexToBigInt(data.parts.node)
      : unwrapped2ld
        ? hexToBigInt(data.parts.labelhash)
        : null,
    resource: null,
    ttl: v1.ttl,
    wrapped,
    migrated: false,
    ...v1Flags(data, status, registration),
  };
};

// Once ENSv2 exists, its registrar can register a `.eth` label it holds no reservation for, and
// after the launch ENSv1 `.eth` names renew only through that reservation. The launch retires
// only ENSv1's `.eth` registrar: parents still create subnames in ENSv1.
const v1Flags = (data: NameData, status: NameStatus, registration: Registration) => {
  const own =
    registration.v1Registers || !data.parts.isEth2ld
      ? flags(status, data.parts.isEth2ld)
      : { available: false, renewable: false };
  const v2 = data.parts.isEth2ld ? data.v2 : undefined;
  return {
    available: own.available || (v2 !== undefined && v2Registers(data.now, v2)),
    renewable: own.renewable || (v2 !== undefined && v2RenewsForV1(data.now, v2)),
  };
};

const unregistered = (data: NameData): Omit<RegistryState, "name" | "kind" | "reachable"> => ({
  protocol: data.v2 !== undefined || data.v1 === undefined ? "v2" : "v1",
  status: "available",
  owner: null,
  manager: null,
  registrant: null,
  registry: data.v2?.registry ?? data.v1?.registry ?? null,
  subregistry: null,
  resolver: null,
  expiry: null,
  gracePeriodEnd: null,
  tokenId: null,
  resource: null,
  ttl: null,
  wrapped: false,
  migrated: false,
  available: true,
  renewable: false,
});

/** The state of a name no registry holds that a parent's resolver or an L2 namespace serves. */
export const toServedState = (state: RegistryState, kind: ServedKind | "l2"): RegistryState => ({
  ...state,
  kind,
  status: "external",
  available: false,
  renewable: false,
});

/** Builds the public state of a classified name. */
export const toNameState = (
  data: NameData,
  kind: NameKind,
  registration: Registration,
): RegistryState => {
  // ENSv2 resolves an ENSv1 name only through a resolver that reads ENSv1. Resolution walks
  // through the ancestors, so a child of an unreachable parent is unreachable too. ENSv2 looks
  // labels up by text: for a label known only by its hash that the parent registry reserved, the
  // reservation's resolver (the ENSv1 bridge) answers.
  const v1 = kind === "v1-unwrapped" || kind === "v1-wrapped";
  const reachable =
    !v1 ||
    data.reachesV1 !== false ||
    (data.parts.encodedLabel && data.v2?.state.status === RegistryStatus.reserved);
  const fields =
    (kind === "v2-native" || kind === "v2-migrated" || kind === "v2-reserved") &&
    data.v2 !== undefined
      ? fromV2(data, data.v2, kind)
      : (kind === "v1-unwrapped" || kind === "v1-wrapped") && data.v1 !== undefined
        ? fromV1(data, data.v1, kind === "v1-wrapped", registration)
        : unregistered(data);

  return { name: data.parts.name, kind, ...fields, reachable };
};
