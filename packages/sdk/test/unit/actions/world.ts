import { Abis, Deployments, InterfaceIds } from "@ensforge/contracts";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript, type ContractStub } from "@ensforge/test-harness/contracts-eth-call";
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  hexToBigInt,
  multicall3Abi,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { labelhash, namehash, packetToBytes } from "viem/ens";
import { bytesToHex, hexToBytes } from "viem/utils";

import * as Ensforge from "#/client/Ensforge";
import type { Plan } from "#/plan/Plan";

// A mainnet "chain" answered from scripted contract state, so write planners can be exercised
// route by route without a node. Names absent from the world are unregistered everywhere.

export const deployment = Deployments.mainnet;
export const v1 = deployment.v1.contracts;
export const v2 = deployment.v2.contracts;

export const signer: Address = "0x00000000000000000000000000000000000a11ce";
export const other: Address = "0x0000000000000000000000000000000000000b0b";
export const resolverA: Address = "0x00000000000000000000000000000000000000a1";
/** The ENSv2 registry every top-level ENSv2 name lives in. */
export const v2Registry: Address = "0x00000000000000000000000000000000000000e7";

export const now = 1_800_000_000n;
export const year = 31_536_000n;
const gracePeriod = 7_776_000n;

export type V1Name = {
  readonly owner: Address;
  readonly resolver?: Address | undefined;
  /** Wrapped names: the registry owner becomes the NameWrapper. */
  readonly wrapper?: { readonly owner: Address; readonly fuses: number; readonly expiry: bigint };
  /** `.eth` 2LDs: the registrar token holder (default `owner`) and expiry. */
  readonly registrant?: Address | undefined;
  readonly expiry?: bigint | undefined;
};

export type V2Name = {
  readonly owner: Address;
  readonly resolver?: Address | undefined;
  readonly subregistry?: Address | undefined;
  /** `IPermissionedRegistry.Status`: 0 available, 1 reserved, 2 registered (default). */
  readonly status?: 0 | 1 | 2 | undefined;
  readonly expiry?: bigint | undefined;
  readonly tokenId?: bigint | undefined;
  /** The owner's token roles. */
  readonly roles?: bigint | undefined;
  /** Whether the owner alone holds the unemancipated roles (default true). */
  readonly onlyAssignee?: boolean | undefined;
};

export type Entry = { readonly v1?: V1Name | undefined; readonly v2?: V2Name | undefined };

export type World = Entry & {
  /** The name under test; `v1`/`v2` describe it. */
  readonly name: string;
  /** Further names, e.g. a subname's parent. */
  readonly names?: Readonly<Record<string, Entry>> | undefined;
  /** Resolvers that report the ENSv2 PermissionedResolver interface. */
  readonly permissioned?: readonly Address[] | undefined;
  /** `isApprovedForAll` on the ENSv1 registry. */
  readonly approvedForAll?: boolean | undefined;
  /** What the Universal Resolver's `findResolver` returns; `offset > 0` is a parent's resolver. */
  readonly found?: { readonly resolver: Address; readonly offset: bigint } | undefined;
  /** Resolvers that report ENSIP-10 `resolve` (extended resolvers). */
  readonly extended?: readonly Address[] | undefined;
  /** A deployment without ENSv2, as before its launch. */
  readonly v1Only?: boolean | undefined;
};

export const dnsEncode = (name: string): Hex => bytesToHex(packetToBytes(name));

const dnsDecode = (dns: Hex): string => {
  const bytes = hexToBytes(dns);
  const labels: string[] = [];
  for (let offset = 0; bytes[offset] !== 0; offset += (bytes[offset] ?? 0) + 1) {
    labels.push(
      new TextDecoder().decode(bytes.slice(offset + 1, offset + 1 + (bytes[offset] ?? 0))),
    );
  }
  return labels.join(".");
};

const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();

const is2ld = (name: string) => name.split(".").length === 2 && name.endsWith(".eth");

const labelId = (name: string) => BigInt(labelhash(name.split(".")[0] ?? ""));

const registryOwner = (name: V1Name | undefined) =>
  name === undefined ? zeroAddress : name.wrapper !== undefined ? v1.nameWrapper : name.owner;

/** A plan's calls as `[to, functionName, args]`, decoded with `abi` (ABIs may be concatenated). */
export const decodeCalls = (calls: readonly Plan.Call[], abi: Abi) =>
  calls.map(({ to, data }) => {
    const { functionName, args } = decodeFunctionData({ abi, data });
    return [getAddress(to), functionName, args ?? []] as const;
  });

