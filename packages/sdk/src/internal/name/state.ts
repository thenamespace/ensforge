import { hexToBigInt, isAddressEqual, maxUint64, zeroAddress, type Address } from "viem";

import type { NameKind, NameState, NameStatus } from "../../actions/name/get/types.js";
import { RegistryStatus, type NameData, type V1Data, type V2Data } from "./read.js";

const orNull = (address: Address | undefined): Address | null =>
  address === undefined || isAddressEqual(address, zeroAddress) ? null : address;

/** Status of a registration that ends at `expiry`, with an optional grace period after it. */
const timedStatus = (now: bigint, expiry: bigint, gracePeriod: bigint | undefined): NameStatus => {
  if (now < expiry) return "registered";
  if (gracePeriod !== undefined && now < expiry + gracePeriod) return "grace";
  return "expired";
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

const v2RenewsForV1 = (now: bigint, v2: V2Data): boolean =>
  v2.state.status === RegistryStatus.reserved ||
  (v2.state.status === RegistryStatus.available &&
    isAddressEqual(v2.state.latestOwner, zeroAddress) &&
    now - v2.state.expiry < (v2.gracePeriod ?? 0n));

/** How the deployment registers and renews `.eth` names. */
export type Registration = {
  /** ENSv1's controllers still register and renew (before the ENSv2 launch). */
  readonly v1Registers: boolean;
};

const fromV2 = (
  data: NameData,
  v2: V2Data,
  kind: NameKind,
): Omit<NameState, "name" | "kind" | "reachable"> => {
  const { state } = v2;
  const neverExpires = state.expiry === maxUint64;
  const status: NameStatus =
    kind === "v2-reserved"
      ? "reserved"
      : neverExpires
        ? "registered"
        : timedStatus(data.now, state.expiry, v2.gracePeriod);

  return {
    protocol: "v2",
    status,
    // An expired token has no holder, in grace too: `latestOwner` is history, not ownership.
    owner: status === "registered" ? orNull(state.latestOwner) : null,
    manager: null,
    registrant: null,
    registry: v2.registry,
    subregistry: orNull(v2.subregistry),
    resolver: orNull(v2.resolver),
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
): Omit<NameState, "name" | "kind" | "reachable"> => {
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
      ? orNull(v1.registryOwner) === null
        ? "available"
        : "registered"
      : timedStatus(data.now, expiry, registrar?.gracePeriod);

  return {
    protocol: "v1",
    status,
    owner: wrapped
      ? orNull(v1.wrapper.owner)
      : unwrapped2ld
        ? orNull(registrar.registrant)
        : orNull(v1.registryOwner),
    manager: wrapped ? null : orNull(v1.registryOwner),
    registrant: unwrapped2ld ? orNull(registrar.registrant) : null,
    registry: v1.registry,
    subregistry: null,
    resolver: orNull(v1.resolver),
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
// after the launch ENSv1 names renew only through that reservation.
const v1Flags = (data: NameData, status: NameStatus, registration: Registration) => {
  const own = registration.v1Registers
    ? flags(status, data.parts.isEth2ld)
    : { available: false, renewable: false };
  const v2 = data.parts.isEth2ld ? data.v2 : undefined;
  return {
    available: own.available || (v2 !== undefined && v2Registers(data.now, v2)),
    renewable: own.renewable || (v2 !== undefined && v2RenewsForV1(data.now, v2)),
  };
};

const unregistered = (data: NameData): Omit<NameState, "name" | "kind" | "reachable"> => ({
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

/** Builds the public state of a classified name. */
export const toNameState = (
  data: NameData,
  kind: NameKind,
  registration: Registration,
): NameState => {
  // ENSv2 resolution of an ENSv1 name stops early when ENSv2 has a registry for its siblings but
  // no reservation for it (reserved names fall back to ENSv1), or when an ancestor below the TLD
  // is registered on ENSv2 without a registry for its children.
  const v1 = kind === "v1-unwrapped" || kind === "v1-wrapped";
  const reachable = !(
    v1 &&
    (data.v2 !== undefined ? data.v2.state.status !== RegistryStatus.reserved : data.ownedAncestor)
  );
  const fields =
    (kind === "v2-native" || kind === "v2-migrated" || kind === "v2-reserved") &&
    data.v2 !== undefined
      ? fromV2(data, data.v2, kind)
      : (kind === "v1-unwrapped" || kind === "v1-wrapped") && data.v1 !== undefined
        ? fromV1(data, data.v1, kind === "v1-wrapped", registration)
        : unregistered(data);

  return { name: data.parts.name, kind, ...fields, reachable };
};
