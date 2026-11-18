import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { nonZeroAddress, sameAddress } from "../address.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";
import type { NameParts } from "./parts.js";

/** ENSv2 `IPermissionedRegistry.Status`. */
export const RegistryStatus = { available: 0, reserved: 1, registered: 2 } as const;

/** ENSv1 records of a name. */
export type V1Data = {
  readonly registry: Address;
  readonly registryOwner: Address;
  readonly resolver: Address;
  readonly ttl: bigint;
  /** NameWrapper data; zeros when the name is not wrapped. */
  readonly wrapper: { readonly owner: Address; readonly fuses: number; readonly expiry: bigint };
  /** `.eth` second-level names only. */
  readonly registrar:
    | {
        /** Token holder, or `undefined` once expired (the registrar reverts). */
        readonly registrant: Address | undefined;
        readonly expiry: bigint;
        readonly gracePeriod: bigint;
      }
    | undefined;
};

/** ENSv2 records of a name in its parent registry. */
export type V2Data = {
  readonly registry: Address;
  readonly state: {
    readonly status: number;
    readonly expiry: bigint;
    readonly latestOwner: Address;
    readonly tokenId: bigint;
    readonly resource: bigint;
  };
  /** `undefined` when the label is only known by its hash. */
  readonly resolver: Address | undefined;
  readonly subregistry: Address | undefined;
  /** `.eth` registrar grace period, for `.eth` second-level names. */
  readonly gracePeriod: bigint | undefined;
};

/** Everything `name.get` and the name write planners need, read in two batched rounds. */
export type NameData = {
  readonly parts: NameParts;
  /** Block timestamp the data was read at. */
  readonly now: bigint;
  readonly v1: V1Data | undefined;
  /** `undefined` when the deployment has no ENSv2 or the name has no ENSv2 parent registry. */
  readonly v2: V2Data | undefined;
  /**
   * Whether ENSv2 resolution reaches ENSv1 for this name: the resolver ENSv2 finds for it is the
   * ENSv1 bridge or a DNS TLD resolver. `undefined` without ENSv2 at the read block.
   */
  readonly reachesV1: boolean | undefined;
};

const readV1 = (client: Client, parts: NameParts, at: Read.BlockOptions) => {
  const contracts = client.deployment.v1?.contracts;
  if (contracts === undefined) return Effect.undefined;

  const tokenId = hexToBigInt(parts.labelhash);
  const registry = { address: contracts.registry, abi: Abis.v1.ensRegistry, ...at } as const;
  const registrar = {
    address: contracts.baseRegistrar,
    abi: Abis.v1.baseRegistrar,
    ...at,
  } as const;

  return Effect.all(
    {
      registryOwner: Rpc.readContract(client, {
        ...registry,
        functionName: "owner",
        args: [parts.node],
      }),
      resolver: Rpc.readContract(client, {
        ...registry,
        functionName: "resolver",
        args: [parts.node],
      }),
      ttl: Rpc.readContract(client, { ...registry, functionName: "ttl", args: [parts.node] }),
      wrapper: Rpc.readContract(client, {
        address: contracts.nameWrapper,
        abi: Abis.v1.nameWrapper,
        functionName: "getData",
        args: [hexToBigInt(parts.node)],
        ...at,
      }),
      registrar: parts.isEth2ld
        ? Effect.all(
            {
              registrant: Rpc.readContractOrUndefined(client, {
                ...registrar,
                functionName: "ownerOf",
                args: [tokenId],
              }),
              expiry: Rpc.readContract(client, {
                ...registrar,
                functionName: "nameExpires",
                args: [tokenId],
              }),
              gracePeriod: Rpc.readContract(client, { ...registrar, functionName: "GRACE_PERIOD" }),
            },
            { concurrency: "unbounded" },
          )
        : Effect.undefined,
    },
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(({ wrapper: [owner, fuses, expiry], ...rest }): V1Data => ({
      registry: contracts.registry,
      ...rest,
      wrapper: { owner, fuses, expiry },
    })),
  );
};

