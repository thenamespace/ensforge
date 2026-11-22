import { Array as Arr, Option, Record as Rec, String as Str } from "effect";

import { Abis, Deployments, InterfaceIds } from "@ensforge/contracts";
import { standaloneHcaFactoryV2InterfaceAbi } from "@ensforge/contracts/v2/experimental/hca";
import { Duration, Name } from "@ensforge/sdk/effect";
import type { Indexer } from "@ensforge/sdk/indexer";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import type { Plan } from "@ensforge/sdk/internal/plan/Plan";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript, type ContractStub } from "@ensforge/test-harness/contracts-eth-call";
import {
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  multicall3Abi,
  parseAbi,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { namehash } from "viem/ens";

/* oxlint-disable typescript/no-unsafe-type-assertion -- stub arguments arrive as `unknown[]`, decoded against the stubbed ABI */

// A mainnet "chain" answered from scripted contract state, so write planners can be exercised
// route by route without a node. Names absent from the world are unregistered everywhere.
// Addresses are checksummed, as the SDK and viem return them.

/** The account the client signs with. */
export const signer = getAddress("0x00000000000000000000000000000000000a11ce");
export const other = getAddress("0x0000000000000000000000000000000000000b0b");
/** A resolver every world deploys; it supports no interface unless the world says so. */
export const resolverA = getAddress("0x00000000000000000000000000000000000000a1");
/** The ENSv2 registry every top-level ENSv2 name lives in. */
export const v2Registry = getAddress("0x00000000000000000000000000000000000000e7");
/** The StandaloneHCAFactory the reverse adapters trust. */
export const hcaFactory = getAddress("0x00000000000000000000000000000000000000fa");
/** The chain's current time, in seconds. */
export const now = 1_800_000_000n;

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
  /**
   * How extended resolvers answer `resolve(name, addr(node))`: `"offchain"` reverts with an
   * `OffchainLookup`, an address is an on-chain answer; others answer nothing (`0x`).
   */
  readonly served?: Readonly<Record<Address, "offchain" | Address>> | undefined;
  /** ENSv2 resolution no longer reaches ENSv1 names (its bridge resolver is gone). */
  readonly unreachableFromV2?: boolean | undefined;
  /** A deployment without ENSv2, as before its launch. */
  readonly v1Only?: boolean | undefined;
  /** Further contracts, e.g. an L2 namespace's Ethereum resolver. */
  readonly stubs?: readonly ContractStub[] | undefined;
  /** Role assignee counts by registry resource (`"0"` the root, `"1"` a name), a nybble per role. */
  readonly assignees?: Readonly<Record<string, bigint>> | undefined;
  /** The client's indexer. */
  readonly indexer?: Indexer | undefined;
  /** What resolvers answer for `name(node)`, by node (reverse records). */
  readonly nameRecords?: Readonly<Record<Hex, string>> | undefined;
  /** The HCA each account owns, which the HCA factory reports as authorized for it. */
  readonly hcas?: Readonly<Record<Address, Address>> | undefined;
  /** Contract accounts, by address: their Ownable `owner()` and the accounts `isContractNamer` approves. */
  readonly contracts?:
    | Readonly<Record<Address, { readonly owner: Address; readonly namers: readonly Address[] }>>
    | undefined;
};

/** A plan's calls as `[to, functionName, args]`, decoded with `abi` (ABIs may be concatenated). */
export const decodeCalls = (calls: readonly Plan.Call[], abi: Abi) =>
  Arr.map(calls, ({ to, data }) => {
    const { functionName, args } = decodeFunctionData({ abi, data });
    return [getAddress(to), functionName, args ?? []] as const;
  });

const v1 = Deployments.mainnet.v1.contracts;
const v2 = Deployments.mainnet.v2.contracts;
const gracePeriod = 7_776_000n;
const defaultExpiry = now + Duration.years(1);

const includes = (addresses: readonly Address[] | undefined, address: Address) =>
  Arr.some(addresses ?? [], (listed) => isAddressEqual(listed, address));

/** Every resolver the world deploys: they have code and answer as resolvers. */
const resolversOf = (world: World): Address[] =>
  Arr.filter(
    [
      resolverA,
      ...(world.permissioned ?? []),
      ...(world.extended ?? []),
      ...(world.found === undefined ? [] : [world.found.resolver]),
      ...Arr.flatMap(
        [{ v1: world.v1, v2: world.v2 }, ...Rec.values(world.names ?? {})],
        (entry) => [entry.v1?.resolver, entry.v2?.resolver],
      ),
    ],
    (address): address is Address => address !== undefined && address !== zeroAddress,
  );

