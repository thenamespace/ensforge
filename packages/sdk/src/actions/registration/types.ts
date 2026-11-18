import type { Address } from "viem";

/**
 * An ERC-20 payment token: `"usdc"` or `"dai"` from the deployment, or any token address the
 * registrar's price oracle accepts. The ENSv2 registrar does not accept ETH.
 *
 * @category registration
 * @since 1.0.0
 */
export type PaymentToken = "usdc" | "dai" | (string & {});

/**
 * ERC-20 metadata returned with prices; amounts are in the token's smallest unit.
 *
 * @category registration
 * @since 1.0.0
 */
export type TokenInfo = {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
};

/**
 * Which contract renews a name: the ENSv2 `ETHRegistrar`, or `ETHRenewerV1` for names still on
 * ENSv1.
 *
 * @category registration
 * @since 1.0.0
 */
export type RenewalRoute = "v2-registrar" | "v1-renewer";
