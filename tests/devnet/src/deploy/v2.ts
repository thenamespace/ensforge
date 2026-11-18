import { Array as Arr, Effect } from "effect";

import { encodeFunctionData, maxUint64, zeroAddress } from "viem";

import { loadArtifact } from "../artifacts/files.ts";
import {
  deploymentRoles,
  dnsTlds,
  gracePeriodV2,
  premigrationBonusPeriod,
  rentPricing,
  secondsPerDay,
} from "./constants.ts";
import { step, type Step } from "./engine.ts";

/**
 * ENSv2 at contracts-v2 v1.0.1, following its deploy scripts with the `local` tag, on the live
 * mainnet build of each contract (the UserRegistryImpl from `post-audit-2`). Roles are granted at deploy time (upstream's greenfield devnet);
 * mainnet's later hand-over is `cutoverSteps`. Needs the ENSv1 steps.
 */
export const v2Steps: readonly Step[] = [
  step("v2.foundation", (c) =>
    Effect.gen(function* () {
      const implementation = yield* c.deploy(
        "v2.contractNamerImplementation",
        "v2/ContractNamerImplementation",
      );
      const { abi } = yield* loadArtifact("v2/ContractNamerImplementation");
      const namer = yield* c.deploy("v2.contractNamer", "v2/ContractNamerProxy", [
        implementation,
        encodeFunctionData({ abi, functionName: "initialize", args: [c.accounts.owner] }),
      ]);
      yield* c.deploy("v2.labelStore", "v2/LabelStore", [namer]);
      const renderer = yield* c.deploy("v2.ensUriRenderer", "v2/ENSURIRenderer", [
        c.accounts.owner,
        "https://metadata.ens.domains/devnet/0x",
        "/",
        ".json",
      ]);
      yield* c.deploy("v2.boxedEnsUriRenderer", "v2/BoxedENSURIRenderer", [
        c.accounts.owner,
        renderer,
      ]);
      yield* c.deploy("v2.verifiableFactory", "v2/VerifiableFactory");
      yield* c.deploy("v2.registryUpgradeSet", "v2/RegistryUpgradeSet", [c.accounts.owner]);
      yield* c.deploy("v2.usdc", "v2/MockERC20", ["USDC", 6]);
      yield* c.deploy("v2.dai", "v2/MockERC20", ["DAI", 18]);
    }),
  ),

  step("v2.registries", (c) =>
    Effect.gen(function* () {
      const labelStore = yield* c.address("v2.labelStore");
      const renderer = yield* c.address("v2.ensUriRenderer");
      const root = yield* c.deploy("v2.rootRegistry", "v2/RootRegistry", [
        labelStore,
        c.accounts.deployer,
        deploymentRoles.rootRegistryRoot,
      ]);
      yield* c.write("v2.rootRegistry", "setURI", ["", renderer]);
      yield* c.write("v2.rootRegistry", "grantRootRoles", [
        deploymentRoles.registryManager,
        c.accounts.owner,
      ]);

      const eth = yield* c.deploy("v2.ethRegistry", "v2/ETHRegistry", [
        labelStore,
        c.accounts.deployer,
        deploymentRoles.ethRegistryRoot,
      ]);
      yield* c.write("v2.rootRegistry", "register", [
        "eth",
        c.accounts.deployer,
        eth,
        zeroAddress,
        deploymentRoles.rootNameToken,
        maxUint64,
      ]);
      yield* c.write("v2.ethRegistry", "setParent", [root, "eth"]);
      yield* c.write("v2.ethRegistry", "setURI", ["", renderer]);
      yield* c.write("v2.ethRegistry", "grantRootRoles", [
        deploymentRoles.registryManager,
        c.accounts.owner,
      ]);
    }),
  ),

  step("v2.resolvers", (c) =>
    Effect.gen(function* () {
      const namer = yield* c.address("v2.contractNamer");
      const root = yield* c.address("v2.rootRegistry");
      const gateways = yield* c.address("v1.batchGatewayProvider");
      yield* c.deploy("v2.dnssecGatewayProvider", "v2/DNSSECGatewayProvider", [
        c.accounts.owner,
        ["https://dnssec-oracle.ens.domains/"],
      ]);
      yield* c.deploy("v2.dnsTxtResolver", "v2/DNSTXTResolver", [namer]);
      const ensV1Resolver = yield* c.deploy("v2.ensV1Resolver", "v2/ENSV1Resolver", [
        gateways,
        namer,
        yield* c.address("v1.registry"),
      ]);
      const ensV2Resolver = yield* c.deploy("v2.ensV2Resolver", "v2/ENSV2Resolver", [
        gateways,
        namer,
        root,
        yield* c.address("v1.ethOwnedResolver"),
      ]);
      // ENSv1 `.eth` resolves through ENSv2 from here on; `eth` itself falls back to the
      // OwnedResolver.
      yield* c.write("v1.registrarSecurityController", "setRegistrarResolver", [ensV2Resolver], {
        from: "owner",
      });
      yield* c.write("v2.rootRegistry", "register", [
        "reverse",
        c.accounts.deployer,
        zeroAddress,
        ensV1Resolver,
        deploymentRoles.rootNameToken,
        maxUint64,
      ]);
      yield* c.deploy("v2.dnsAliasResolver", "v2/DNSAliasResolver", [root, gateways, namer]);
    }),
  ),

  step("v2.dns", (c) =>
    Effect.gen(function* () {
      const root = yield* c.address("v2.rootRegistry");
      // Sepolia's older build also takes ENSv1's DNS TLD resolver.
      const tldResolver = yield* c.deploy("v2.dnsTldResolver", "v2/DNSTLDResolver", [
        yield* c.address("v1.registry"),
        ...(c.network === "sepolia" ? [yield* c.address("v1.offchainDnsResolver")] : []),
        root,
        yield* c.address("v1.dnssecOracle"),
        yield* c.address("v2.dnssecGatewayProvider"),
        yield* c.address("v1.batchGatewayProvider"),
        yield* c.address("v2.contractNamer"),
      ]);
      // DNS TLDs are reserved on the root (no owner) and resolved by the TLD resolver.
      const batchRegistrar = yield* c.deploy("v2.rootBatchRegistrar", "v2/BatchRegistrar", [
        root,
        c.accounts.deployer,
      ]);
      yield* c.write("v2.rootRegistry", "grantRootRoles", [
        deploymentRoles.batchRegistrar,
        batchRegistrar,
      ]);
      yield* c.write("v2.rootBatchRegistrar", "batchRegister", [
        zeroAddress,
        tldResolver,
        [...dnsTlds],
        Arr.map(dnsTlds, () => maxUint64),
      ]);
      yield* c.write("v2.rootRegistry", "revokeRootRoles", [
        deploymentRoles.batchRegistrar,
        batchRegistrar,
      ]);

      const temporaryRegistrar = yield* c.deploy(
        "v2.temporaryDnsRegistrar",
        "v2/TemporaryDNSRegistrar",
        [
          c.accounts.owner,
          root,
          c.accounts.owner,
          yield* c.address("v1.publicSuffixList"),
          tldResolver,
        ],
      );
      yield* c.write("v2.rootRegistry", "grantRootRoles", [
        deploymentRoles.temporaryDnsRegistrar,
        temporaryRegistrar,
      ]);
    }),
  ),

  step("v2.implementations", (c) =>
    Effect.gen(function* () {
      const namer = yield* c.address("v2.contractNamer");
      const nameWrapper = yield* c.address("v1.nameWrapper");
      yield* c.deploy("v2.permissionedResolverImplementation", "v2/PermissionedResolverImpl", [
        c.accounts.owner,
      ]);
      // The live mainnet builds name their registries through the ContractNamer. As on mainnet,
      // the current implementation accepts no upgrades from the v1.0.1 one (`upgradeable` is
      // empty) and neither is in the upgrade set; registries made before keep the older one.
      const userRegistryArguments = [
        yield* c.address("v2.labelStore"),
        namer,
        yield* c.address("v2.registryUpgradeSet"),
        [],
        yield* c.address("v2.boxedEnsUriRenderer"),
      ];
      yield* c.deploy(
        "v2.userRegistryImplementationV1_0_1",
        "v2/UserRegistryImplV1_0_1",
        userRegistryArguments,
      );
      yield* c.deploy(
        "v2.userRegistryImplementation",
        "v2/UserRegistryImpl",
        userRegistryArguments,
      );
      yield* c.deploy("v2.graveyard", "v2/Graveyard", [nameWrapper, namer]);
      yield* c.deploy("v2.publicResolver", "v2/PublicResolverV2", [
        nameWrapper,
        yield* c.address("v2.rootRegistry"),
        namer,
      ]);
      yield* c.deploy("v2.publicResolverSet", "v2/PublicResolverSet", [c.accounts.owner]);
      yield* c.write(
        "v2.publicResolverSet",
        "approve",
        [yield* c.address("v1.publicResolver"), true],
        { from: "owner" },
      );
    }),
  ),

  step("v2.registrar", (c) =>
    Effect.gen(function* () {
      const ethRegistry = yield* c.address("v2.ethRegistry");
      const oracle = yield* c.deploy("v2.rentPriceOracle", "v2/StandardRentPriceOracle", [
        c.accounts.owner,
        rentPricing.baseRatePerCodePoint,
        rentPricing.discountPoints,
        rentPricing.discountDenominator,
        rentPricing.premiumPriceInitial,
        rentPricing.premiumHalvingPeriod,
        rentPricing.premiumPeriod,
        [
          { paymentToken: yield* c.address("v2.usdc"), ...rentPricing.paymentRatio(6) },
          { paymentToken: yield* c.address("v2.dai"), ...rentPricing.paymentRatio(18) },
        ],
      ]);
      // Fees go to the owner, as on upstream's devnet.
      const registrar = yield* c.deploy("v2.ethRegistrar", "v2/ETHRegistrar", [
        c.accounts.owner,
        ethRegistry,
        c.accounts.owner,
        oracle,
        gracePeriodV2,
        60n,
        secondsPerDay,
        28n * secondsPerDay,
      ]);
      yield* c.write("v2.ethRegistry", "grantRootRoles", [deploymentRoles.ethRegistrar, registrar]);

      const renewer = yield* c.deploy("v2.ethRenewerV1", "v2/ETHRenewerV1", [
        c.accounts.owner,
        ethRegistry,
        c.accounts.owner,
        oracle,
        gracePeriodV2,
        premigrationBonusPeriod,
        yield* c.address("v1.nameWrapper"),
        yield* c.address("v1.wrappedEthRegistrarController"),
      ]);
      yield* c.write("v2.ethRegistry", "grantRootRoles", [deploymentRoles.ethRenewerV1, renewer]);
    }),
  ),

  step("v2.migration", (c) =>
    Effect.gen(function* () {
      const namer = yield* c.address("v2.contractNamer");
      const nameWrapper = yield* c.address("v1.nameWrapper");
      const graveyard = yield* c.address("v2.graveyard");
      const ethRegistry = yield* c.address("v2.ethRegistry");
      const verifiableFactory = yield* c.address("v2.verifiableFactory");
      const unlocked = yield* c.deploy(
        "v2.unlockedMigrationController",
        "v2/UnlockedMigrationController",
        [nameWrapper, graveyard, ethRegistry, namer],
      );
      yield* c.write("v2.ethRegistry", "grantRootRoles", [
        deploymentRoles.migrationController,
        unlocked,
      ]);

      // Mainnet's WrapperRegistry build (before contracts-v2 #496): positional constructor,
      // named by the owner.
      const wrapperRegistry = yield* c.deploy(
        "v2.wrapperRegistryImplementation",
        "v2/WrapperRegistryImpl",
        [
          nameWrapper,
          graveyard,
          verifiableFactory,
          yield* c.address("v2.ensV1Resolver"),
          yield* c.address("v2.registryUpgradeSet"),
          yield* c.address("v2.labelStore"),
          yield* c.address("v2.boxedEnsUriRenderer"),
          yield* c.address("v2.publicResolverSet"),
          yield* c.address("v2.publicResolver"),
          c.accounts.owner,
        ],
      );
      const lockedArguments = [
        nameWrapper,
        graveyard,
        ethRegistry,
        verifiableFactory,
        wrapperRegistry,
        yield* c.address("v2.publicResolverSet"),
        yield* c.address("v2.publicResolver"),
        namer,
      ];
      // Mainnet's controller sits behind an EIP-173 proxy; Sepolia's is deployed directly.
      const locked =
        c.network === "sepolia"
          ? yield* c.deploy(
              "v2.lockedMigrationController",
              "v2/LockedMigrationControllerImplementation",
              lockedArguments,
            )
          : yield* c.deploy("v2.lockedMigrationController", "v2/LockedMigrationControllerProxy", [
              yield* c.deploy(
                "v2.lockedMigrationControllerImplementation",
                "v2/LockedMigrationControllerImplementation",
                lockedArguments,
              ),
              c.accounts.owner,
              "0x",
            ]);
      yield* c.write("v2.ethRegistry", "grantRootRoles", [
        deploymentRoles.migrationController,
        locked,
      ]);

      const batchRegistrar = yield* c.deploy("v2.batchRegistrar", "v2/BatchRegistrar", [
        ethRegistry,
        c.accounts.deployer,
      ]);
      yield* c.write("v2.ethRegistry", "grantRootRoles", [
        deploymentRoles.batchRegistrar,
        batchRegistrar,
      ]);
    }),
  ),
];

