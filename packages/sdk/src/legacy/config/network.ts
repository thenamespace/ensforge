import { Schema } from "effect";

export const ensNetworks = ["mainnet", "sepolia"] as const;

export type EnsNetwork = (typeof ensNetworks)[number];

export type EnsNetworkId = string;

export const EnsNetworkIdSchema = Schema.NonEmptyString;

export type EnsChainId = 1 | 11155111;

export const EnsNetworkSchema = Schema.Literals(ensNetworks);

export const ensChainIds = {
  mainnet: 1,
  sepolia: 11155111,
} as const satisfies Readonly<Record<EnsNetwork, EnsChainId>>;
