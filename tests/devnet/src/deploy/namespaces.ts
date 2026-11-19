import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { encodeFunctionData, labelhash, namehash, zeroHash, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { dnsEncode } from "./constants.ts";
import { mnemonic, step, type StepContext, type Step } from "./engine.ts";

/**
 * The key every L2 namespace gateway signs with, and every family's Ethereum resolver trusts (as
 * mainnet's trust their providers' gateways). Anvil's mnemonic, index 10: not a funded account.
 */
export const gatewaySigner = mnemonicToAccount(mnemonic, { addressIndex: 10 });

/**
 * What the Ethereum resolvers ask until a test serves a gateway (`setUrl` and friends, called by
 * their owner, the deployer).
 */
export const unservedGateway = "http://127.0.0.1:1/{sender}/{data}.json";

/** The ENS registry's mainnet address, which Durin's L1Resolver reads as a constant. */
const mainnetRegistry: Address = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

/** Sends `send` as `address`, an account anvil does not unlock (a contract). */
const impersonated = <A, E, R>(c: StepContext, address: Address, send: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* c.cheat((client) => client.impersonateAccount({ address }));
    yield* c.cheat((client) => client.setBalance({ address, value: 10n ** 18n }));
    const result = yield* send;
    yield* c.cheat((client) => client.stopImpersonatingAccount({ address }));
    return result;
  });

/**
 * Each L2 namespace family's resolver on Ethereum, as mainnet resolves `base.eth`, `linea.eth`,
 * `celo.eth`, Durin parents and Namespace parents through them. They trust `gatewaySigner`; tests
 * point them at in-process gateways. Linea's resolver verifies L2 state proofs, which a devnet
 * cannot produce, so a gateway resolver that returns the gateway's answer stands in for it.
 * Deployed after everything else so no other address moves.
 */
export const namespaceSteps: readonly Step[] = [
  // Durin's L1Resolver and Namespace's HybridResolverV2 read the ENS registry at its mainnet
  // address, and Durin's resolves `namewrapper.eth` to the NameWrapper in its constructor, as on
  // mainnet.
  step("namespaces.registry", (c) =>
    Effect.gen(function* () {
      const forwarder = yield* c.deploy("namespaces.registryForwarder", "mocks/RegistryForwarder", [
        yield* c.address("v1.registry"),
      ]);
      const code = yield* c.cheat((client) => client.getCode({ address: forwarder }));
      yield* c.cheat((client) =>
        client.setCode({ address: mainnetRegistry, bytecode: code ?? "0x" }),
      );

      const ethOwner = yield* c.read<Address>("v1.registry", "owner", [namehash("eth")]);
      const publicResolver = yield* c.address("v1.publicResolver");
      yield* impersonated(
        c,
        ethOwner,
        c.write(
          "v1.registry",
          "setSubnodeRecord",
          [namehash("eth"), labelhash("namewrapper"), c.accounts.deployer, publicResolver, 0n],
          { from: ethOwner },
        ),
      );
      yield* c.write("v1.publicResolver", "setAddr", [
        namehash("namewrapper.eth"),
        yield* c.address("v1.nameWrapper"),
      ]);
    }),
  ),

  step("namespaces.basenames", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("namespaces.basenames.l1Resolver", "basenames/L1Resolver", [
        unservedGateway,
        [gatewaySigner.address],
        c.accounts.deployer,
        yield* c.address("v1.publicResolver"),
      ]);
    }),
  ),

  step("namespaces.linea", (c) =>
    c.deploy("namespaces.linea.l1Resolver", "mocks/GatewayResolver").pipe(Effect.asVoid),
  ),

  step("namespaces.celonames", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("namespaces.celonames.l1Resolver", "celonames/L1Resolver", [
        [gatewaySigner.address],
        [unservedGateway],
        "celo.eth",
        yield* c.address("v1.nameWrapper"),
        yield* c.address("v1.registry"),
      ]);
    }),
  ),

  step("namespaces.durin", (c) =>
    c
      .deploy("namespaces.durin.l1Resolver", "durin/L1Resolver", [
        unservedGateway,
        gatewaySigner.address,
        c.accounts.deployer,
      ])
      .pipe(Effect.asVoid),
  ),

  step("namespaces.namespace", (c) =>
    Effect.gen(function* () {
      const nameWrapper = yield* c.address("v1.nameWrapper");
      for (const key of ["current", "previous"] as const) {
        const hybrid = `namespaces.namespace.hybridResolver.${key}`;
        yield* c.deploy(hybrid, "namespace/NamespaceHybridResolver", [
          [gatewaySigner.address],
          yield* c.address("v1.registry"),
          nameWrapper,
          yield* c.address("v1.publicResolver"),
        ]);
        // Resolution types are chain IDs, 9999 for Namespace's off-chain database.
        for (const resolutionType of [9999n, 8453n, 10n]) {
          yield* c.write(hybrid, "setResolutionUrls", [resolutionType, [unservedGateway]]);
        }
      }

      yield* c.deploy("namespaces.namespace.hybridResolver.v2", "namespace/HybridResolverV2", [
        nameWrapper,
        yield* c.address("v2.rootRegistry"),
        c.accounts.deployer,
      ]);
      // Routes as on mainnet: 1 off-chain, 2 Base, 3 OP Mainnet.
      for (const route of [1n, 2n, 3n]) {
        yield* c.write("namespaces.namespace.hybridResolver.v2", "setRoute", [
          route,
          unservedGateway,
          gatewaySigner.address,
        ]);
      }
    }),
  ),
];

