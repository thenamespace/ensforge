import { Effect, Record as Rec } from "effect";

import { CurrentStep, type ArtifactName } from "@ensforge/test-devnet";
import { labelhash, namehash, type Address, type Hex } from "viem";

/** A contract on the L2 being seeded, with the artifact whose ABI it answers. */
type Target = readonly [Address, ArtifactName];

/** Records every L2 namespace's resolver takes through the standard setters. */
export type L2Records = {
  readonly texts?: Readonly<Record<string, string>>;
  /** The ETH address (`setAddr(node, address)`). */
  readonly eth?: Address;
  /** Other coin types, raw bytes. */
  readonly addresses?: ReadonlyArray<readonly [coinType: bigint, value: Hex]>;
};

/** Writes `records` for `node` on `resolver` as `from`, one setter call each. */
export const setL2Records = Effect.fnUntraced(function* (options: {
  readonly resolver: Target;
  readonly node: Hex;
  readonly from: Address;
  readonly records: L2Records;
}) {
  const c = yield* CurrentStep;
  const { resolver, node, records } = options;
  const from = { from: options.from } as const;
  for (const [key, value] of Rec.toEntries(records.texts ?? {})) {
    yield* c.write(resolver, "setText", [node, key, value], from);
  }
  if (records.eth !== undefined) yield* c.write(resolver, "setAddr", [node, records.eth], from);
  for (const [coinType, value] of records.addresses ?? []) {
    yield* c.write(resolver, "setAddr", [node, coinType, value], from);
  }
});

/** Registers `label.base.eth` through the BaseRegistrar (the deployer is its controller). */
export const registerBasename = Effect.fnUntraced(function* (options: {
  readonly label: string;
  readonly owner: Address;
  readonly duration: bigint;
  readonly resolver: Address;
}) {
  const c = yield* CurrentStep;
  yield* c.write("basenames.baseRegistrar", "registerWithRecord", [
    BigInt(labelhash(options.label)),
    options.owner,
    options.duration,
    options.resolver,
    0n,
  ]);
  return yield* c.read<bigint>("basenames.baseRegistrar", "nameExpires", [
    BigInt(labelhash(options.label)),
  ]);
});

/** Registers and wraps `label.linea.eth` through Linea's NameWrapper (deployer: controller). */
export const registerLineaName = Effect.fnUntraced(function* (options: {
  readonly label: string;
  readonly owner: Address;
  readonly duration: bigint;
  /** Owner-controlled NameWrapper fuses to burn at registration. */
  readonly fuses?: number;
}) {
  const c = yield* CurrentStep;
  yield* c.write("linea.nameWrapper", "registerAndWrap", [
    options.label,
    options.owner,
    options.duration,
    yield* c.address("linea.resolver"),
    options.fuses ?? 0,
  ]);
  return yield* c.read<bigint>("linea.baseRegistrar", "nameExpires", [
    BigInt(labelhash(options.label)),
  ]);
});

/** Creates `label.celo.eth` in the Celonames registry (deployer: registrar), expiring at `expiry`. */
export const registerCeloName = Effect.fnUntraced(function* (options: {
  readonly label: string;
  readonly owner: Address;
  readonly expiry: bigint;
}) {
  const c = yield* CurrentStep;
  yield* c.write("celonames.registry", "createSubnode", [
    options.label,
    options.expiry,
    options.owner,
    [],
  ]);
});

/** A Durin registry for `parent`, deployed through the factory and administered by `admin`. */
export const durinRegistry = Effect.fnUntraced(function* (options: {
  readonly parent: string;
  readonly admin: Address;
}) {
  const c = yield* CurrentStep;
  const args = [options.parent, "DURIN", "https://ensforge.invalid/durin/", options.admin];
  // The factory's next clone, as the transaction will create it.
  const registry = yield* c.read<Address>("durin.factory", "deployRegistry", args);
  yield* c.write("durin.factory", "deployRegistry", args);
  return registry;
});

/**
 * A Namespace registry for `parent` on the running L2, recorded in its NodeRegistryResolver as
 * Namespace's controller does. Its token for `parent` goes to `owner`; the deployer registers.
 */
export const namespaceRegistry = Effect.fnUntraced(function* (options: {
  readonly key: string;
  readonly parent: string;
  readonly owner: Address;
}) {
  const c = yield* CurrentStep;
  const registry = yield* c.deploy(options.key, "namespace/EnsNameRegistry", [
    {
      parentControlType: 1,
      expirableType: 1,
      tokenName: options.parent,
      tokenSymbol: "NS",
      metadataUri: "https://ensforge.invalid/namespace/",
      tokenOwner: options.owner,
      namehash: namehash(options.parent),
      emitter: yield* c.address("namespace.emitter"),
    },
  ]);
  yield* c.write("namespace.emitter", "setApprovedEmitter", [registry, true]);
  yield* c.write(options.key, "setController", [c.accounts.deployer, true]);
  yield* c.write("namespace.nodeRegistryResolver", "setNodeRegistry", [
    namehash(options.parent),
    registry,
  ]);
  return registry;
});

/**
 * Registers `label.<parent>` in a Namespace registry for `duration` seconds (this registry
 * generation adds the time to `block.timestamp`), returning the name and its expiry.
 */
export const registerNamespaceName = Effect.fnUntraced(function* (options: {
  readonly registryKey: string;
  readonly parent: string;
  readonly label: string;
  readonly owner: Address;
  readonly duration: bigint;
}) {
  const c = yield* CurrentStep;
  const name = `${options.label}.${options.parent}`;
  yield* c.write(options.registryKey, "register", [options.label, options.owner, options.duration]);
  // NamePublicResolver authorises record writes through the node's registry.
  yield* c.write("namespace.nodeRegistryResolver", "setNodeRegistry", [
    namehash(name),
    yield* c.address(options.registryKey),
  ]);
  const expiry = yield* c.read<bigint>(options.registryKey, "expiries", [namehash(name)]);
  return { name, expiry };
});
