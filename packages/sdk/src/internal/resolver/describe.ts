import { Effect, Array as Arr, Record as Rec, Option } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";
import { isAddressEqual, type Address, type Hex } from "viem";

import type {
  ResolverAuthorization,
  ResolverKind,
  ResolverProfiles,
} from "../../actions/resolver/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { blockAt } from "../rpc/block.js";
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
    ...Arr.map(
      [...(v1?.legacyPublicResolvers ?? []), ...(v1?.frozenPublicResolvers ?? [])],
      (address) => [address, "public-resolver"] as const,
    ),
    [v1?.contracts.offchainDnsResolver, "dns"],
    [v2?.dns?.tldResolver, "dns"],
    [v2?.dns?.legacyTldResolver, "dns"],
    [v2?.dns?.aliasResolver, "dns"],
    [v2?.dns?.txtResolver, "dns"],
  ];
  return Option.getOrUndefined(
    Arr.findFirst(known, ([address]) => address !== undefined && isAddressEqual(address, resolver)),
  )?.[1];
};

// A resolver that is not a contract (e.g. an EOA), or not ERC-165, answers nothing. `gas` bounds
// each read of the resolver; a bounded read that fails is no answer.
const fromResolver = <value>(
  read: (gas: bigint | undefined) => Effect.Effect<value | undefined, AnyError>,
  gas: bigint | undefined,
) =>
  read(gas).pipe(
    Effect.catchIf(
      (error: AnyError) =>
        gas !== undefined ||
        (error._tag === "ConfigError" && error.code === "CONTRACT_NOT_DEPLOYED"),
      () => Effect.undefined,
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
  const at = blockAt(block);
  const publicResolverSet = client.deployment.v2?.migration.publicResolverSet;

  const supports = (interfaceId: Hex, gas: bigint | undefined) =>
    fromResolver(
      (bound) =>
        Rpc.readContractOrUndefined(client, {
          address: resolver,
          abi: Abis.shared.erc165,
          functionName: "supportsInterface",
          args: [interfaceId],
          gas: bound,
          ...at,
        }),
      gas,
    ).pipe(Effect.map((supported) => supported === true));

  const round = (gas: bigint | undefined) =>
    Effect.all(
      {
        profiles: Effect.all(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Rec.fromEntries` widens the profile keys it was built from
          Rec.fromEntries(
            Arr.map(Rec.toEntries(profileIds), ([profile, id]) => [profile, supports(id, gas)]),
          ) as { readonly [profile in keyof ResolverProfiles]: Effect.Effect<boolean, AnyError> },
          { concurrency: "unbounded" },
        ),
        permissioned: supports(InterfaceIds.resolver.permissionedResolver, gas),
        listed:
          publicResolverSet === undefined
            ? Effect.succeed(false)
            : Rpc.readContractOrUndefined(client, {
                address: publicResolverSet,
                abi: Abis.v2.permissionedAddressSet,
                functionName: "includes",
                args: [resolver],
                ...at,
              }).pipe(Effect.map((included) => included === true)),
        version: fromResolver(
          (bound) =>
            Rpc.readContractOrUndefined(client, {
              address: resolver,
              abi: Abis.shared.versionableResolver,
              functionName: "recordVersions",
              args: [node],
              gas: bound,
              ...at,
            }),
          gas,
        ),
      },
      { concurrency: "unbounded" },
    );

  // One batched round has no per-call gas bound, so a resolver that burns gas or returns huge
  // data fails it at the RPC. Read one by one within the 30,000 gas EIP-165 allows
  // `supportsInterface`, it just does not answer.
  const { profiles, permissioned, listed, version } = yield* round(undefined).pipe(
    Effect.catchTag("NetworkError", () => round(30_000n)),
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

  // Resolvers bound to the registry ENS replaced in 2020 can no longer be written.
  const frozen = Arr.some(client.deployment.v1?.frozenPublicResolvers ?? [], (address) =>
    isAddressEqual(address, resolver),
  );

  return {
    kind,
    authorization: frozen ? "none" : authorizationOf[kind],
    profiles: kind === "permissioned-resolver" ? permissionedProfiles : profiles,
    version: version ?? null,
  };
});
