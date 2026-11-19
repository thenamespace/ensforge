import type { Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

/**
 * Where a name lives and how it is held:
 *
 * - `available`: not registered on ENSv1 or ENSv2.
 * - `v1-unwrapped` / `v1-wrapped`: on ENSv1, without or with the NameWrapper.
 * - `v2-native`: registered on ENSv2.
 * - `v2-migrated`: moved from ENSv1 to ENSv2 (its ENSv1 record is held by the Graveyard).
 * - `v2-reserved`: reserved on ENSv2 without an ENSv1 owner.
 * - `offchain`: in no registry, but a parent's resolver serves it through a CCIP-Read gateway
 *   (`jesse.base.eth`, `test.uni.eth`). ENS cannot tell whether the gateway holds the label.
 * - `wildcard`: in no registry, but a parent's on-chain ENSIP-10 resolver serves it.
 * - `l2`: in an L2 namespace's registry on another chain (`jesse.base.eth`); `namespace` says
 *   which.
 *
 * @category names
 * @since 1.0.0
 */
export type NameKind =
  | "available"
  | "v1-unwrapped"
  | "v1-wrapped"
  | "v2-native"
  | "v2-migrated"
  | "v2-reserved"
  | "offchain"
  | "wildcard"
  | "l2";

/**
 * Registration status. `grace` applies to `.eth` second-level names after expiry, while anyone can
 * still renew; `expired` names can be registered again. `external` names (`offchain`, `wildcard`
 * and `l2` kinds) are managed outside ENS's registries, by their parent's namespace: they cannot
 * be registered through ENS.
 *
 * @category names
 * @since 1.0.0
 */
export type NameStatus = "available" | "registered" | "grace" | "expired" | "reserved" | "external";

/**
 * Where a name outside ENS's registries lives:
 *
 * - `l2`: in an L2 namespace (Basenames, Linea Names, Celonames, Durin, Namespace), on `chainId`.
 * - `offchain`: in an off-chain provider's database, served through its CCIP-Read gateway.
 *
 * @category names
 * @since 1.1.0
 */
export type NameNamespace =
  | {
      readonly kind: "l2";
      /** The namespace family, as `Deployments.Profile.namespaces` names it. */
      readonly id: Deployments.NamespaceId;
      /** The parent name the namespace hangs off, e.g. `base.eth`. */
      readonly parent: string;
      /** Chain ID of the L2 that holds the name. */
      readonly chainId: number;
      /** The registry on the L2 that holds the name; `null` when the L2 could not be reached. */
      readonly registry: Address | null;
    }
  | {
      readonly kind: "offchain";
      /** The provider whose gateway serves the name; `null` when ensforge does not know it. */
      readonly provider: Deployments.OffchainProvider | null;
      /** The ancestor whose resolver serves the name, e.g. `cb.id`. */
      readonly parent: string;
    };

/**
 * Full state of one name across ENSv1 and ENSv2.
 *
 * @category names
 * @since 1.0.0
 */
export type NameState = {
  /** The normalized name. */
  readonly name: string;
  readonly kind: NameKind;
  /** Chain ID where the name lives: the L2's for an `l2` name, the ENS deployment's otherwise. */
  readonly chainId: number;
  /** The L2 namespace or off-chain provider that holds the name; `null` for names in ENS. */
  readonly namespace: NameNamespace | null;
  /** Protocol that controls the name. */
  readonly protocol: "v1" | "v2";
  readonly status: NameStatus;
  /**
   * Who ultimately controls the name: the ENSv2 token holder; on ENSv1 the NameWrapper token
   * holder, the `.eth` registrant, or otherwise the registry owner.
   */
  readonly owner: Address | null;
  /** ENSv1 registry owner of an unwrapped name (the ENS app's "manager"). */
  readonly manager: Address | null;
  /** ENSv1 `.eth` registrar token holder of an unwrapped second-level name. */
  readonly registrant: Address | null;
  /** Registry that holds the name: ENSv1 `ENSRegistry`, or the ENSv2 parent registry. */
  readonly registry: Address | null;
  /** ENSv2 registry for the name's children. */
  readonly subregistry: Address | null;
  /** Resolver set on the name itself (not inherited from a parent). */
  readonly resolver: Address | null;
  /**
   * For a name without a resolver of its own, the resolver that serves it from an ancestor: a
   * parent's ENSIP-10 wildcard or off-chain resolver, or, for an ENSv1 name ENSv2 serves through
   * the ENSv1 bridge, the ENSv1 resolver behind it. `null` when the name has its own resolver or
   * nothing serves it. A name only an inherited resolver serves is in no registry: it is
   * `offchain` or `wildcard`, or `available` when the resolver does not answer for it.
   */
  readonly inheritedResolver: Address | null;
  /** Unix seconds when the registration ends, grace period excluded. `null` when it never expires. */
  readonly expiry: bigint | null;
  /** Unix seconds when the `.eth` grace period ends. */
  readonly gracePeriodEnd: bigint | null;
  /** Token ID: ENSv2 registry token (changes on some role updates), NameWrapper or `.eth` registrar token. */
  readonly tokenId: bigint | null;
  /** ENSv2 resource ID, stable across token changes. */
  readonly resource: bigint | null;
  /** ENSv1 registry TTL in seconds. */
  readonly ttl: bigint | null;
  /** Whether the name is wrapped in the ENSv1 NameWrapper. */
  readonly wrapped: boolean;
  /** Whether the name was migrated from ENSv1 to ENSv2. */
  readonly migrated: boolean;
  /**
   * Whether ENSv2 resolution reaches the name. An ENSv1 name is reachable when the resolver ENSv2
   * resolution finds for it reads ENSv1: the ENSv1 bridge (a reservation, a migrated parent that
   * kept it as resolver, an emancipated child of a locked parent) or a DNS TLD resolver. `false`
   * when ENSv2 answers from elsewhere, e.g. a parent that migrated without the name or a `.eth`
   * name without a reservation: its ENSv1 records no longer resolve, nor do its children's.
   * Always `true` for ENSv2 names and on deployments without ENSv2.
   */
  readonly reachable: boolean;
  /** Whether the name can be registered now. */
  readonly available: boolean;
  /** Whether the name can be renewed now (`.eth` second-level names when registered or in grace). */
  readonly renewable: boolean;
};
