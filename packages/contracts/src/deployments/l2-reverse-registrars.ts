import type { Address } from "viem";

const mainnetL2s = "0x0000000000D8e504002cC26E3Ec46D81971C1664";
const testnetL2s = "0x00000BeEF055f7934784D6d81b6BC86665630dbA";

/**
 * The ENSv1 `L2ReverseRegistrar` (ens-contracts v1.7.0) of each mainnet L2, by chain ID: where an
 * address sets its primary name for that chain (`<coinType>.reverse`), read through Ethereum
 * mainnet. Its ABI is `Abis.v1.l2ReverseRegistrar`. Every one shares one address, so one signed
 * name claim covers all of them.
 *
 * @stability stable
 * @since 1.2.0
 */
export const mainnetL2ReverseRegistrars = {
  /** OP Mainnet. */
  10: mainnetL2s,
  /** Base. */
  8453: mainnetL2s,
  /** Arbitrum One. */
  42161: mainnetL2s,
  /** Linea. */
  59144: mainnetL2s,
  /** Scroll. */
  534352: mainnetL2s,
} as const satisfies Readonly<Record<number, Address>>;

/**
 * The ENSv1 `L2ReverseRegistrar` of each testnet L2, by chain ID, read through Sepolia. Every one
 * shares one address.
 *
 * @stability stable
 * @since 1.2.0
 */
export const testnetL2ReverseRegistrars = {
  /** OP Sepolia. */
  11155420: testnetL2s,
  /** Base Sepolia. */
  84532: testnetL2s,
  /** Arbitrum Sepolia. */
  421614: testnetL2s,
  /** Linea Sepolia. */
  59141: testnetL2s,
  /** Scroll Sepolia. */
  534351: testnetL2s,
} as const satisfies Readonly<Record<number, Address>>;

/**
 * The ENSv1 `L2ReverseRegistrar` (ens-contracts v1.7.0) of each chain it is deployed on, by chain
 * ID: where an address sets its primary name for that chain (`<coinType>.reverse`). Its ABI is
 * `Abis.v1.l2ReverseRegistrar`. Every mainnet L2 shares one address, and every testnet another,
 * so one signed name claim covers all of them. Mainnet L2s are read through Ethereum mainnet and
 * testnets through Sepolia: see {@link mainnetL2ReverseRegistrars} and
 * {@link testnetL2ReverseRegistrars}.
 *
 * @stability stable
 * @since 1.0.0
 */
export const l2ReverseRegistrars = {
  ...mainnetL2ReverseRegistrars,
  ...testnetL2ReverseRegistrars,
} as const satisfies Readonly<Record<number, Address>>;