/** Multicall3 at its canonical address, as on every L2 ensforge reads. */
const multicall = step("l2.canonical", (c) =>
  c.place("canonical.multicall3", "canonical/Multicall3").pipe(Effect.asVoid),
);

/**
 * The root, `eth` and `addr.reverse` of an ENS-style registry (`<family>.registry`), owned as the
 * resolvers' constructors expect: they claim their reverse record. Returns the reverse registrar.
 */
const registryRoots = (c: StepContext, family: string) =>
  Effect.gen(function* () {
    const { deployer } = c.accounts;
    const registry = `${family}.registry`;
    yield* c.write(registry, "setSubnodeOwner", [zeroHash, labelhash("eth"), deployer]);
    yield* c.write(registry, "setSubnodeOwner", [zeroHash, labelhash("reverse"), deployer]);
    const reverseRegistrar = yield* c.deploy(`${family}.reverseRegistrar`, "v1/ReverseRegistrar", [
      yield* c.address(registry),
    ]);
    yield* c.write(registry, "setSubnodeOwner", [
      namehash("reverse"),
      labelhash("addr"),
      reverseRegistrar,
    ]);
    return reverseRegistrar;
  });

const basenames = step("l2.basenames", (c) =>
  Effect.gen(function* () {
    const { deployer } = c.accounts;
    const registry = yield* c.deploy("basenames.registry", "basenames/Registry", [deployer]);
    const reverseRegistrar = yield* registryRoots(c, "basenames");

    const baseRegistrar = yield* c.deploy("basenames.baseRegistrar", "basenames/BaseRegistrar", [
      registry,
      deployer,
      namehash("base.eth"),
      "https://ensforge.invalid/basenames/",
      "https://ensforge.invalid/basenames.json",
    ]);
    yield* c.write("basenames.registry", "setSubnodeOwner", [
      namehash("eth"),
      labelhash("base"),
      baseRegistrar,
    ]);
    yield* c.write("basenames.baseRegistrar", "addController", [deployer]);

    yield* c.deploy("basenames.legacyResolver", "basenames/L2Resolver", [
      registry,
      deployer,
      reverseRegistrar,
      deployer,
    ]);
    const implementation = yield* c.deploy(
      "basenames.resolverImplementation",
      "basenames/UpgradeableL2Resolver",
    );
    yield* c.deploy("basenames.resolver", "basenames/TransparentUpgradeableProxy", [
      implementation,
      deployer,
      encodeFunctionData({
        abi: Abis.basenames.l2Resolver,
        functionName: "initialize",
        args: [registry, deployer, reverseRegistrar, deployer],
      }),
    ]);
  }),
);

const durin = step("l2.durin", (c) =>
  Effect.gen(function* () {
    const implementation = yield* c.deploy("durin.registryImplementation", "durin/L2Registry");
    yield* c.deploy("durin.factory", "durin/L2RegistryFactory", [implementation]);
  }),
);

