import type { V2 } from "./types.js";

/**
 * ENSv2 on Ethereum mainnet at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/deployments/mainnet/addresses.md
 * @since 1.0.0
 */
export const mainnetV2 = {
  id: "mainnet-v2",
  chainId: 1,
  protocol: "v2",
  status: "active",
  contracts: {
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
    universalHelper: "0x46AE127D14683Ac74eF151e46ae2117A1A25C676",
    rootRegistry: "0x2553c09bE6447BeFfdB86FA622ad41fB8f77A91e",
    ethRegistry: "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2",
    ethRegistrar: "0xD6D8369e55c94Ae8AFA714E6cF7AB5bE54D5CC81",
    rentPriceOracle: "0x76F29609A363a8A1a2a6abe2e859C0F8916Af469",
    ensV2Resolver: "0x3071AD643cE4Ed8b3D67b289845b45dB82b068A4",
    publicResolver: "0x66f9F566fF2f26309C1Bd9134388478A801dA3e1",
    verifiableFactory: "0x77510ba162dfeA3d8989E3f0928a691B345730D2",
    labelStore: "0x31e5E081fe38d15B3E8214ba5Cb08dC4708B70Ba",
    contractNamer: "0x5cDaF63d4C2a01218149DDe707E5bc239c68730c",
    reverseRegistrarAdapter: "0x349151735790269a9C14668B58D7C83b5ecb9607",
    defaultReverseRegistrarAdapter: "0xd86E32499eCAFe9c181dd7410f93A1a9bB61ef0d",
  },
  implementations: {
    universalResolver: "0x06Fdd07F007ADaC667177b46aB2EB9A75132Cfd5",
    universalResolverV1: "0x804bf0D289C8353a0BaFdAAF9069Ab14C92B2099",
    permissionedResolver: "0x565b0F456a04Ac9b48758190e90030623Cff57C5",
    userRegistry: "0x86013382F943C6214E1433d1e64936F4000925CB",
    wrapperRegistry: "0xe86A4ef4d7A210aAA1d6A9594fC7Add7cD2Cf888",
    contractNamer: "0x87d7CDffAfBe9826D978FBdBE3Ad45E7A4BF3D1C",
  },
  migration: {
    ensV1Resolver: "0x394D8EB4a4fDF599384DeAb25F31d111d755c398",
    ethRenewerV1: "0x56c447F308F463A01121C41E72b0E7e7557fCb68",
    unlockedMigrationController: "0xaB821Ca676CF2e0790Fa273526a165CFa86aEB64",
    // Proxy; the implementation is 0xA292b411677b1Fc136b5AAD6245e93f470c1440c.
    lockedMigrationController: "0x3ceA18620883a69ED349B23328A3B6302598e51A",
    migrationHelper: "0x6c8452AFc6043b5aF32eb345A8135108906F07ee",
    graveyard: "0xDa021A2C1C2F99574D861Ef8c6fA745851BEB7F6",
    publicResolverSet: "0xfFCedA021CBDF20f1a66ebbef32E49d208cAbf62",
    registryUpgradeSet: "0x573A73c0B3C0C90bB8BD728519434aF19Fb88935",
  },
  infrastructure: {
    ensUriRenderer: "0x82CaC0d801b9A392a4fF217D5E68145801E90a41",
    boxedEnsUriRenderer: "0x6f412Ff4144d525f791777d3384e9A1B170492Fb",
    managedUniversalResolverProxy: "0xcFFd2Ae680CD110D28739a70922636B5937b022B",
    batchRegistrar: "0xf0CcfBF6DbA1E01CCB833CED6d551A8F000E9721",
    rootBatchRegistrar: "0xe467Ae049DDd65A21fb85B5f1dE5F7997a8Eb164",
  },
  dns: {
    tldResolver: "0x6695327EE70F41151d2cBADC3ABBb6e4a58e739c",
    aliasResolver: "0x13285e928c65beFd90904F77A68FE4e7D9a43882",
    txtResolver: "0xbB76e2ae1a61Ef91D095eC044ABf563e4C464E3E",
    gatewayProvider: "0xA646BCEE466D77669A087f3379640CB03aCA7c3D",
    temporaryRegistrar: "0x9d6D535f08be25A9A2FdA1a1C21217D27d81cC61",
  },
  hca: {
    ownerAndSessionValidator: "0xa818428ed2F3F949bdc71b8A15bDD7B5D27ce938",
    upgradeSet: "0x85E115F5b43c72e2BA4419a9A95e325dB18431c2",
    standaloneFactory: "0x742bf21897a78e2C98cC5f5C5473A370a081e561",
    standaloneImplementation: "0x116F462FA078ec0009e9b25DCd60309E70aaC4F4",
  },
  // Circle USDC and MakerDAO DAI; both are accepted by the StandardRentPriceOracle.
  paymentTokens: {
    dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  capabilities: {
    resolutionErrorWrapping: true,
    wrapperRegistryInitializer: "fuse-derived",
    wrapperRegistryEmancipation: "role-derived",
    lockedMigrationRenewal: "max-expiry",
    userRegistryUpgradeGate: true,
    hcaSameChainSourceRejected: true,
  },
  provenance: {
    repository: "https://github.com/ensdomains/contracts-v2",
    release: "v1.0.1",
    commit: "5026725d2a927f84de3a3a34b5bfe6cb92ae7cbb",
    builds: {
      default: "solc-0_8_25-b30e6dc9a03b37f6a0b89af5d02a73d3993944f7",
      overrides: {
        DNSAliasResolver: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        DNSTLDResolver: "solc-0_8_25-f08d4bc61ed9e9bddff146bd4fb63ac1accf4c7d",
        ENSV2Resolver: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        HCAOwnerAndSessionValidator: "solc-0_8_27-9e5faa7f2aaf00def424dc2de8100f7e8bd7e87b",
        LockedMigrationController: "solc-0_8_25-68aa1dcb741d645979493e4e0e8f7b39dcadd176",
        MigrationHelper: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        PublicResolverV2: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        StandaloneHCAFactory: "solc-0_8_27-e51afd5290c127e6778adf213718f69c7a91a1b5",
        StandaloneHCAImplementation: "solc-0_8_27-e9867f9d994faa61c5e062d8239de208c0f758a7",
        TemporaryDNSRegistrar: "solc-0_8_25-fcf19106fe185dc46958849e131f353ea380a1be",
        UniversalHelper: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        UniversalResolverV1: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        UniversalResolverV2: "solc-0_8_25-8550fee9a7d7605147b869f3868c3d2bc5861ae7",
        UserRegistryImpl: "solc-0_8_25-f617a676c95a9ce4b7e0ea01d7d2b3ad9a3b9e05",
        WrapperRegistryImpl: "solc-0_8_25-2da803f8458b3fb4227772e3f35a54a402baf88d",
      },
    },
    documentation: "https://docs.ens.domains/learn/deployments/",
  },
} as const satisfies V2;
