import { keccak256, toHex, type Address } from "viem";

/**
 * Devnet ledger key for each role or root a bigname Sepolia manifest declares, by source family.
 * Roles the devnet does not deploy (older resolver generations) are left out and point at
 * addresses without code.
 */
const devnetRoles: Readonly<Record<string, string>> = {
  "ens_execution:universal_resolver": "v2.universalResolver",
  "ens_execution:universal_resolver_managed": "v2.managedUniversalResolverProxy",
  "ens_execution:universal_resolver_implementation": "v2.universalResolverImplementation",
  "ens_v1_registrar_l1:ETHRegistrar": "v1.baseRegistrar",
  "ens_v1_registrar_l1:registrar": "v1.baseRegistrar",
  "ens_v1_registrar_l1:wrapped_registrar_controller": "v1.wrappedEthRegistrarController",
  "ens_v1_registrar_l1:wrapped_registrar_controller_4477cac": "v1.ethRegistrarController",
  "ens_v1_registry_l1:ENSRegistry": "v1.registry",
  "ens_v1_registry_l1:registry": "v1.registry",
  "ens_v1_registry_l1:registry_old": "v1.legacyRegistry",
  "ens_v1_resolver_l1:public_resolver": "v1.publicResolver",
  "ens_v1_reverse_l1:reverse_registrar": "v1.reverseRegistrar",
  "ens_v1_reverse_l1:default_reverse_registrar": "v1.defaultReverseRegistrar",
  "ens_v1_wrapper_l1:name_wrapper": "v1.nameWrapper",
  "ens_v2_migration_l1:unlocked_migration_controller": "v2.unlockedMigrationController",
  "ens_v2_migration_l1:locked_migration_controller": "v2.lockedMigrationController",
  "ens_v2_migration_l1:graveyard": "v2.graveyard",
  "ens_v2_migration_l1:ens_v1_renewal_bridge": "v2.ethRenewerV1",
  "ens_v2_migration_l1:verifiable_factory": "v2.verifiableFactory",
  "ens_v2_migration_l1:migration_helper": "v2.migrationHelper",
  "ens_v2_migration_l1:wrapper_registry_implementation": "v2.wrapperRegistryImplementation",
  "ens_v2_migration_l1:user_registry_implementation": "v2.userRegistryImplementation",
  "ens_v2_migration_l1:batch_registrar": "v2.batchRegistrar",
  "ens_v2_migration_l1:ens_v1_name_wrapper": "v1.nameWrapper",
  "ens_v2_migration_l1:ens_v1_base_registrar": "v1.baseRegistrar",
  "ens_v2_registrar_l1:ETHRegistrar": "v2.ethRegistrar",
  "ens_v2_registrar_l1:registrar": "v2.ethRegistrar",
  "ens_v2_registry_l1:ETHRegistry": "v2.ethRegistry",
  "ens_v2_registry_l1:registry": "v2.ethRegistry",
  "ens_v2_resolver_l1:ensv1_mirror_resolver": "v2.ensV1Resolver",
  "ens_v2_resolver_l1:public_resolver_v2": "v2.publicResolver",
  "ens_v2_resolver_l1:permissioned_resolver": "v2.permissionedResolverImplementation",
  "ens_v2_resolver_l1:ens_v1_registry": "v1.registry",
  "ens_v2_root_l1:RootRegistry": "v2.rootRegistry",
  "ens_v2_root_l1:root_registry": "v2.rootRegistry",
};

const addressPattern = "0x[0-9a-fA-F]{40}";

/** Every `(role or root name, address)` a manifest declares. */
const declaredAddresses = (manifest: string): readonly (readonly [string, string])[] => {
  const found: (readonly [string, string])[] = [];
  // Inline tables, e.g. `resolver_implementations = [ { role = "…", address = "0x…", … } ]`.
  for (const [, role = "", address = ""] of manifest.matchAll(
    new RegExp(`role = "([^"]+)", address = "(${addressPattern})"`, "g"),
  )) {
    found.push([role, address]);
  }
  for (const block of manifest.split(/^\[/m)) {
    if (block.startsWith("correlation_addresses]")) {
      for (const [, key = "", address = ""] of block.matchAll(
        new RegExp(`^(\\w+) = "(${addressPattern})"`, "gm"),
      )) {
        found.push([key, address]);
      }
      continue;
    }
    const label = /^(?:role|name) = "([^"]+)"/m.exec(block)?.[1];
    const address = new RegExp(`^address = "(${addressPattern})"`, "m").exec(block)?.[1];
    if (label !== undefined && address !== undefined) found.push([label, address]);
  }
  const implementations = new RegExp(
    `^universal_resolver_implementations = \\["(${addressPattern})"\\]`,
    "m",
  ).exec(manifest)?.[1];
  if (implementations !== undefined) {
    found.push(["universal_resolver_implementation", implementations]);
  }
  return found;
};

/** A stand-in for an address the devnet has no contract for: no code, no logs. */
const placeholder = (address: string): Address =>
  `0x${keccak256(toHex(address.toLowerCase())).slice(26)}`;

/**
 * Rewrites a set of Sepolia manifests (`path → text`, paths `<family>/v<n>.toml`) for the devnet:
 * each declared address becomes the devnet contract of its role, or a placeholder, and indexing
 * starts at block 0. Everything else (ABIs, discovery rules, capability flags) is kept verbatim.
 */
export const rewriteManifests = (
  manifests: ReadonlyMap<string, string>,
  ledger: Readonly<Record<string, Address>>,
): Map<string, string> => {
  const replacement = new Map<string, Address>();
  for (const [path, text] of manifests) {
    const family = path.split("/")[0] ?? "";
    for (const [label, address] of declaredAddresses(text)) {
      const key = devnetRoles[`${family}:${label}`];
      const target = (key === undefined ? undefined : ledger[key]) ?? placeholder(address);
      const previous = replacement.get(address.toLowerCase());
      if (previous !== undefined && previous.toLowerCase() !== target.toLowerCase()) {
        throw new Error(
          `${address} is ${previous} and ${target} in the devnet manifests (${path})`,
        );
      }
      replacement.set(address.toLowerCase(), target);
    }
  }

  const rewritten = new Map<string, string>();
  for (const [path, text] of manifests) {
    rewritten.set(
      path,
      text
        .replace(
          new RegExp(addressPattern, "g"),
          (address) => replacement.get(address.toLowerCase()) ?? placeholder(address),
        )
        .replace(/start_block = \d+/g, "start_block = 0"),
    );
  }
  return rewritten;
};
