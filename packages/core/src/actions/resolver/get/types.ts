import type { Address } from "viem";

/**
 * What a resolver contract is:
 *
 * - `public-resolver`: an ENSv1 PublicResolver (the current one or an older listed one).
 * - `public-resolver-v2`: the ENSv2 PublicResolverV2, for names known to the NameWrapper.
 * - `permissioned-resolver`: an ENSv2 PermissionedResolver, with role-based permissions.
 * - `ens-v1-resolver`: the ENSv2 bridge that reads names still on ENSv1 (read-only).
 * - `ens-v2-resolver`: the ENSv1 bridge that reads migrated names from ENSv2 (read-only).
 * - `dns`: a DNS resolver (off-chain DNS, TLD, alias or TXT resolver).
 * - `extended`: another ENSIP-10 resolver, usually wildcard or off-chain (CCIP-Read).
 * - `custom`: any other resolver.
 *
 * @category resolvers
 * @since 1.0.0
 */
export type ResolverKind =
  | "public-resolver"
  | "public-resolver-v2"
  | "permissioned-resolver"
  | "ens-v1-resolver"
  | "ens-v2-resolver"
  | "dns"
  | "extended"
  | "custom";

/**
 * Who may change records on a resolver: the name's `owner` (with operators and delegates),
 * accounts holding `roles`, nobody (`none`, read-only), or `unknown`.
 *
 * @category resolvers
 * @since 1.0.0
 */
export type ResolverAuthorization = "owner" | "roles" | "none" | "unknown";

/**
 * Record profiles a resolver declares through ERC-165.
 *
 * @category resolvers
 * @since 1.0.0
 */
export type ResolverProfiles = {
  /** ETH address (`addr(bytes32)`). */
  readonly addr: boolean;
  /** Multi-coin addresses (ENSIP-9). */
  readonly addresses: boolean;
  readonly text: boolean;
  readonly contentHash: boolean;
  readonly abi: boolean;
  readonly pubkey: boolean;
  /** The `name` record. */
  readonly name: boolean;
  readonly interfaces: boolean;
  /** Data records (ENSIP-24). */
  readonly data: boolean;
  /** ENSIP-10 `resolve(bytes,bytes)`: wildcard and off-chain resolution. */
  readonly extended: boolean;
};

/**
 * The resolver serving a name.
 *
 * @category resolvers
 * @since 1.0.0
 */
export type ResolverInfo = {
  readonly address: Address;
  /**
   * Whether the name has no resolver of its own and is served by another one (a parent's
   * wildcard resolver, or the ENSv1 bridge). Records cannot be written for the name there.
   */
  readonly inherited: boolean;
  readonly kind: ResolverKind;
  readonly authorization: ResolverAuthorization;
  readonly profiles: ResolverProfiles;
  /** ENSv1 record version of the name (bumped by `clear`); `null` when not versioned. */
  readonly version: bigint | null;
};
