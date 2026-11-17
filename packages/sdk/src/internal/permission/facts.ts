import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { permissionedResolverResource } from "@ensforge/contracts/v2";
import { hexToBigInt, isAddressEqual, type Address } from "viem";

import type { RecordOperation } from "../../actions/permission/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { nonZeroAddress } from "../address.js";
import type { LoadedName } from "../name/load.js";
import { setterKeying } from "../records/setter-keying.js";
import * as Rpc from "../rpc/index.js";

/** What the permission engine knows about one account and one name. */
export type PermissionFacts = {
  readonly loaded: LoadedName;
  readonly account: Address;
  readonly v1: {
    readonly registryOperator: boolean;
    readonly registrarOperator: boolean;
    readonly registrarApproved: Address | null;
    readonly wrapperOperator: boolean;
    readonly wrapperApproved: Address | null;
  };
  readonly v2: {
    /** Token and root roles of the account on the registry holding the name. */
    readonly roles: bigint;
    /** Token roles of the owner (`canTransferAdmin` decides transfers). */
    readonly ownerRoles: bigint;
    /** No one but the owner holds the name's unemancipated roles, so a safe transfer may go. */
    readonly ownerOnlyAssignee: boolean;
    readonly operator: boolean;
    /** Root roles of the account on the name's subregistry. */
    readonly subregistryRoles: bigint | null;
  };
  readonly resolver:
    | {
        readonly address: Address;
        readonly kind: "permissioned" | "node";
        /** Root roles, and roles per record resource, of the account (PermissionedResolver). */
        readonly rootRoles: bigint;
        readonly resourceRoles: ReadonlyMap<bigint, bigint>;
        /** Owner the resolver authorizes against, and the account's approvals (node-based). */
        readonly owner: Address | null;
        readonly operator: boolean | undefined;
        readonly delegate: boolean | undefined;
        /** PublicResolverV2 only serves names the NameWrapper knows. */
        readonly nameKnown: boolean;
        /** Bound to the registry ENS replaced in 2020: its records can no longer change. */
        readonly frozen: boolean;
      }
    | undefined;
};

/** The PermissionedResolver resource a record operation checks; `0n` (root) without a key. */
export const recordResource = (operation: RecordOperation): bigint => {
  const { setRecord: kind, key } = operation;
  if (key === undefined) return 0n;
  switch (kind) {
    case "text":
      return permissionedResolverResource({ text: String(key) });
    case "data":
      return permissionedResolverResource({ data: String(key) });
    case "address":
      return permissionedResolverResource({
        address: typeof key === "bigint" ? key : CoinType.from(key),
      });
    case "abi":
      return permissionedResolverResource({ abi: BigInt(key) });
    case "interface":
      return permissionedResolverResource({ interface: key as `0x${string}` });
    case "contentHash":
    case "name":
    case "pubkey":
    case "link":
      return 0n;
  }
};

const isV2PublicResolver = (client: Client, resolver: Address | null): boolean => {
  const v2 = client.deployment.v2;
  return (
    resolver !== null && v2 !== undefined && isAddressEqual(resolver, v2.contracts.publicResolver)
  );
};

/**
 * The owner a node-based resolver (PublicResolver, PublicResolverV2) authorizes against for the
 * name's own resolver: PublicResolverV2 follows ENSv2 ownership, ENSv1 resolvers the ENS registry
 * owner, through the NameWrapper for wrapped names.
 */
export const resolverOwnerOf = (client: Client, { state, data }: LoadedName): Address | null => {
  const nameWrapper = client.deployment.v1?.contracts.nameWrapper;
  const registryOwner = nonZeroAddress(data.v1?.registryOwner);
  if (isV2PublicResolver(client, state.resolver)) return state.owner;
  return registryOwner !== null &&
    nameWrapper !== undefined &&
    isAddressEqual(registryOwner, nameWrapper)
    ? nonZeroAddress(data.v1?.wrapper.owner)
    : registryOwner;
};

/**
 * Reads the facts for `account` and a loaded name in one batched round: ENSv1 approvals, ENSv2
 * roles and operator, subregistry roles, and the resolver's approvals or roles for `records`.
 */
