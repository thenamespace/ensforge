import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";

const ownedResolverDomain = keccak256(stringToHex("OwnedResolver"));
const migrationUserRegistryDomain = keccak256(stringToHex("ENSManagerMigrationUserRegistry:v1"));

/**
 * `VerifiableFactory` salt of an account's shared PermissionedResolver, as the ENS manager app
 * derives it: `keccak256(abi.encode(keccak256("OwnedResolver"), owner, 0))`. Deployed by `owner`,
 * it gives the same resolver address in the app and in ensforge.
 *
 * **Example** (Predicting an account's shared resolver)
 *
 * ```ts
 * import { ownedResolverSalt, predictVerifiableProxyAddress } from "@ensforge/contracts/v2"
 *
 * const resolver = predictVerifiableProxyAddress({
 *   factory,
 *   proxyLogic,
 *   deployer: owner,
 *   salt: ownedResolverSalt(owner),
 * })
 * ```
 *
 * @stability stable
 * @since 1.0.0
 */
export const ownedResolverSalt = (owner: Hex): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [ownedResolverDomain, owner, 0n],
      ),
    ),
  );

/**
 * `VerifiableFactory` salt of the UserRegistry that holds a migrated name's subnames, as the ENS
 * manager app derives it: `keccak256(abi.encode(keccak256("ENSManagerMigrationUserRegistry:v1"),
 * parentNode))`.
 *
 * @stability stable
 * @since 1.0.0
 */
export const migrationUserRegistrySalt = (parentNode: Hex): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }],
        [migrationUserRegistryDomain, parentNode],
      ),
    ),
  );
