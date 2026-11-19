import type {
  BasenamesContracts,
  CelonamesContracts,
  DurinDeployment,
  LineaContracts,
  NamespaceDeployment,
  NamespaceFamily,
  OffchainProvider,
  ParentNamespace,
} from "./namespace-types.js";

const ninetyDays = 7_776_000;

/**
 * Basenames: `base.eth` names on Base, `basetest.eth` names on Base Sepolia.
 *
 * @stability stable
 * @since 1.1.0
 */
export const basenames = {
  id: "basenames",
  stability: "stable",
  repository: "https://github.com/base/basenames",
  mainnet: {
    parent: "base.eth",
    ensChainId: 1,
    chainId: 8453,
    l1Resolver: "0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31",
    gracePeriod: ninetyDays,
    contracts: {
      registry: "0xB94704422c2a1E396835A571837Aa5AE53285a95",
      baseRegistrar: "0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a",
      resolver: "0x426fA03fB86E510d0Dd9F70335Cf102a98b10875",
      legacyResolver: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
    },
  },
  testnet: {
    parent: "basetest.eth",
    ensChainId: 11155111,
    chainId: 84532,
    l1Resolver: "0x084D10C07EfEecD9fFc73DEb38ecb72f9eEb65aB",
    gracePeriod: ninetyDays,
    contracts: {
      registry: "0x1493b2567056c2181630115660963E13A8E32735",
      baseRegistrar: "0xA0c70ec36c010B55E3C434D6c6EbEEC50c705794",
      resolver: "0x85C87e548091f204C2d0350b39ce1874f02197c6",
      legacyResolver: "0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA",
    },
  },
} as const satisfies NamespaceFamily<"basenames", ParentNamespace<BasenamesContracts>>;

/**
 * Linea Names: `linea.eth` names on Linea, `linea-sepolia.eth` names on Linea Sepolia.
 *
 * @stability stable
 * @since 1.1.0
 */
export const linea = {
  id: "linea",
  stability: "stable",
  repository: "https://github.com/Consensys/linea-ens",
  mainnet: {
    parent: "linea.eth",
    ensChainId: 1,
    chainId: 59144,
    l1Resolver: "0x1507cE9421232FDBd302f5EbE4590F8D77FeBBFF",
    gracePeriod: ninetyDays,
    contracts: {
      registry: "0x50130b669B28C339991d8676FA73CF122a121267",
      baseRegistrar: "0x6e84390dCc5195414eC91A8c56A5c91021B95704",
      nameWrapper: "0xA53cca02F98D590819141Aa85C891e2Af713C223",
      resolver: "0x86c5AED9F27837074612288610fB98ccC1733126",
    },
  },
  testnet: {
    parent: "linea-sepolia.eth",
    ensChainId: 11155111,
    chainId: 59141,
    l1Resolver: "0xb4B2748f543265E7E0d471F5d1BDa81Da4e74624",
    gracePeriod: ninetyDays,
    contracts: {
      registry: "0x5B2636F0f2137B4aE722C01dd5122D7d3e9541f7",
      baseRegistrar: "0x83475a84C0ea834F06c8e636A62631e7d2e07A44",
      nameWrapper: "0xF127De9E039a789806fEd4C6b1C0f3aFfeA9425e",
      resolver: "0xA2008916Ed2d7ED0Ecd747a8a5309267e42cf1f1",
    },
  },
} as const satisfies NamespaceFamily<"linea", ParentNamespace<LineaContracts>>;

/**
 * Celonames: `celo.eth` names on Celo. There is no testnet deployment.
 *
 * @stability stable
 * @since 1.1.0
 */
export const celonames = {
  id: "celonames",
  stability: "stable",
  repository: "https://github.com/thenamespace/celo-names",
  mainnet: {
    parent: "celo.eth",
    ensChainId: 1,
    chainId: 42220,
    l1Resolver: "0xC6FC912C5DACb6BF0a24Bad113493c900fEA254a",
    // Names have no grace period: `ownerOf` reverts once they expire.
    gracePeriod: 0,
    contracts: { registry: "0x4d7912779679AFdC592CBd4674b32Fcb189395F7" },
  },
} as const satisfies NamespaceFamily<"celonames", ParentNamespace<CelonamesContracts>>;

