import type { V1 } from "./types.js";

/**
 * ENSv1 on Ethereum mainnet at ens-contracts v1.7.0.
 *
 * @since 1.0.0
 */
export const mainnetV1 = {
  id: "mainnet-v1",
  chainId: 1,
  protocol: "v1",
  status: "active",
  contracts: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    ethRegistrarController: "0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547",
    wrappedEthRegistrarController: "0x253553366Da8546fC250F225fe3d25d0C782303b",
    bulkRenewal: "0xc649947a460B135e6B9a70Ee2FB429aDBB529290",
    priceOracle: "0x7542565191d074cE84fBfA92cAE13AcB84788CA9",
    nameWrapper: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401",
    publicResolver: "0xF29100983E058B709F3D539b0c765937B804AC15",
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
    reverseRegistrar: "0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb",
    defaultReverseRegistrar: "0x283F227c4Bd38ecE252C4Ae7ECE650B0e913f1f9",
    dnsRegistrar: "0xB32cB5677a7C971689228EC835800432B339bA2B",
    dnssecOracle: "0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5",
    offchainDnsResolver: "0xF142B308cF687d4358410a4cB885513b30A42025",
  },
  provenance: {
    repository: "https://github.com/ensdomains/ens-contracts",
    release: "v1.7.0",
    commit: "9b034936a42f462fc04bc0a929a419ede5e18d59",
    documentation: "https://docs.ens.domains/learn/deployments/",
  },
} as const satisfies V1;
