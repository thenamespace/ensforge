import { UnsupportedError } from "../classes/UnsupportedError.js";

/**
 * A resolver that keeps its records elsewhere (an L2, a database behind a gateway) refusing an
 * on-chain write; `detail` says where its records live.
 */
export const offchainWriteRefused = (detail: string): UnsupportedError =>
  new UnsupportedError({
    code: "RESOLVER_PROFILE_UNSUPPORTED",
    feature: "on-chain records",
    shortMessage: "The resolver keeps its records off-chain; it does not accept on-chain writes.",
    hint: "Update the records where the resolver keeps them (its own app or gateway), or point the name at an on-chain resolver with `resolver.set`.",
    details: [detail],
  });