export const readPermissionFacts = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  account: Address,
  records: readonly RecordOperation[],
): Effect.fn.Return<PermissionFacts, AnyError> {
  const { state, data } = loaded;
  const v1 = client.deployment.v1?.contracts;
  const labelId = hexToBigInt(data.parts.labelhash);
  const nodeId = hexToBigInt(data.parts.node);
  const read = Rpc.readContractOrUndefined;
  const none = Effect.undefined;

  const registryOwner = nonZeroAddress(data.v1?.registryOwner);
  const wrapperOwner = nonZeroAddress(data.v1?.wrapper.owner);
  const registrant = state.registrant;
  const v2Registry = state.protocol === "v2" ? state.registry : null;
  const resolver = state.resolver;

  const v2PublicResolver = isV2PublicResolver(client, resolver);
  const resolverOwner = resolverOwnerOf(client, loaded);
  // Coin keys are parsed here, so an unknown coin fails as InvalidInputError, not a defect.
  const resources = yield* Effect.try({
    try: () => [...new Set(records.map(recordResource))].filter((resource) => resource !== 0n),
    catch: (error) => error as AnyError,
  });
  // Frozen resolvers cannot be written, and the oldest burn all gas on unknown calls, which would
  // sink the whole multicall: they are never probed.
  const frozen =
    resolver !== null &&
    (client.deployment.v1?.frozenPublicResolvers ?? []).some((address) =>
      isAddressEqual(address, resolver),
    );
  const probeResolver = resolver !== null && records.length > 0 && !frozen;

  const facts = yield* Effect.all(
    {
      registryOperator:
        v1 === undefined || registryOwner === null
          ? none
          : read(client, {
              address: v1.registry,
              abi: Abis.v1.ensRegistry,
              functionName: "isApprovedForAll",
              args: [registryOwner, account],
            }),
      registrarOperator:
        v1 === undefined || registrant === null
          ? none
          : read(client, {
              address: v1.baseRegistrar,
              abi: Abis.v1.baseRegistrar,
              functionName: "isApprovedForAll",
              args: [registrant, account],
            }),
      registrarApproved:
        v1 === undefined || registrant === null
          ? none
          : read(client, {
              address: v1.baseRegistrar,
              abi: Abis.v1.baseRegistrar,
              functionName: "getApproved",
              args: [labelId],
            }),
      wrapperOperator:
        v1 === undefined || wrapperOwner === null
          ? none
          : read(client, {
              address: v1.nameWrapper,
              abi: Abis.v1.nameWrapper,
              functionName: "isApprovedForAll",
              args: [wrapperOwner, account],
            }),
      wrapperApproved:
        v1 === undefined || wrapperOwner === null
          ? none
          : read(client, {
              address: v1.nameWrapper,
              abi: Abis.v1.nameWrapper,
              functionName: "getApproved",
              args: [nodeId],
            }),
      tokenRoles:
        v2Registry === null || state.resource === null
          ? none
          : read(client, {
              address: v2Registry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "roles",
              args: [state.resource, account],
            }),
      rootRoles:
        v2Registry === null
          ? none
          : read(client, {
              address: v2Registry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "roles",
              args: [0n, account],
            }),
      ownerRoles:
        v2Registry === null || state.resource === null || state.owner === null
          ? none
          : read(client, {
              address: v2Registry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "roles",
              args: [state.resource, state.owner],
            }),
      ownerOnlyAssignee:
        v2Registry === null || state.tokenId === null || state.owner === null
          ? none
          : read(client, {
              address: v2Registry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "isOnlyAssignee",
              args: [state.tokenId, Roles.registryBitmaps.unemancipated, state.owner],
            }),
      v2Operator:
        v2Registry === null || state.owner === null
          ? none
          : read(client, {
              address: v2Registry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "isApprovedForAll",
              args: [state.owner, account],
            }),
      subregistryRoles:
        state.subregistry === null
          ? none
          : read(client, {
              address: state.subregistry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "roles",
              args: [0n, account],
            }),
      keying:
        resolver === null || records.length === 0
          ? none
          : frozen
            ? Effect.succeed("node" as const)
            : setterKeying(client, resolver),
      resolverRootRoles: !probeResolver
        ? none
        : read(client, {
            address: resolver,
            abi: Abis.v2.permissionedResolver,
            functionName: "roles",
            args: [0n, account],
          }),
      resolverResourceRoles: Effect.forEach(
        probeResolver ? resources : [],
        (resource) =>
          read(client, {
            address: resolver as Address,
            abi: Abis.v2.permissionedResolver,
            functionName: "roles",
            args: [resource, account],
          }).pipe(Effect.map((roles) => [resource, roles ?? 0n] as const)),
        { concurrency: "unbounded" },
      ),
      resolverOperator:
        !probeResolver || resolverOwner === null
          ? none
          : read(client, {
              address: resolver,
              abi: Abis.v1.publicResolver,
              functionName: "isApprovedForAll",
              args: [resolverOwner, account],
            }),
      resolverDelegate:
        !probeResolver || resolverOwner === null
          ? none
          : read(client, {
              address: resolver,
              abi: Abis.v1.publicResolver,
              functionName: "isApprovedFor",
              args: [resolverOwner, data.parts.node, account],
            }),
      knownToWrapper:
        !v2PublicResolver || v1 === undefined || records.length === 0
          ? none
          : read(client, {
              address: v1.nameWrapper,
              abi: Abis.v1.nameWrapper,
              functionName: "names",
              args: [data.parts.node],
            }),
    },
    { concurrency: "unbounded" },
  );

  return {
    loaded,
    account,
    v1: {
      registryOperator: facts.registryOperator === true,
      registrarOperator: facts.registrarOperator === true,
      registrarApproved: nonZeroAddress(facts.registrarApproved),
      wrapperOperator: facts.wrapperOperator === true,
      wrapperApproved: nonZeroAddress(facts.wrapperApproved),
    },
    v2: {
      roles: (facts.tokenRoles ?? 0n) | (facts.rootRoles ?? 0n),
      ownerRoles: facts.ownerRoles ?? 0n,
      ownerOnlyAssignee: facts.ownerOnlyAssignee !== false,
      operator: facts.v2Operator === true,
      subregistryRoles: state.subregistry === null ? null : (facts.subregistryRoles ?? 0n),
    },
    resolver:
      resolver === null || facts.keying === undefined
        ? undefined
        : {
            address: resolver,
            kind: facts.keying === "name" ? "permissioned" : "node",
            rootRoles: facts.resolverRootRoles ?? 0n,
            resourceRoles: new Map(facts.resolverResourceRoles),
            owner: resolverOwner,
            operator: facts.resolverOperator,
            delegate: facts.resolverDelegate,
            nameKnown:
              !v2PublicResolver ||
              (facts.knownToWrapper !== undefined && facts.knownToWrapper !== "0x"),
            frozen,
          },
  };
});
