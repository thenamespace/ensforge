import { Effect } from "effect";

import { labelhash, namehash, zeroHash } from "viem";

import {
  dnsEncode,
  dnssecAnchors,
  dnsTlds,
  ethLabelhash,
  ethResolverInterfaces,
} from "./constants.ts";
import { step, type Step } from "./engine.ts";

/**
 * ENSv1 at ens-contracts v1.7.0, following its deploy scripts with the `legacy`, `use_root` and
 * `test` tags (as contracts-v2's devnet runs them). `deployer` deploys; `owner` stands in for the
 * DAO. Mainnet-only choices (Chainlink price feed, no BulkRenewal interface) follow mainnet.
 */
export const v1Steps: readonly Step[] = [
  step("v1.registry", (c) =>
    Effect.gen(function* () {
      // The registry ENS replaced in 2020; names created on it stay readable through the fallback.
      const legacy = yield* c.deploy("v1.legacyRegistry", "v1/ENSRegistry");
      yield* c.deploy("v1.registry", "v1/ENSRegistryWithFallback", [legacy]);
    }),
  ),

  step("v1.root", (c) =>
    Effect.gen(function* () {
      const registry = yield* c.address("v1.registry");
      const root = yield* c.deploy("v1.root", "v1/Root", [registry]);
      const rootSecurityController = yield* c.deploy(
        "v1.rootSecurityController",
        "v1/RootSecurityController",
        [root],
      );
      yield* c.write("v1.rootSecurityController", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.registry", "setOwner", [zeroHash, root]);
      yield* c.write("v1.root", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.root", "setController", [c.accounts.owner, true], { from: "owner" });
      yield* c.write("v1.root", "setController", [rootSecurityController, true], {
        from: "owner",
      });
    }),
  ),

  // Before NameWrapper, PublicResolver and UniversalResolver: their constructors claim their
  // reverse names through the owner of `addr.reverse`.
  step("v1.reverseRegistrar", (c) =>
    Effect.gen(function* () {
      const registry = yield* c.address("v1.registry");
      const reverseRegistrar = yield* c.deploy("v1.reverseRegistrar", "v1/ReverseRegistrar", [
        registry,
      ]);
      yield* c.write("v1.reverseRegistrar", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.root", "setSubnodeOwner", [labelhash("reverse"), c.accounts.owner], {
        from: "owner",
      });
      yield* c.write(
        "v1.registry",
        "setSubnodeOwner",
        [namehash("reverse"), labelhash("addr"), reverseRegistrar],
        { from: "owner" },
      );
    }),
  ),

  step("v1.baseRegistrar", (c) =>
    Effect.gen(function* () {
      const registry = yield* c.address("v1.registry");
      const registrar = yield* c.deploy("v1.baseRegistrar", "v1/BaseRegistrarImplementation", [
        registry,
        namehash("eth"),
      ]);
      const securityController = yield* c.deploy(
        "v1.registrarSecurityController",
        "v1/RegistrarSecurityController",
        [registrar],
      );
      yield* c.write("v1.registrarSecurityController", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.baseRegistrar", "transferOwnership", [securityController]);
      yield* c.write("v1.root", "setSubnodeOwner", [ethLabelhash, registrar], { from: "owner" });
    }),
  ),

  step("v1.ethResolver", (c) =>
    Effect.gen(function* () {
      const resolver = yield* c.deploy("v1.ethOwnedResolver", "v1/OwnedResolver");
      yield* c.write("v1.ethOwnedResolver", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.registrarSecurityController", "setRegistrarResolver", [resolver], {
        from: "owner",
      });
    }),
  ),

  step("v1.priceOracle", (c) =>
    Effect.gen(function* () {
      // Stands in for Chainlink's ETH/USD feed: $1600 with 8 decimals.
      const usdOracle = yield* c.deploy("v1.usdOracle", "v1/DummyOracle", [160_000_000_000n]);
      yield* c.deploy("v1.priceOracle", "v1/ExponentialPremiumPriceOracle", [
        usdOracle,
        [0n, 0n, 20_294_266_869_609n, 5_073_566_717_402n, 158_548_959_919n],
        100_000_000_000_000_000_000_000_000n,
        21n,
      ]);
    }),
  ),

  step("v1.nameWrapper", (c) =>
    Effect.gen(function* () {
      const metadata = yield* c.deploy("v1.staticMetadataService", "v1/StaticMetadataService", [
        "ens-metadata-service.appspot.com/name/0x{id}",
      ]);
      const nameWrapper = yield* c.deploy("v1.nameWrapper", "v1/NameWrapper", [
        yield* c.address("v1.registry"),
        yield* c.address("v1.baseRegistrar"),
        metadata,
      ]);
      yield* c.write("v1.nameWrapper", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.registrarSecurityController", "addRegistrarController", [nameWrapper], {
        from: "owner",
      });
      yield* c.write(
        "v1.ethOwnedResolver",
        "setInterface",
        [namehash("eth"), ethResolverInterfaces.nameWrapper, nameWrapper],
        { from: "owner" },
      );
    }),
  ),

  step("v1.wrappedEthRegistrarController", (c) =>
    Effect.gen(function* () {
      const controller = yield* c.deploy(
        "v1.wrappedEthRegistrarController",
        "v1/WrappedETHRegistrarController",
        [
          yield* c.address("v1.baseRegistrar"),
          yield* c.address("v1.priceOracle"),
          60n,
          86_400n,
          yield* c.address("v1.reverseRegistrar"),
          yield* c.address("v1.nameWrapper"),
          yield* c.address("v1.registry"),
        ],
      );
      yield* c.write("v1.wrappedEthRegistrarController", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.nameWrapper", "setController", [controller, true], { from: "owner" });
      yield* c.write("v1.registrarSecurityController", "addRegistrarController", [controller], {
        from: "owner",
      });
      yield* c.write("v1.reverseRegistrar", "setController", [controller, true], {
        from: "owner",
      });
      yield* c.write(
        "v1.ethOwnedResolver",
        "setInterface",
        [namehash("eth"), ethResolverInterfaces.wrappedEthRegistrarController, controller],
        { from: "owner" },
      );
    }),
  ),

  step("v1.ethRegistrarController", (c) =>
    Effect.gen(function* () {
      const defaultReverseRegistrar = yield* c.deploy(
        "v1.defaultReverseRegistrar",
        "v1/DefaultReverseRegistrar",
      );
      yield* c.write("v1.defaultReverseRegistrar", "transferOwnership", [c.accounts.owner]);
      const controller = yield* c.deploy("v1.ethRegistrarController", "v1/ETHRegistrarController", [
        yield* c.address("v1.baseRegistrar"),
        yield* c.address("v1.priceOracle"),
        60n,
        86_400n,
        yield* c.address("v1.reverseRegistrar"),
        defaultReverseRegistrar,
        yield* c.address("v1.registry"),
      ]);
      yield* c.write("v1.ethRegistrarController", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.registrarSecurityController", "addRegistrarController", [controller], {
        from: "owner",
      });
      yield* c.write("v1.reverseRegistrar", "setController", [controller, true], {
        from: "owner",
      });
      yield* c.write("v1.defaultReverseRegistrar", "setController", [controller, true], {
        from: "owner",
      });
      yield* c.write(
        "v1.ethOwnedResolver",
        "setInterface",
        [namehash("eth"), ethResolverInterfaces.ethRegistrarController, controller],
        { from: "owner" },
      );
      // Not registered on the `.eth` resolver, as on mainnet.
      yield* c.deploy("v1.bulkRenewal", "v1/StaticBulkRenewal", [controller]);
    }),
  ),

  step("v1.publicResolver", (c) =>
    Effect.gen(function* () {
      const resolver = yield* c.deploy("v1.publicResolver", "v1/PublicResolver", [
        yield* c.address("v1.registry"),
        yield* c.address("v1.nameWrapper"),
        yield* c.address("v1.ethRegistrarController"),
        yield* c.address("v1.reverseRegistrar"),
      ]);
      yield* c.write("v1.reverseRegistrar", "setDefaultResolver", [resolver], { from: "owner" });
    }),
  ),

  step("v1.defaultReverseResolver", (c) =>
    Effect.gen(function* () {
      const resolver = yield* c.deploy("v1.defaultReverseResolver", "v1/DefaultReverseResolver", [
        yield* c.address("v1.defaultReverseRegistrar"),
      ]);
      yield* c.write("v1.registry", "setResolver", [namehash("reverse"), resolver], {
        from: "owner",
      });
    }),
  ),

  step("v1.dnssec", (c) =>
    Effect.gen(function* () {
      const algorithms = {
        rsaSha1: yield* c.deploy("v1.dnssec.rsaSha1", "v1/RSASHA1Algorithm"),
        rsaSha256: yield* c.deploy("v1.dnssec.rsaSha256", "v1/RSASHA256Algorithm"),
        p256Sha256: yield* c.deploy("v1.dnssec.p256Sha256", "v1/P256SHA256Algorithm"),
        dummy: yield* c.deploy("v1.dnssec.dummyAlgorithm", "v1/DummyAlgorithm"),
      };
      const digests = {
        sha1: yield* c.deploy("v1.dnssec.sha1", "v1/SHA1Digest"),
        sha256: yield* c.deploy("v1.dnssec.sha256", "v1/SHA256Digest"),
        dummy: yield* c.deploy("v1.dnssec.dummyDigest", "v1/DummyDigest"),
      };
      yield* c.deploy("v1.dnssecOracle", "v1/DNSSECImpl", [dnssecAnchors]);

      for (const [id, algorithm] of [
        [5, algorithms.rsaSha1],
        [7, algorithms.rsaSha1],
        [8, algorithms.rsaSha256],
        [13, algorithms.p256Sha256],
        [253, algorithms.dummy],
        [254, algorithms.dummy],
      ] as const) {
        yield* c.write("v1.dnssecOracle", "setAlgorithm", [id, algorithm]);
      }
      for (const [id, digest] of [
        [1, digests.sha1],
        [2, digests.sha256],
        [253, digests.dummy],
      ] as const) {
        yield* c.write("v1.dnssecOracle", "setDigest", [id, digest]);
      }
    }),
  ),

  step("v1.dns", (c) =>
    Effect.gen(function* () {
      const registry = yield* c.address("v1.registry");
      const dnssec = yield* c.address("v1.dnssecOracle");
      const offchainResolver = yield* c.deploy("v1.offchainDnsResolver", "v1/OffchainDNSResolver", [
        registry,
        dnssec,
        "https://dnssec-oracle.ens.domains/",
      ]);
      const suffixes = yield* c.deploy("v1.publicSuffixList", "v1/SimplePublicSuffixList");
      yield* c.write("v1.publicSuffixList", "transferOwnership", [c.accounts.owner]);
      yield* c.write("v1.publicSuffixList", "addPublicSuffixes", [dnsTlds.map(dnsEncode)], {
        from: "owner",
      });

      const dnsRegistrar = yield* c.deploy("v1.dnsRegistrar", "v1/DNSRegistrar", [
        "0x0000000000000000000000000000000000000000",
        offchainResolver,
        dnssec,
        suffixes,
        registry,
      ]);
      yield* c.write("v1.root", "setController", [dnsRegistrar, true], { from: "owner" });
      for (const tld of dnsTlds) yield* c.write("v1.dnsRegistrar", "enableNode", [dnsEncode(tld)]);

      yield* c.deploy("v1.extendedDnsResolver", "v1/ExtendedDNSResolver");
    }),
  ),

  step("v1.universalResolver", (c) =>
    Effect.gen(function* () {
      // viem answers `x-batch-gateway:true` locally, so CCIP-Read batches need no server.
      const gateways = yield* c.deploy("v1.batchGatewayProvider", "v1/BatchGatewayProvider", [
        c.accounts.owner,
        ["x-batch-gateway:true"],
      ]);
      yield* c.deploy("v1.universalResolver", "v1/UniversalResolver", [
        c.accounts.owner,
        yield* c.address("v1.registry"),
        gateways,
      ]);
      yield* c.deploy("v1.migrationHelper", "v1/MigrationHelper", [
        yield* c.address("v1.baseRegistrar"),
        yield* c.address("v1.nameWrapper"),
      ]);
      yield* c.write("v1.migrationHelper", "transferOwnership", [c.accounts.owner]);
    }),
  ),
];