/** Namespace's shared contracts on one L2; each parent's registry is a fixture's. */
const namespace = step("l2.namespace", (c) =>
  Effect.gen(function* () {
    const { deployer } = c.accounts;
    yield* c.deploy("namespace.emitter", "namespace/RegistryEmitter");
    const nodeRegistryResolver = yield* c.deploy(
      "namespace.nodeRegistryResolver",
      "namespace/NodeRegistryResolver",
    );
    yield* c.deploy("namespace.publicResolver", "namespace/NamePublicResolver", [
      nodeRegistryResolver,
    ]);
    // The deployer acts as Namespace's controller: it registers names and records registries.
    yield* c.write("namespace.emitter", "setController", [deployer, true]);
    yield* c.write("namespace.nodeRegistryResolver", "setController", [deployer, true]);
  }),
);

const linea = step("l2.linea", (c) =>
  Effect.gen(function* () {
    const { deployer } = c.accounts;
    const registry = yield* c.deploy("linea.registry", "linea/ENSRegistry");
    const reverseRegistrar = yield* registryRoots(c, "linea");

    const baseRegistrar = yield* c.deploy(
      "linea.baseRegistrar",
      "linea/BaseRegistrarImplementation",
      [registry, namehash("linea.eth")],
    );
    yield* c.write("linea.registry", "setSubnodeOwner", [
      namehash("eth"),
      labelhash("linea"),
      baseRegistrar,
    ]);
    const metadata = yield* c.deploy("linea.metadata", "linea/StaticMetadataService", [
      "https://ensforge.invalid/linea/",
    ]);
    const nameWrapper = yield* c.deploy("linea.nameWrapper", "linea/NameWrapper", [
      registry,
      baseRegistrar,
      metadata,
      namehash("linea.eth"),
      dnsEncode("linea.eth"),
    ]);
    yield* c.write("linea.baseRegistrar", "addController", [nameWrapper]);
    yield* c.write("linea.nameWrapper", "setController", [deployer, true]);
    yield* c.deploy("linea.resolver", "linea/PublicResolver", [
      registry,
      nameWrapper,
      deployer,
      reverseRegistrar,
    ]);
  }),
);

const celonames = step("l2.celonames", (c) =>
  Effect.gen(function* () {
    yield* c.deploy("celonames.registry", "celonames/CeloNames", [
      "Celo Names",
      "CENS",
      "celo.eth",
      namehash("celo.eth"),
      "https://ensforge.invalid/celo/",
    ]);
    yield* c.write("celonames.registry", "setRegistrar", [c.accounts.deployer, true]);
  }),
);

/**
 * ENS's `L2ReverseRegistrar` for the chain's coin type, at its mainnet address
 * (`Deployments.l2ReverseRegistrars`), where addresses set their primary name for the chain. Celo
 * has none. Deployed, then its code (with the coin type) and owner copied to that address.
 */
const l2ReverseRegistrar = (chainId: number) =>
  step("l2.reverseRegistrar", (c) =>
    Effect.gen(function* () {
      const canonical = Deployments.l2ReverseRegistrars[10];
      const deployed = yield* c.deploy(
        "ens.l2ReverseRegistrarDeployment",
        "v1/L2ReverseRegistrar",
        [0x8000_0000n | BigInt(chainId)],
      );
      const code = yield* c.cheat((client) => client.getCode({ address: deployed }));
      const owner = yield* c.cheat((client) =>
        client.getStorageAt({ address: deployed, slot: zeroHash }),
      );
      yield* c.cheat((client) => client.setCode({ address: canonical, bytecode: code ?? "0x" }));
      yield* c.cheat((client) =>
        client.setStorageAt({ address: canonical, index: zeroHash, value: owner ?? zeroHash }),
      );
    }),
  );

/** Each L2 chain's contracts, as deployed on Base, OP Mainnet, Linea and Celo. */
export const l2Steps = {
  base: [multicall, l2ReverseRegistrar(8453), basenames, durin, namespace],
  optimism: [multicall, l2ReverseRegistrar(10), namespace],
  linea: [multicall, l2ReverseRegistrar(59144), linea],
  celo: [multicall, celonames],
} as const satisfies Record<string, readonly Step[]>;
