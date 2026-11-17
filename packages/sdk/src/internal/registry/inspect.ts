import { Effect } from "effect";

import { Abis, InterfaceIds, Roles } from "@ensforge/contracts";
import { getAddress, isAddressEqual, sliceHex, zeroAddress, zeroHash, type Address } from "viem";
import { getStorageAt } from "viem/actions";

import type { RegistryInfo, RegistryKind } from "../../actions/registry/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { dnsDecode } from "../../utils/Name.js";
import * as Rpc from "../rpc/index.js";

// ERC-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1).
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const orNull = (address: Address | undefined): Address | null =>
  address === undefined || isAddressEqual(address, zeroAddress) ? null : address;

/**
 * Inspects an ENSv2 registry in two batched rounds: identity, parent, canonical name, URI and
 * emancipation, then whether the deployment's latest implementation would accept an upgrade.
 *
 * Two checks gate an upgrade. The verifiable proxy always requires
 * `latest.canUpgradeFrom(current)` (`InvalidUpgradeTarget`). The registry then requires the
 * `upgrade` root role, and, once emancipated, an implementation in its upgrade set.
 */
export const inspectRegistry = Effect.fnUntraced(function* (
  client: Client,
  address: Address,
  options: { readonly account?: Address | undefined } & Read.BlockOptions = {},
): Effect.fn.Return<RegistryInfo, AnyError> {
  const v2 = client.deployment.v2;
  const at =
    options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber };
  const registry = { address, abi: Abis.v2.userRegistry, ...at } as const;

  const read = yield* Effect.all(
    {
      word: Rpc.fromPromise(() =>
        getStorageAt(client.publicClient, { address, slot: implementationSlot, ...at }),
      ),
      parent: Rpc.readContractOrUndefined(client, { ...registry, functionName: "getParent" }),
      emancipated: Rpc.readContractOrUndefined(client, {
        ...registry,
        functionName: "isEmancipated",
      }),
      uri: Rpc.readContractOrUndefined(client, { ...registry, functionName: "getURI" }),
      upgradeSet: Rpc.readContractOrUndefined(client, { ...registry, functionName: "UPGRADE_SET" }),
      wrapper: Rpc.readContractOrUndefined(client, {
        ...registry,
        functionName: "supportsInterface",
        args: [InterfaceIds.registry.wrapperRegistry],
      }),
      canonical:
        v2 === undefined
          ? Effect.undefined
          : Rpc.readContractOrUndefined(client, {
              address: v2.contracts.universalHelper,
              abi: Abis.v2.universalHelper,
              functionName: "findCanonicalName",
              args: [address],
              ...at,
            }),
      canUpgrade:
        options.account === undefined
          ? Effect.undefined
          : Rpc.readContractOrUndefined(client, {
              ...registry,
              functionName: "hasRootRoles",
              args: [Roles.registry.upgrade, options.account],
            }),
    },
    { concurrency: "unbounded" },
  );

  const implementation = getAddress(sliceHex(read.word ?? zeroHash, 12));
  const kind: RegistryKind =
    v2 !== undefined && isAddressEqual(address, v2.contracts.rootRegistry)
      ? "root"
      : v2 !== undefined && isAddressEqual(address, v2.contracts.ethRegistry)
        ? "eth"
        : read.wrapper === true
          ? "wrapper"
          : read.emancipated === undefined
            ? "unknown"
            : "user";
  const latest =
    kind === "user"
      ? (v2?.implementations.userRegistry ?? null)
      : kind === "wrapper"
        ? (v2?.implementations.wrapperRegistry ?? null)
        : null;
  const emancipated = read.emancipated === true;

  let blocker: RegistryInfo["upgrade"]["blocker"] = null;
  if (latest === null) blocker = "not-upgradeable";
  else if (isAddressEqual(latest, implementation)) blocker = "up-to-date";
  else {
    const { accepts, listed } = yield* Effect.all(
      {
        accepts: Rpc.readContractOrUndefined(client, {
          address: latest,
          abi: Abis.v2.userRegistry,
          functionName: "canUpgradeFrom",
          args: [implementation],
          ...at,
        }),
        listed:
          !emancipated ||
          read.upgradeSet === undefined ||
          isAddressEqual(read.upgradeSet, zeroAddress)
            ? Effect.undefined
            : Rpc.readContractOrUndefined(client, {
                address: read.upgradeSet,
                abi: Abis.v2.permissionedAddressSet,
                functionName: "includes",
                args: [latest],
                ...at,
              }),
      },
      { concurrency: "unbounded" },
    );
    if (accepts !== true || (emancipated && listed !== true)) blocker = "not-approved";
  }
  if (blocker === null && read.canUpgrade === false) blocker = "unauthorized";

  const canonical =
    read.canonical === undefined || read.canonical === "0x" ? null : dnsDecode(read.canonical);
  return {
    address,
    kind,
    implementation,
    parent:
      read.parent === undefined || isAddressEqual(read.parent[0], zeroAddress)
        ? null
        : { registry: read.parent[0], label: read.parent[1] },
    canonicalName: canonical === "" ? null : canonical,
    uri: read.uri === undefined || read.uri[0] === "" ? null : read.uri[0],
    renderer: orNull(read.uri?.[1]),
    emancipated,
    upgrade: { latest, eligible: blocker === null, blocker },
  };
});
