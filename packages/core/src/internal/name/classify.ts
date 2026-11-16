import { isAddressEqual, zeroAddress, type Address } from "viem";

import type { NameKind } from "../../actions/name/get/types.js";
import { RegistryStatus, type NameData, type V1Data } from "./read.js";

const isSet = (address: Address | undefined): address is Address =>
  address !== undefined && !isAddressEqual(address, zeroAddress);

/** Whether the ENSv1 records were retired to the Graveyard by migration (directly, or via a locked NameWrapper token). */
export const isMigrated = (
  v1: V1Data | undefined,
  graveyard: Address | undefined,
  nameWrapper: Address | undefined,
): boolean => {
  if (v1 === undefined || graveyard === undefined) return false;
  if (isAddressEqual(v1.registryOwner, graveyard)) return true;
  return (
    nameWrapper !== undefined &&
    isAddressEqual(v1.registryOwner, nameWrapper) &&
    isAddressEqual(v1.wrapper.owner, graveyard)
  );
};

/** Whether ENSv1 has any record of the name (an owner, or a `.eth` registration). */
const hasV1Record = (v1: V1Data | undefined): v1 is V1Data =>
  v1 !== undefined && (isSet(v1.registryOwner) || (v1.registrar?.expiry ?? 0n) > 0n);

const v1Kind = (v1: V1Data, nameWrapper: Address): NameKind =>
  isAddressEqual(v1.registryOwner, nameWrapper) ? "v1-wrapped" : "v1-unwrapped";

/**
 * Which protocol holds a name, and how.
 *
 * - ENSv2 `REGISTERED`, or `AVAILABLE` with a latest owner (expired, possibly in grace) → ENSv2.
 * - ENSv2 `RESERVED` → ENSv1 when ENSv1 has a record (pre-migration reservation), else `v2-reserved`.
 * - No ENSv2 entry → ENSv1 decides; migrated ENSv1 records never count.
 */
export const classify = (
  data: NameData,
  deployment: {
    readonly graveyard?: Address | undefined;
    readonly nameWrapper?: Address | undefined;
  },
): NameKind => {
  const migrated = isMigrated(data.v1, deployment.graveyard, deployment.nameWrapper);
  const state = data.v2?.state;

  if (
    state !== undefined &&
    (state.status === RegistryStatus.registered ||
      (state.status === RegistryStatus.available && isSet(state.latestOwner)))
  ) {
    return migrated ? "v2-migrated" : "v2-native";
  }

  const v1 = migrated ? undefined : data.v1;
  if (hasV1Record(v1) && deployment.nameWrapper !== undefined)
    return v1Kind(v1, deployment.nameWrapper);
  if (state?.status === RegistryStatus.reserved) return "v2-reserved";
  return "available";
};