const readV2 = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  at: Read.BlockOptions,
) {
  const contracts = client.deployment.v2?.contracts;
  if (contracts === undefined) return undefined;

  // At blocks before ENSv2 was deployed its contracts have no code: the name has no ENSv2 data.
  const found = yield* Effect.all(
    {
      registry: Rpc.readContract(client, {
        address: contracts.universalHelper,
        abi: Abis.v2.universalHelper,
        functionName: "findParentRegistry",
        args: [parts.dns],
        ...at,
      }),
      gracePeriod: parts.isEth2ld
        ? Rpc.readContract(client, {
            address: contracts.ethRegistrar,
            abi: Abis.v2.ethRegistrar,
            functionName: "GRACE_PERIOD",
            ...at,
          })
        : Effect.undefined,
    },
    { concurrency: "unbounded" },
  ).pipe(
    Effect.catchIf(
      (error: AnyError) => error._tag === "ConfigError" && error.code === "CONTRACT_NOT_DEPLOYED",
      () => Effect.undefined,
    ),
  );
  if (found === undefined || nonZeroAddress(found.registry) === null) return undefined;
  const { registry, gracePeriod } = found;

  const parent = { address: registry, abi: Abis.v2.permissionedRegistry, ...at } as const;
  const labelReads = parts.encodedLabel
    ? { resolver: Effect.undefined, subregistry: Effect.undefined }
    : {
        resolver: Rpc.readContract(client, {
          ...parent,
          functionName: "getResolver",
          args: [parts.label],
        }),
        subregistry: Rpc.readContract(client, {
          ...parent,
          functionName: "getSubregistry",
          args: [parts.label],
        }),
      };
  const reads = yield* Effect.all(
    {
      state: Rpc.readContract(client, {
        ...parent,
        functionName: "getState",
        args: [hexToBigInt(parts.labelhash)],
      }),
      ...labelReads,
    },
    { concurrency: "unbounded" },
  );

  return { registry, gracePeriod, ...reads } satisfies V2Data;
});

/**
 * Whether ENSv2 resolution of `parts` ends at a resolver that serves ENSv1 names: the ENSv1
 * bridge, or a DNS TLD resolver (which reads ENSv1 first). `undefined` without ENSv2 at the block.
 *
 * Reads `findResolver` on the ENSv2 Universal Resolver implementation, not the public proxy: before
 * the launch the proxy may still forward to ENSv1's. A revert (a name ENSv2 cannot walk) counts
 * as reaching nothing.
 */
const readReachesV1 = (
  client: Client,
  parts: NameParts,
  at: Read.BlockOptions,
): Effect.Effect<boolean | undefined, AnyError> => {
  const v2 = client.deployment.v2;
  if (v2 === undefined) return Effect.undefined;

  const serving = [v2.migration.ensV1Resolver, v2.dns?.tldResolver, v2.dns?.legacyTldResolver];
  return Rpc.readContractOrUndefined(client, {
    address: v2.implementations.universalResolver,
    abi: Abis.v2.universalResolver,
    functionName: "findResolver",
    args: [parts.dns],
    ...at,
  }).pipe(
    Effect.map((found) => {
      const resolver = nonZeroAddress(found?.[0]);
      return resolver !== null && serving.some((address) => sameAddress(address, resolver));
    }),
    Effect.catchIf(
      (error: AnyError) => error._tag === "ConfigError" && error.code === "CONTRACT_NOT_DEPLOYED",
      () => Effect.undefined,
    ),
  );
};

/**
 * Reads a name's ENSv1 and ENSv2 records. Every read of a round runs concurrently, so the batch
 * resolver sends each round as one multicall.
 */
export const readName = (
  client: Client,
  parts: NameParts,
  block: Read.BlockOptions,
): Effect.Effect<NameData, AnyError> => {
  const at = blockAt(block);

  return Effect.all(
    {
      now: Rpc.blockTimestamp(client, at),
      v1: readV1(client, parts, at),
      v2: readV2(client, parts, at),
      reachesV1: readReachesV1(client, parts, at),
    },
    { concurrency: "unbounded" },
  ).pipe(Effect.map(({ now, v1, v2, reachesV1 }) => ({ parts, now, v1, v2, reachesV1 })));
};