const durinFactory = "0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d";
const durinRegistryImplementation = "0xdeB09eB3111cB75d538216e8B8fC30047d75fb34";
const durinL1Resolver = "0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61";

/**
 * Durin: ENS Labs' L2 registries, which any second-level name can use. Durin is experimental
 * upstream, so its contracts may still change.
 *
 * @stability experimental
 * @since 1.1.0
 */
export const durin = {
  id: "durin",
  stability: "experimental",
  repository: "https://github.com/ensdomains/durin",
  mainnet: {
    ensChainId: 1,
    l1Resolver: durinL1Resolver,
    factory: durinFactory,
    registryImplementation: durinRegistryImplementation,
    // Base, OP Mainnet, Arbitrum One, Linea, Scroll, Polygon, Celo, World Chain.
    chainIds: [8453, 10, 42161, 59144, 534352, 137, 42220, 480],
  },
  testnet: {
    ensChainId: 11155111,
    l1Resolver: durinL1Resolver,
    factory: durinFactory,
    registryImplementation: durinRegistryImplementation,
    chainIds: [84532, 11155420, 421614, 59141, 534351, 80002, 11142220, 4801],
  },
} as const satisfies NamespaceFamily<"durin", DurinDeployment>;

/**
 * Namespace L2 subnames on Base and OP Mainnet, and on Base Sepolia. Addresses from
 * `@thenamespace/addresses` 1.3.0.
 *
 * @stability stable
 * @since 1.1.0
 */
export const namespace = {
  id: "namespace",
  stability: "stable",
  repository: "https://github.com/thenamespace/contracts",
  mainnet: {
    ensChainId: 1,
    hybridResolvers: {
      current: "0xe5A0277018879679d18cCDb66B52BD06f7fE95FD",
      previous: "0x0dcD506D1Be162E50A2b434028A9a148F2686444",
      v2: "0x0A67542cbD8d71CB760d1EeB5a4b4a77ea35Ff9b",
    },
    chains: {
      8453: {
        nodeRegistryResolver: "0x0D8e2772B4D8d58C8a66EEc5bf77c07934b84942",
        publicResolver: "0x32d63B83BBA5a25f1f8aE308d7fd1F3c0b1abfA6",
      },
      10: {
        nodeRegistryResolver: "0x0798278Ff2c8aD096447B5C368Ce682118D87f63",
        publicResolver: "0xD8de4F5D7117BA37bA171ec9180Da798056f2CEd",
      },
    },
  },
  testnet: {
    ensChainId: 11155111,
    hybridResolvers: {
      current: "0xd5568c739f3A615C27e8926f1067B9a791893c3E",
      previous: "0x2F5E9E8B4495e4CDC5bC6C5FCBa93B8AaBDeF595",
      v2: "0x976a3E43b2a6706F52D9555931c68eb62D134ff7",
    },
    chains: {
      84532: {
        nodeRegistryResolver: "0x71C79717Bb907DBd73b564DA0F591209005a6695",
        publicResolver: "0x91FE109266b2EEcf6018Cb1ECd957fF9caAd0657",
      },
    },
  },
} as const satisfies NamespaceFamily<"namespace", NamespaceDeployment>;

/**
 * Off-chain providers on Ethereum mainnet, by ID, with the status of their gateways on
 * 2026-11-19. A name under one of their resolvers resolves through CCIP-Read; its owner and expiry
 * are not on any chain.
 *
 * @stability stable
 * @since 1.1.0
 */
