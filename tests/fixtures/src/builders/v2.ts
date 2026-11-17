import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { ownedResolverSalt, predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import type { StepContext } from "@ensforge/test-devnet";
import {
  encodeFunctionData,
  keccak256,
  maxUint256,
  namehash,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Address,
} from "viem";

import { secretFor } from "./names.ts";

const commitmentAge = 61n;

/** Mints the mock USDC to `owner` and approves the ETHRegistrar to spend it. */
export const fundUsdc = Effect.fnUntraced(function* (c: StepContext, owner: Address) {
  const usdc = yield* c.address("v2.usdc");
  yield* c.write("v2.usdc", "mint", [owner, 10n ** 15n]);
  yield* c.write(
    [usdc, "v2/MockERC20"],
    "approve",
    [yield* c.address("v2.ethRegistrar"), maxUint256],
    {
      from: owner,
    },
  );
});

/**
 * Registers `label.eth` on ENSv2 through the ETHRegistrar, paid in mock USDC, after a real
 * commitment. Returns the token ID and expiry as the registry reports them.
 */
export const registerV2 = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly label: string;
    readonly owner: Address;
    readonly duration: bigint;
    readonly resolver?: Address;
    readonly subregistry?: Address;
  },
) {
  const { label, owner, duration } = options;
  const name = `${label}.eth`;
  const secret = secretFor(name);
  const resolver = options.resolver ?? zeroAddress;
  const subregistry = options.subregistry ?? zeroAddress;
  const usdc = yield* c.address("v2.usdc");
  yield* fundUsdc(c, owner);

  const commitment = yield* c.read<`0x${string}`>("v2.ethRegistrar", "makeCommitment", [
    label,
    owner,
    secret,
    subregistry,
    resolver,
    duration,
    zeroHash,
  ]);
  yield* c.write("v2.ethRegistrar", "commit", [commitment], { from: owner });
  c.time.advance(commitmentAge);
  yield* c.write(
    "v2.ethRegistrar",
    "register",
    [label, owner, secret, subregistry, resolver, duration, usdc, zeroHash],
    { from: owner },
  );

  const tokenId = yield* c.read<bigint>("v2.ethRegistry", "findTokenId", [label]);
  const expiry = yield* c.read<bigint>("v2.ethRegistry", "findExpiry", [label]);
  return { name, node: namehash(name), tokenId, expiry, resolver };
});

// VerifiableFactory proxies are CREATE2, so the address is known before deploying.
const deployProxy = Effect.fnUntraced(function* (
  c: StepContext,
  implementationKey: string,
  salt: bigint,
  initializer: `0x${string}`,
  deployer: Address,
) {
  const factory = yield* c.address("v2.verifiableFactory");
  const proxyLogic = yield* c.read<Address>("v2.verifiableFactory", "proxyLogic");
  const implementation = yield* c.address(implementationKey);
  yield* c.write("v2.verifiableFactory", "deployProxy", [implementation, salt, initializer], {
    from: deployer,
  });
  return predictVerifiableProxyAddress({ factory, proxyLogic, deployer, salt });
});

/**
 * The owner's PermissionedResolver at ensforge's canonical salt (`ownedResolverSalt`), `admin`
 * holding every role. `calls` are setters (against `Abis.v2.permissionedResolver`) run at
 * initialization.
 */
export const ownedResolver = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly admin: Address; readonly calls?: readonly `0x${string}`[] },
) {
  const initializer = encodeFunctionData({
    abi: Abis.v2.permissionedResolver,
    functionName: "initialize",
    args: [
      [{ account: options.admin, roleBitmap: Roles.enhancedAccessControl.allRoles }],
      [...(options.calls ?? [])],
    ],
  });
  return yield* deployProxy(
    c,
    "v2.permissionedResolverImplementation",
    ownedResolverSalt(options.admin),
    initializer,
    options.admin,
  );
});

/** A UserRegistry proxy for subnames, `admin` holding every role on it. */
export const userRegistry = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly salt: string; readonly admin: Address },
) {
  const initializer = encodeFunctionData({
    abi: Abis.v2.userRegistry,
    functionName: "initialize",
    args: [[{ account: options.admin, roleBitmap: Roles.enhancedAccessControl.allRoles }]],
  });
  return yield* deployProxy(
    c,
    "v2.userRegistryImplementation",
    BigInt(keccak256(stringToHex(`registry:${options.salt}`))),
    initializer,
    options.admin,
  );
});

/**
 * Mounts a fresh UserRegistry under the ENSv2 name `parent` (held by `owner` in `parentRegistry`)
 * and names it canonically. Returns the registry address.
 */
export const mountUserRegistry = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly parent: string;
    readonly parentRegistry: Address;
    readonly parentTokenId: bigint;
    readonly owner: Address;
    /** Distinguishes several registries for the same parent; the parent name by default. */
    readonly salt?: string;
  },
) {
  const registry = yield* userRegistry(c, {
    salt: options.salt ?? options.parent,
    admin: options.owner,
  });
  const from = { from: options.owner } as const;
  yield* c.write(
    [options.parentRegistry, "v2/ETHRegistry"],
    "setSubregistry",
    [options.parentTokenId, registry],
    from,
  );
  yield* c.write(
    [registry, "v2/UserRegistryImpl"],
    "setParent",
    [options.parentRegistry, options.parent.split(".")[0] as string],
    from,
  );
  return registry;
});

/** Registers `label` in a v2 registry the admin controls, with explicit roles and expiry. */
export const v2Subname = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly registry: Address;
    readonly parent: string;
    readonly label: string;
    readonly admin: Address;
    readonly owner: Address;
    readonly roles: bigint;
    readonly expiry: bigint;
    readonly resolver?: Address;
    readonly subregistry?: Address;
  },
) {
  yield* c.write(
    [options.registry, "v2/UserRegistryImpl"],
    "register",
    [
      options.label,
      options.owner,
      options.subregistry ?? zeroAddress,
      options.resolver ?? zeroAddress,
      options.roles,
      options.expiry,
    ],
    { from: options.admin },
  );
  const name = `${options.label}.${options.parent}`;
  const tokenId = yield* c.read<bigint>([options.registry, "v2/UserRegistryImpl"], "findTokenId", [
    options.label,
  ]);
  return { name, node: namehash(name), tokenId };
});
