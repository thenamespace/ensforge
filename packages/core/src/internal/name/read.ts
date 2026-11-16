import { Effect } from "effect";

import { hexToBigInt, isAddressEqual, zeroAddress, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { baseRegistrarAbi, ensRegistryAbi, nameWrapperAbi } from "../abis/v1.js";
import { ethRegistrarAbi, permissionedRegistryAbi, universalHelperAbi } from "../abis/v2.js";
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
};

const readV1 = (client: Client, parts: NameParts, block: Read.BlockOptions) => {
  const contracts = client.deployment.v1?.contracts;
  if (contracts === undefined) return Effect.succeed(undefined);

  const at =
    block.blockNumber === undefined
      ? { blockTag: block.blockTag }
      : { blockNumber: block.blockNumber };
  const tokenId = hexToBigInt(parts.labelhash);
  const registry = { address: contracts.registry, abi: ensRegistryAbi, ...at } as const;
  const registrar = { address: contracts.baseRegistrar, abi: baseRegistrarAbi, ...at } as const;

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
        abi: nameWrapperAbi,
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
        : Effect.succeed(undefined),
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
  block: Read.BlockOptions,
) {
  const contracts = client.deployment.v2?.contracts;
  if (contracts === undefined) return undefined;

  const at =
    block.blockNumber === undefined
      ? { blockTag: block.blockTag }
      : { blockNumber: block.blockNumber };
  const { registry, gracePeriod } = yield* Effect.all(
    {
      registry: Rpc.readContract(client, {
        address: contracts.universalHelper,
        abi: universalHelperAbi,
        functionName: "findParentRegistry",
        args: [parts.dns],
        ...at,
      }),
      gracePeriod: parts.isEth2ld
        ? Rpc.readContract(client, {
            address: contracts.ethRegistrar,
            abi: ethRegistrarAbi,
            functionName: "GRACE_PERIOD",
            ...at,
          })
        : Effect.succeed(undefined),
    },
    { concurrency: "unbounded" },
  );
  if (isAddressEqual(registry, zeroAddress)) return undefined;

  const parent = { address: registry, abi: permissionedRegistryAbi, ...at } as const;
  const labelReads = parts.encodedLabel
    ? { resolver: Effect.succeed(undefined), subregistry: Effect.succeed(undefined) }
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
 * Reads a name's ENSv1 and ENSv2 records. Every read of a round runs concurrently, so the batch
 * resolver sends each round as one multicall.
 */
export const readName = (
  client: Client,
  parts: NameParts,
  block: Read.BlockOptions,
): Effect.Effect<NameData, AnyError> =>
  Effect.all(
    {
      now: Rpc.blockTimestamp(client, block),
      v1: readV1(client, parts, block),
      v2: readV2(client, parts, block),
    },
    { concurrency: "unbounded" },
  ).pipe(Effect.map(({ now, v1, v2 }) => ({ parts, now, v1, v2 })));