const stubs = (world: World): ContractStub[] => {
  const entries = new Map<string, Entry>([
    ...Rec.toEntries(world.names ?? {}),
    [world.name, { v1: world.v1, v2: world.v2 }],
  ]);
  const names = [...entries.keys()];
  const byNode = (node: unknown) =>
    Option.getOrUndefined(Arr.findFirst(names, (name) => namehash(name) === node));
  const v1Of = (name: string | undefined) =>
    name === undefined ? undefined : entries.get(name)?.v1;
  const registryOwner = (state: V1Name | undefined) =>
    state === undefined ? zeroAddress : state.wrapper !== undefined ? v1.nameWrapper : state.owner;
  const byToken = (id: unknown) =>
    Option.getOrUndefined(
      Arr.findFirst(names, (name) => {
        const { is2ld, tld } = Name.parse(name);
        return is2ld && tld === "eth" && Name.toTokenId(name) === id;
      }),
    );

  // ENSv2: a name lives in its parent's subregistry, or in `v2Registry` when it is a TLD child.
  const parentRegistry = (name: string): Address | undefined => {
    const { parent } = Name.parse(name);
    if (parent === null || !Str.includes(".")(parent)) return v2Registry;
    return entries.get(parent)?.v2?.subregistry;
  };
  const inRegistry = (registry: Address, id: bigint, protocol: "v1" | "v2" = "v2") =>
    Option.getOrUndefined(
      Arr.findFirst(names, (name) => {
        const parent = parentRegistry(name);
        return (
          entries.get(name)?.[protocol] !== undefined &&
          parent !== undefined &&
          isAddressEqual(parent, registry) &&
          Name.toTokenId(name) === id
        );
      }),
    );
  const registryStub = (registry: Address): ContractStub => {
    const v2Of = (id: bigint) => {
      const name = inRegistry(registry, id);
      const state = name === undefined ? undefined : entries.get(name)?.v2;
      return state === undefined ? undefined : { name, v2: state };
    };

    return {
      address: registry,
      abi: Abis.v2.userRegistry,
      functions: {
        supportsInterface: ([id]) => id === InterfaceIds.registry.permissionedRegistry,
        getState: ([id]) => {
          const found = v2Of(id as bigint);
          // ENSv2 reserves the labels of ENSv1 names that have not migrated.
          const legacy = inRegistry(registry, id as bigint, "v1") !== undefined;
          return {
            status: found === undefined ? (legacy ? 1 : 0) : (found.v2.status ?? 2),
            expiry: found === undefined ? 0n : (found.v2.expiry ?? defaultExpiry),
            latestOwner: found?.v2.owner ?? zeroAddress,
            tokenId: found?.v2.tokenId ?? (id as bigint),
            resource: 1n,
          };
        },
        getResolver: ([label]) => v2Of(Name.toTokenId(label as string))?.v2.resolver ?? zeroAddress,
        getSubregistry: ([label]) =>
          v2Of(Name.toTokenId(label as string))?.v2.subregistry ?? zeroAddress,
        roles: ([, account]) =>
          Option.getOrUndefined(
            Arr.findFirst(
              Arr.map(names, (name) => entries.get(name)?.v2),
              (state) => state !== undefined && isAddressEqual(state.owner, account as Address),
            ),
          )?.roles ?? 0n,
        isOnlyAssignee: ([id]) => v2Of(id as bigint)?.v2.onlyAssignee ?? true,
        // Every name's roles live under resource 1 here (see `getState`), the root under 0.
        getAssigneeCount: ([resource, bitmap]) => [
          (world.assignees?.[String(resource)] ?? 0n) & ((bitmap as bigint) * 0xfn),
          0n,
        ],
        isEmancipated: () => true,
        isApprovedForAll: () => false,
      },
    };
  };

  const registries = [
    v2Registry,
    ...Arr.flatMap(names, (name) =>
      Option.toArray(Option.fromNullishOr(entries.get(name)?.v2?.subregistry)),
    ),
  ];
  const deployedResolvers = resolversOf(world);

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
        isApprovedForAll: () => world.approvedForAll ?? false,
        getApproved: () => zeroAddress,
        getData: ([id]) => {
          const wrapper = v1Of(
            Option.getOrUndefined(
              Arr.findFirst(names, (name) => hexToBigInt(namehash(name)) === id),
            ),
          )?.wrapper;
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
        isApprovedForAll: () => false,
        getApproved: () => zeroAddress,
        ownerOf: ([id]) => {
          const state = v1Of(byToken(id));
          return state?.registrant ?? registryOwner(state);
        },
        nameExpires: ([id]) => {
          const state = v1Of(byToken(id));
          return state === undefined ? 0n : (state.expiry ?? defaultExpiry);
        },
        GRACE_PERIOD: () => gracePeriod,
      },
    },
    {
      address: v2.universalHelper,
      abi: Abis.v2.universalHelper,
      functions: {
        findParentRegistry: ([dns]) => parentRegistry(Name.dnsDecode(dns as Hex)) ?? zeroAddress,
      },
    },
    {
      address: v1.reverseRegistrar,
      abi: Abis.v1.reverseRegistrar,
      functions: { defaultResolver: () => resolverA, controllers: () => false },
    },
    {
      address: v2.ethRegistrar,
      abi: Abis.v2.ethRegistrar,
      functions: { GRACE_PERIOD: () => gracePeriod },
    },
    {
      address: v2.verifiableFactory,
      abi: Abis.v2.verifiableFactory,
      functions: { proxyLogic: () => resolverA },
    },
    {
      address: v2.defaultReverseRegistrarAdapter,
      abi: Abis.v2.defaultReverseRegistrarAdapter,
      functions: { STANDALONE_HCA_FACTORY: () => hcaFactory },
    },
    {
      address: hcaFactory,
      abi: standaloneHcaFactoryV2InterfaceAbi,
      functions: {
        authorizedOwnerOf: ([hca]) =>
          Option.getOrElse(
            Option.map(
              Arr.findFirst(Rec.toEntries(world.hcas ?? {}), ([, owned]) =>
                isAddressEqual(owned, hca as Address),
              ),
              ([owner]) => owner,
            ),
            () => zeroAddress,
          ),
      },
    },
    ...Arr.map(registries, (registry) => registryStub(registry)),
    {
      address: Deployments.mainnet.v2.migration.publicResolverSet,
      abi: Abis.v2.permissionedAddressSet,
      functions: { includes: () => false },
    },
    {
      address: v2.universalResolver,
      abi: Abis.v2.universalResolver,
      functions: {
        findResolver: ([dns]) => [
          world.found?.resolver ?? zeroAddress,
          namehash(Name.dnsDecode(dns as Hex)),
          world.found?.offset ?? 0n,
        ],
      },
    },
    // ENSv2 reserves every ENSv1 name, so its own resolution reaches them through the bridge.
    {
      address: Deployments.mainnet.v2.implementations.universalResolver,
      abi: Abis.v2.universalResolver,
      functions: {
        findResolver: ([dns]) => [
          world.unreachableFromV2 === true
            ? zeroAddress
            : Deployments.mainnet.v2.migration.ensV1Resolver,
          namehash(Name.dnsDecode(dns as Hex)),
          0n,
        ],
      },
    },
    ...Arr.map(
      Rec.toEntries(world.contracts ?? {}),
      ([address, { owner, namers }]): ContractStub => ({
        address,
        abi: Abis.v2.contractNamer,
        functions: {
          owner: () => owner,
          isContractNamer: ([namer]) => includes(namers, namer as Address),
        },
      }),
    ),
    ...(world.stubs ?? []),
    ...Arr.map([...new Set(deployedResolvers)], (address): ContractStub => ({
      address,
      abi: [
        ...Abis.shared.erc165,
        ...Abis.shared.versionableResolver,
        ...Abis.shared.extendedResolver,
        ...parseAbi(["function name(bytes32 node) view returns (string)"]),
      ],
      functions: {
        supportsInterface: ([id]) =>
          (id === InterfaceIds.resolver.permissionedResolver &&
            includes(world.permissioned, address)) ||
          (id === InterfaceIds.resolverProfiles.extended && includes(world.extended, address)),
        recordVersions: () => 0n,
        name: ([node]) => world.nameRecords?.[node as Hex] ?? "",
        resolve: () => {
          const answer = world.served?.[address];
          if (answer === "offchain") {
            throw Object.assign(new Error("execution reverted"), {
              code: 3,
              data: encodeErrorResult({
                abi: Abis.shared.errors,
                errorName: "OffchainLookup",
                args: [address, ["https://gateway.test/{sender}/{data}"], "0x", "0x12345678", "0x"],
              }),
            });
          }
          return answer === undefined
            ? "0x"
            : encodeFunctionResult({
                abi: Abis.shared.addrResolver,
                functionName: "addr",
                result: answer,
              });
        },
      },
    })),
  ];
};

/** An ensforge client on mainnet, signing as `signer`, whose reads see `world`; `calls` records every request. */
export const clientFor = (world: World) => {
  const { transport, calls } = scriptedTransport(
    contractScript({
      contracts: stubs(world),
      // Registries and resolvers are contracts too: role targets and resolvers are checked for code.
      code: [...Rec.keys(world.contracts ?? {}), v2Registry, ...resolversOf(world)],
    }),
  );
  const { name, chainId, v1: deploymentV1 } = Deployments.mainnet;
  const ens = Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport },
    publicRpc: false,
    account: signer,
    ...(world.indexer === undefined ? {} : { indexer: world.indexer }),
    ...(world.v1Only === true ? { deployment: { name, chainId, v1: deploymentV1 } } : {}),
    // One eth_call per read keeps the script simple; batching is not under test here.
    batch: { multicall: false },
  });
  return { ens, calls };
};