export const offchainProviders = {
  coinbase: {
    id: "coinbase",
    name: "Coinbase",
    ensChainId: 1,
    parents: ["cb.id"],
    resolvers: ["0x1934FC75aD10d7eEd51dc7A92773cAc96A06BE56"],
    gateways: [
      "https://api.coinbase.com/api/v1/subdomain/resolver/resolveSubdomain/{sender}/{data}",
    ],
    status: "active",
  },
  uniswap: {
    id: "uniswap",
    name: "Uniswap",
    ensChainId: 1,
    parents: ["uni.eth"],
    resolvers: ["0x532cbe81b2c043667753DD4B6a0EB4d5a461D162"],
    gateways: ["https://entry-gateway.backend-prod.api.uniswap.org/ccip-read/{sender}/{data}.json"],
    status: "active",
  },
  world: {
    id: "world",
    name: "World App",
    ensChainId: 1,
    parents: ["world.id"],
    resolvers: ["0xB4E36A6C3403137d8fdaf4e91b91D1aBC2caF3Dd"],
    gateways: ["https://usernames.worldcoin.org/api/v1/ens"],
    status: "active",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    ensChainId: 1,
    parents: ["gemini.eth"],
    resolvers: ["0x0002Df5Cd440F8899344Da52Be33c4A970803668"],
    gateways: ["https://horizon-api.gemini.com/api/ens/{sender}/{data}"],
    status: "active",
  },
  justaname: {
    id: "justaname",
    name: "JustaName",
    ensChainId: 1,
    parents: ["justan.id", "yodl.eth", "peanut.me"],
    resolvers: ["0x48De002d3c64e4cFD130A87A35ECD960c01954bc"],
    gateways: ["https://api.justaname.id/resolve/{sender}/{data}.json"],
    status: "active",
  },
  namespace: {
    id: "namespace",
    name: "Namespace",
    ensChainId: 1,
    parents: ["calderans.eth", "offchainsub.eth"],
    // The hybrid resolvers also serve Namespace L2 names: `configs(node)` tells them apart.
    resolvers: [
      "0xe5A0277018879679d18cCDb66B52BD06f7fE95FD",
      "0x0dcD506D1Be162E50A2b434028A9a148F2686444",
      "0x0A67542cbD8d71CB760d1EeB5a4b4a77ea35Ff9b",
    ],
    gateways: [
      "https://ccip-gateway.namespace.ninja/offchain-resolver/chain/1/data/{sender}/{data}.json",
    ],
    status: "active",
  },
  clave: {
    id: "clave",
    name: "Clave",
    ensChainId: 1,
    parents: ["clv.eth"],
    resolvers: ["0x96317e8648866012885F56E0562EA1Ae1b66D81e"],
    gateways: ["https://resolver.getclave.io/ccip/resolve/{sender}/{data}.json"],
    status: "active",
  },
  namestone: {
    id: "namestone",
    name: "NameStone",
    ensChainId: 1,
    parents: ["namestone.eth", "slobo.eth"],
    resolvers: [
      "0xA87361C4E58B619c390f469B9E6F27d759715125",
      "0x2291053F49Cd008306b92f84a61c6a1bC9B5CB65",
      "0xd17347fA0a6eeC89a226c96a9ae354F785e94241",
    ],
    gateways: [
      "https://gateway.namestone.com/namestone-pg/o2",
      "https://gateway.namestone.xyz/namestone-pg/o1",
    ],
    status: "unavailable",
  },
  lens: {
    id: "lens",
    name: "Lens",
    ensChainId: 1,
    parents: ["lens.xyz"],
    resolvers: ["0x0cd35436774c7337a1f946653552C59249FeF519"],
    gateways: ["https://api-offchain.lens.dev/{sender}/{data}"],
    status: "unavailable",
  },
  spaceId: {
    id: "spaceId",
    name: "SPACE ID",
    ensChainId: 1,
    parents: ["bnb.eth"],
    resolvers: ["0x6F45141CBC8Bc4e01e4B49a0ae407a94b68ceF4D"],
    gateways: ["https://gateway.space.id/bnb/{sender}/{data}"],
    status: "unavailable",
  },
  walletConnect: {
    id: "walletConnect",
    name: "WalletConnect",
    ensChainId: 1,
    parents: ["wcn.id"],
    resolvers: ["0x5043E1865c9c508C4DfE02d9934391A4092BCD8e"],
    gateways: ["https://wcn-id.v3x.systems/gateway"],
    status: "unavailable",
  },
} as const satisfies Readonly<Record<string, OffchainProvider>>;