const stubs = (world: World): ContractStub[] => {
  const entries = new Map<string, Entry>([
    ...Object.entries(world.names ?? {}),
    [world.name, { v1: world.v1, v2: world.v2 }],
  ]);
  const names = [...entries.keys()];
  const byNode = (node: unknown) => names.find((name) => same(namehash(name), node));
  const byToken = (id: unknown) => names.find((name) => is2ld(name) && labelId(name) === id);
  const v1Of = (name: string | undefined) =>
    name === undefined ? undefined : entries.get(name)?.v1;

  // ENSv2: a name lives in its parent's subregistry, or in `v2Registry` when it is a TLD child.
  const parentRegistry = (name: string): Address | undefined => {
    const parent = name.slice(name.indexOf(".") + 1);
    if (!parent.includes(".")) return v2Registry;
    return entries.get(parent)?.v2?.subregistry;
  };
  const inRegistry = (registry: Address, id: bigint, protocol: "v1" | "v2" = "v2") =>
    names.find(
      (name) =>
        entries.get(name)?.[protocol] !== undefined &&
        same(parentRegistry(name), registry) &&
        labelId(name) === id,
    );
  const registryStub = (registry: Address): ContractStub => {
    const v2Of = (id: bigint) => {
      const name = inRegistry(registry, id);
      const state = name === undefined ? undefined : entries.get(name)?.v2;
      return state === undefined ? undefined : { name, v2: state };
    };
    return {
      address: registry,
      abi: Abis.v2.userRegistry as Abi,
      functions: {
        getState: ([id]) => {
          const found = v2Of(id as bigint);
          // ENSv2 reserves the labels of ENSv1 names that have not migrated.
          const legacy = inRegistry(registry, id as bigint, "v1") !== undefined;
          return {
            status: found === undefined ? (legacy ? 1 : 0) : (found.v2.status ?? 2),
            expiry: found === undefined ? 0n : (found.v2.expiry ?? now + year),
            latestOwner: found?.v2.owner ?? zeroAddress,
            tokenId: found?.v2.tokenId ?? (id as bigint),
            resource: 1n,
          };
        },
        getResolver: ([label]) =>
          v2Of(BigInt(labelhash(label as string)))?.v2.resolver ?? zeroAddress,
        getSubregistry: ([label]) =>
          v2Of(BigInt(labelhash(label as string)))?.v2.subregistry ?? zeroAddress,
        roles: ([, account]) =>
          names
            .map((name) => entries.get(name)?.v2)
            .find((state) => state !== undefined && same(state.owner, account))?.roles ?? 0n,
        isOnlyAssignee: ([id]) => v2Of(id as bigint)?.v2.onlyAssignee ?? true,
        isApprovedForAll: () => false,
      },
    };
  };
  const registries = [
    v2Registry,
    ...names.flatMap((name) => entries.get(name)?.v2?.subregistry ?? []),
  ];
  const resolvers = [
    resolverA,
    ...(world.permissioned ?? []),
    ...(world.extended ?? []),
    ...(world.found === undefined ? [] : [world.found.resolver]),
    ...names.flatMap((name) => [entries.get(name)?.v1?.resolver, entries.get(name)?.v2?.resolver]),
  ].filter((address): address is Address => address !== undefined && address !== zeroAddress);

  return [
    {
      address: mainnet.contracts.multicall3.address,
      abi: multicall3Abi,
      functions: { getCurrentBlockTimestamp: () => now },
    },
    {
      address: v1.registry,
      abi: Abis.v1.ensRegistry,
      functions: {
        owner: ([node]) => registryOwner(v1Of(byNode(node))),
        resolver: ([node]) => v1Of(byNode(node))?.resolver ?? zeroAddress,
        ttl: () => 0n,
        isApprovedForAll: () => world.approvedForAll ?? false,
      },
    },
    {
      address: v1.nameWrapper,
      abi: Abis.v1.nameWrapper,
      functions: {
        getData: ([id]) => {
          const wrapper = v1Of(names.find((name) => hexToBigInt(namehash(name)) === id))?.wrapper;
          return wrapper === undefined
            ? [zeroAddress, 0, 0n]
            : [wrapper.owner, wrapper.fuses, wrapper.expiry];
        },
      },
    },
    {
      address: v1.baseRegistrar,
      abi: Abis.v1.baseRegistrar,
      functions: {
        ownerOf: ([id]) => {
          const name = v1Of(byToken(id));
          return name?.registrant ?? registryOwner(name);
        },
        nameExpires: ([id]) => {
          const name = v1Of(byToken(id));
          return name === undefined ? 0n : (name.expiry ?? now + year);
        },
        GRACE_PERIOD: () => gracePeriod,
      },
    },
    {
      address: v2.universalHelper,
      abi: Abis.v2.universalHelper,
      functions: {
        findParentRegistry: ([dns]) => parentRegistry(dnsDecode(dns as Hex)) ?? zeroAddress,
        findNearestOwner: () => [zeroAddress, 0n],
      },
    },
    {
      address: v1.reverseRegistrar,
      abi: Abis.v1.reverseRegistrar,
      functions: { defaultResolver: () => resolverA },
    },
    {
      address: v2.ethRegistrar,
      abi: Abis.v2.ethRegistrar,
      functions: { GRACE_PERIOD: () => gracePeriod },
    },
    ...registries.map(registryStub),
    {
      address: deployment.v2.migration.publicResolverSet,
      abi: Abis.v2.permissionedAddressSet as Abi,
      functions: { includes: () => false },
    },
    {
      address: v2.universalResolver,
      abi: Abis.v2.universalResolver as Abi,
      functions: {
        findResolver: ([dns]) => [
          world.found?.resolver ?? zeroAddress,
          namehash(dnsDecode(dns as Hex)),
          world.found?.offset ?? 0n,
        ],
      },
    },
    ...[...new Set(resolvers)].map((address): ContractStub => ({
      address,
      abi: [...Abis.shared.erc165, ...Abis.shared.versionableResolver] as Abi,
      functions: {
        supportsInterface: ([id]) =>
          (world.permissioned ?? []).some((p) => same(p, address)) ||
          (id === InterfaceIds.resolverProfiles.extended &&
            (world.extended ?? []).some((e) => same(e, address))),
        recordVersions: () => 0n,
      },
    })),
  ];
};

/** An ensforge client on mainnet whose reads see `world`; `calls` records every request. */
export const clientFor = (world: World) => {
  const { transport, calls } = scriptedTransport(contractScript({ contracts: stubs(world) }));
  const ens = Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    account: signer,
    ...(world.v1Only === true
      ? { deployment: { name: deployment.name, chainId: deployment.chainId, v1: deployment.v1 } }
      : {}),
    // One eth_call per read keeps the script simple; batching is not under test here.
    batch: { multicall: false },
  });
  return { ens, calls };
};
