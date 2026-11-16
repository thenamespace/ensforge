import { Effect } from "effect";

import { InterfaceIds } from "@ensforge/contracts";
import { isAddressEqual, type Address, type Hex } from "viem";

import type {
  ResolverAuthorization,
  ResolverKind,
  ResolverProfiles,
} from "../../actions/resolver/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { erc165Abi, versionableResolverAbi } from "../abis/resolver.js";
import { addressSetAbi } from "../abis/v2.js";
import * as Rpc from "../rpc/index.js";

const profileIds = {
  addr: InterfaceIds.resolverProfiles.addr,
  addresses: InterfaceIds.resolverProfiles.address,
  text: InterfaceIds.resolverProfiles.text,
  contentHash: InterfaceIds.resolverProfiles.contenthash,
  abi: InterfaceIds.resolverProfiles.abi,
  pubkey: InterfaceIds.resolverProfiles.pubkey,
  name: InterfaceIds.resolverProfiles.name,
  interfaces: InterfaceIds.resolverProfiles.interface,
  data: InterfaceIds.resolverProfiles.data,
  extended: InterfaceIds.resolverProfiles.extended,
} as const satisfies Record<keyof ResolverProfiles, Hex>;

// PermissionedResolvers declare only their setters through ERC-165 and answer every read through
// `resolve()`; their profiles are fixed by the contract.
const permissionedProfiles: ResolverProfiles = {
  addr: true,
  addresses: true,
  text: true,
  contentHash: true,
  abi: true,
  pubkey: false,
  name: true,
  interfaces: true,
  data: true,
  extended: true,
};

const authorizationOf: Record<ResolverKind, ResolverAuthorization> = {
  "public-resolver": "owner",
  "public-resolver-v2": "owner",
  "permissioned-resolver": "roles",
  // Bridges and DNS resolvers derive records from elsewhere; nothing can be written to them.
  "ens-v1-resolver": "none",
  "ens-v2-resolver": "none",
  dns: "none",
  extended: "unknown",
  custom: "unknown",
};

/** Kinds recognised by address alone, from the client's deployment. */
const knownKind = (client: Client, resolver: Address): ResolverKind | undefined => {
  const { v1, v2 } = client.deployment;
  const known: readonly (readonly [Address | undefined, ResolverKind])[] = [
    [v2?.migration.ensV1Resolver, "ens-v1-resolver"],
    [v2?.contracts.ensV2Resolver, "ens-v2-resolver"],
    [v2?.contracts.publicResolver, "public-resolver-v2"],
    [v1?.contracts.publicResolver, "public-resolver"],
    [v1?.contracts.offchainDnsResolver, "dns"],
    [v2?.dns?.tldResolver, "dns"],
    [v2?.dns?.aliasResolver, "dns"],
    [v2?.dns?.txtResolver, "dns"],
  ];
  return known.find(([address]) => address !== undefined && isAddressEqual(address, resolver))?.[1];
};

// A resolver that is not a contract (e.g. an EOA), or not ERC-165, answers nothing.
const unanswered = <value>(read: Effect.Effect<value | undefined, AnyError>) =>
  read.pipe(
    Effect.catchIf(
      (error: AnyError) => error._tag === "ConfigError" && error.code === "CONTRACT_NOT_DEPLOYED",
      () => Effect.succeed(undefined),
    ),
  );

/**
 * Describes the resolver at `resolver` for `node` in one batched round of reads: ERC-165 profile
 * checks, the record version, and membership of the ENSv2 public resolver set (which lists the
 * older ENSv1 public resolvers too).
 */
export const describeResolver = Effect.fnUntraced(function* (
  client: Client,
  resolver: Address,
  node: Hex,
  block: Read.BlockOptions = {},
): Effect.fn.Return<
  {
    readonly kind: ResolverKind;
    readonly authorization: ResolverAuthorization;
    readonly profiles: ResolverProfiles;
    readonly version: bigint | null;
  },
  AnyError
> {
  const at =
    block.blockNumber === undefined
      ? { blockTag: block.blockTag }
      : { blockNumber: block.blockNumber };
  const supports = (interfaceId: Hex) =>
    unanswered(
      Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: erc165Abi,
        functionName: "supportsInterface",
        args: [interfaceId],
        ...at,
      }),
    ).pipe(Effect.map((supported) => supported === true));
  const publicResolverSet = client.deployment.v2?.migration.publicResolverSet;

  const { profiles, permissioned, listed, version } = yield* Effect.all(
    {
      profiles: Effect.all(
        Object.fromEntries(
          Object.entries(profileIds).map(([profile, id]) => [profile, supports(id)]),
        ) as { readonly [profile in keyof ResolverProfiles]: Effect.Effect<boolean, AnyError> },
        { concurrency: "unbounded" },
      ),
      permissioned: supports(InterfaceIds.resolver.permissionedResolver),
      listed:
        publicResolverSet === undefined
          ? Effect.succeed(false)
          : Rpc.readContractOrUndefined(client, {
              address: publicResolverSet,
              abi: addressSetAbi,
              functionName: "includes",
              args: [resolver],
              ...at,
            }).pipe(Effect.map((included) => included === true)),
      version: unanswered(
        Rpc.readContractOrUndefined(client, {
          address: resolver,
          abi: versionableResolverAbi,
          functionName: "recordVersions",
          args: [node],
          ...at,
        }),
      ),
    },
    { concurrency: "unbounded" },
  );

  const kind: ResolverKind =
    knownKind(client, resolver) ??
    (permissioned
      ? "permissioned-resolver"
      : listed
        ? "public-resolver"
        : profiles.extended
          ? "extended"
          : "custom");

  return {
    kind,
    authorization: authorizationOf[kind],
    profiles: kind === "permissioned-resolver" ? permissionedProfiles : profiles,
    version: version ?? null,
  };
});
