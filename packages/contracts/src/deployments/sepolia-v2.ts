import type { V2 } from "./types.js";

/**
 * ENSv2 on Sepolia at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/deployments/sepolia/addresses.md
 * @since 1.0.0
 */
export const sepoliaV2 = {
  id: "sepolia-v2",
  chainId: 11155111,
  protocol: "v2",
  status: "active",
  contracts: {
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
    universalHelper: "0xd453e5Bdb62CC3beA84341B1e306319C8Ffd7DFe",
    rootRegistry: "0xB458D6a3a77919449d03e7A6903C26827c1eC43f",
    ethRegistry: "0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4",
    ethRegistrar: "0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3",
    rentPriceOracle: "0x8196665D4ca7488B6474a9EC8E7d2719FB42263A",
    ensV2Resolver: "0x1cF3989ED3E5EC3cB1d731fC3777323813b61aCf",
    publicResolver: "0xdC4a563d00F5c3012b699794eB9e13A561Be386F",
    verifiableFactory: "0xDa70306C98E97eCe36F997a21368e53298572991",
    labelStore: "0xed8246FF02203a4d4cb262bD78bEAA7408A57cAE",
    contractNamer: "0x606f2453484f4Fa85b6E5FDB0E0bf777064bf9F3",
    reverseRegistrarAdapter: "0x56Bce5E727FAa9D237341Bb5B9E8a03D5919779d",
    defaultReverseRegistrarAdapter: "0x36f97328e843e37520cbF530e9402791c2754066",
  },
  implementations: {
    universalResolver: "0x24E1D8e068620B647CA097f961A61055f4f42D72",
    permissionedResolver: "0x115eb53F0c60696633855F90b138178Fb40b2b2C",
    userRegistry: "0x0822d199699f0a9D378617817a1439663234a126",
    wrapperRegistry: "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880",
    contractNamer: "0x4b8263BE7c522d8Fb3FBcA1F74B9C6e083B8D3e4",
  },
  migration: {
    ensV1Resolver: "0x322B7581cA210a69c6D0e0D7c88a7688D2789Cb0",
    ethRenewerV1: "0xf2ece44980778966b8a0FccB3A9E339440f6e045",
    unlockedMigrationController: "0x2a35B94DF22cc7354570be2284655E2CDC0e64A2",
    lockedMigrationController: "0x6029a063d69b09D23c52a754a90E4FE43aDac3A8",
    migrationHelper: "0xA8F86EE5cdD28703bd876F3a8c10B1DE70f36899",
    graveyard: "0xB58A90a39D13CcE1D0E192B5da5c47640855B04D",
    publicResolverSet: "0x5B2bd5208dac31905106d8e5a4973Ae1Cd7414F2",
    registryUpgradeSet: "0xF0a6f68c28603bDF2881Ca17476Ee477C72cD2fE",
  },
  infrastructure: {
    ensUriRenderer: "0x4D7f0349DfFB8e7BeD9fFBA1B9e45f7ECBD4f0f8",
    boxedEnsUriRenderer: "0x0f5B101b6Fc626b9b210bB5E70f60F3dd9cA0d96",
    managedUniversalResolverProxy: "0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1",
    batchRegistrar: "0x4A4c8B7CDAB6B19dc2CdB417cdB53a2ccBaf5322",
    rootBatchRegistrar: "0x4CDEDc6B514A6bc9B64854DfE2D6849D5B1369a6",
  },
  dns: {
    tldResolver: "0x0c9F5E9AE61165140b49919F0dF13C0a6642e80d",
    aliasResolver: "0xe30c9374929De41b71b6fb999B945553F2194c5F",
    txtResolver: "0x00263173B7De91594Eb4140Ad8dD3a723B8e4EB3",
    gatewayProvider: "0xd542a53982FDd0c456F02c5a54734c06073fA915",
  },
  hca: {
    ownerAndSessionValidator: "0x4bF641590ab18E31B9F8789A3417A2620f860466",
    upgradeSet: "0xCde956D6E2949Bc25a4273F93E0db6f68A1a6f34",
    standaloneFactory: "0x6Bad0176236e97b346B5Dd13BCc8325B931EE8ab",
    standaloneImplementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    intentExecutor: "0x00000000005aD9ce1f5035FD62CA96CEf16AdAAF",
    gasRefundPaymaster: "0x1d7df6Ddc7328Ac827EB4D7f171C60AFB7f9A599",
  },
  paymentTokens: {
    dai: "0xF6faC8A58a0BE13b9197f27C41B73162Fe32572b",
    usdc: "0x240b0316Df57887DBBE58b586508b19e633a14aa",
  },
  capabilities: {
    resolutionErrorWrapping: false,
    wrapperRegistryInitializer: "explicit",
    wrapperRegistryEmancipation: "static",
    lockedMigrationRenewal: "renew-role",
    userRegistryUpgradeGate: true,
    hcaSameChainSourceRejected: false,
    hcaSessionDomain: "smart-session",
    hcaContractOwners: false,
  },
  provenance: {
    repository: "https://github.com/ensdomains/contracts-v2",
    release: "v1.0.1",
    commit: "5026725d2a927f84de3a3a34b5bfe6cb92ae7cbb",
    builds: {
      default: "solc-0_8_25-b30e6dc9a03b37f6a0b89af5d02a73d3993944f7",
      overrides: {
        HCAOwnerAndSessionValidator: "solc-0_8_27-5e229574866dd7aad4c35188fd51d13486a8e622",
        StandaloneHCAFactory: "solc-0_8_27-e51afd5290c127e6778adf213718f69c7a91a1b5",
        StandaloneHCAImplementation: "solc-0_8_27-e9867f9d994faa61c5e062d8239de208c0f758a7",
        UserRegistryImpl: "solc-0_8_25-f617a676c95a9ce4b7e0ea01d7d2b3ad9a3b9e05",
        WrapperRegistryImpl: "solc-0_8_25-16de2606e983b3868bbbce69be4591c8163e397e",
      },
    },
    documentation: "https://docs.ens.domains/learn/deployments/",
  },
} as const satisfies V2;
