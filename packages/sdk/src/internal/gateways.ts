import { String as Str } from "effect";

import type { Config, Gateways } from "../client/types.js";

/**
 * The one table of public gateways, used when neither the call nor the client sets one. The IPFS
 * Foundation rate limits `ipfs.io` by policy; it stays the default because it is the reference
 * public gateway, and production apps set their own.
 */
export const defaultGateways: Config["gateways"] = {
  ipfs: "https://ipfs.io",
  arweave: "https://arweave.net",
  swarm: "https://api.gateway.ethswarm.org",
};

const trimSlash = (origin: string): string => Str.replace(/\/+$/, "")(origin);

/** `gateways`, each one unset taken from `fallback`, as origins without a trailing slash. */
export const resolveGateways = (
  gateways: Gateways | undefined,
  fallback: Config["gateways"] = defaultGateways,
): Config["gateways"] => ({
  ipfs: trimSlash(gateways?.ipfs ?? fallback.ipfs),
  arweave: trimSlash(gateways?.arweave ?? fallback.arweave),
  swarm: trimSlash(gateways?.swarm ?? fallback.swarm),
});
