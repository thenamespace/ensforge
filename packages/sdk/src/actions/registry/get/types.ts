import type { Address } from "viem";

/**
 * What an ENSv2 registry is: the `root` registry, the `.eth` registry, a `user` registry holding
 * a name's children, a `wrapper` registry for names migrated from the NameWrapper, or `unknown`.
 *
 * @category registries
 * @since 1.0.0
 */
export type RegistryKind = "root" | "eth" | "user" | "wrapper" | "unknown";

/**
 * Why a registry cannot be upgraded:
 *
 * - `up-to-date`: it already runs the deployment's latest implementation.
 * - `not-approved`: the latest implementation does not accept the current one
 *   (`canUpgradeFrom`), or the registry is emancipated and its upgrade set does not list it.
 * - `unauthorized`: the account lacks the `upgrade` root role.
 * - `not-upgradeable`: ensforge knows no upgrade target for this kind of registry.
 *
 * @category registries
 * @since 1.0.0
 */
export type RegistryUpgradeBlocker =
  | "up-to-date"
  | "not-approved"
  | "unauthorized"
  | "not-upgradeable";

/**
 * An ENSv2 registry contract.
 *
 * @category registries
 * @since 1.0.0
 */
export type RegistryInfo = {
  readonly address: Address;
  readonly kind: RegistryKind;
  /** Current implementation behind the proxy. */
  readonly implementation: Address;
  /** The registry above it and the label it sits under, as set with `setParent`. */
  readonly parent: { readonly registry: Address; readonly label: string } | null;
  /** Name whose children this registry holds, e.g. `nick.eth`; `null` when not reachable. */
  readonly canonicalName: string | null;
  readonly uri: string | null;
  readonly renderer: Address | null;
  /** No root role holder can take children back (unregister, repoint, control transfers). */
  readonly emancipated: boolean;
  readonly upgrade: {
    /** The deployment's latest implementation for this kind of registry. */
    readonly latest: Address | null;
    readonly eligible: boolean;
    readonly blocker: RegistryUpgradeBlocker | null;
  };
};