/** Resolution and the public Universal Resolver proxy chain, after the HCA steps. */
export const v2ResolutionSteps: readonly Step[] = [
  step("v2.migrationHelper", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("v2.migrationHelper", "v2/MigrationHelper", [
        yield* c.address("v2.rootRegistry"),
        yield* c.address("v2.unlockedMigrationController"),
        yield* c.address("v2.lockedMigrationController"),
        yield* c.address("hca.standaloneFactory"),
        yield* c.address("v2.contractNamer"),
      ]);
    }),
  ),

  step("v2.universalResolver", (c) =>
    Effect.gen(function* () {
      const root = yield* c.address("v2.rootRegistry");
      const namer = yield* c.address("v2.contractNamer");
      const gateways = yield* c.address("v1.batchGatewayProvider");
      const v1UniversalResolver = yield* c.address("v1.universalResolver");
      yield* c.deploy("v2.universalHelper", "v2/UniversalHelper", [root, namer]);
      const implementation = yield* c.deploy(
        "v2.universalResolverImplementation",
        "v2/UniversalResolverV2",
        [root, gateways, namer],
      );
      yield* c.deploy("v2.universalResolverV1", "v2/UniversalResolverV1", [
        c.accounts.owner,
        yield* c.address("v1.registry"),
        gateways,
      ]);

      // As on mainnet: the public proxy (DAO-administered) points at the ENS-managed proxy, which
      // points at the implementation; both start on ENSv1's Universal Resolver.
      yield* c.deploy("v2.universalResolver", "v2/UpgradableUniversalResolverProxy", [
        c.accounts.owner,
        v1UniversalResolver,
      ]);
      const managed = yield* c.deploy(
        "v2.managedUniversalResolverProxy",
        "v2/ManagedUniversalResolverProxy",
        [c.accounts.owner, v1UniversalResolver],
      );
      yield* c.write("v2.universalResolver", "upgradeTo", [managed], { from: "owner" });
      yield* c.write("v2.managedUniversalResolverProxy", "upgradeTo", [implementation], {
        from: "owner",
      });
    }),
  ),
];
