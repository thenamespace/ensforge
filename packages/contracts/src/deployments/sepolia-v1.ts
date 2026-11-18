import type { V1 } from "./types.js";

/**
 * ENSv1 on Sepolia at ens-contracts v1.7.0, kept for compatibility and migration.
 *
 * @since 1.0.0
 */
export const sepoliaV1 = {
  id: "sepolia-v1",
  chainId: 11155111,
  protocol: "v1",
  status: "legacy",
  contracts: {
    registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    baseRegistrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    ethRegistrarController: "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968",
    bulkRenewal: "0x6394b694a8C0DC716e447802E568F0Fb2c4E0965",
    priceOracle: "0x6810DbCE73C67506f785A225F818b30D8f209AAb",
    nameWrapper: "0x0635513f179D50A207757E05759CbD106d7dFcE8",
    publicResolver: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
    universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
    reverseRegistrar: "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6",
    defaultReverseRegistrar: "0x4F382928805ba0e23B30cFB75fC9E848e82DFD47",
    dnsRegistrar: "0x5a07C75Ae469Bf3ee2657B588e8E6ABAC6741b4f",
    dnssecOracle: "0xe62E4b6cE018Ad6e916fcC24545e20a33b9d8653",
    offchainDnsResolver: "0x179Be112b24Ad4cFC392eF8924DfA08C20Ad8583",
  },
  legacyPublicResolvers: [
    "0x8948458626811dd0c23EB25Cc74291247077cC51",
    "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
    "0x0CeEC524b2807841739D3B5E161F5bf1430FFA48",
  ],
  provenance: {
    repository: "https://github.com/ensdomains/ens-contracts",
    release: "v1.7.0",
    commit: "9b034936a42f462fc04bc0a929a419ede5e18d59",
    documentation: "https://docs.ens.domains/learn/deployments/",
  },
} as const satisfies V1;
