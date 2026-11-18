import { Effect } from "effect";

import { hexToBigInt, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { LoadedName } from "../name/load.js";
import { requireV1Contracts } from "../name/write.js";

/**
 * The ENSv1 token of a name that single-token approvals apply to: the NameWrapper token for
 * wrapped names, the BaseRegistrar token for unwrapped `.eth` names. ENSv2 names are ERC-1155
 * without single-token approvals, and unwrapped subnames have no token.
 */
export const approvableToken = Effect.fnUntraced(function* (
  client: Client,
  { state, data }: LoadedName,
): Effect.fn.Return<{ readonly contract: Address; readonly tokenId: bigint }, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  if (state.protocol === "v1" && state.wrapped) {
    return { contract: contracts.nameWrapper, tokenId: hexToBigInt(data.parts.node) };
  }
  if (state.protocol === "v1" && data.parts.isEth2ld) {
    return { contract: contracts.baseRegistrar, tokenId: hexToBigInt(data.parts.labelhash) };
  }
  return yield* Effect.fail(
    new UnsupportedError({
      code: "UNSUPPORTED_PROTOCOL",
      protocol: state.protocol,
      feature: "single-token approvals (wrapped ENSv1 names and unwrapped .eth names only)",
      hint: "Use approval.setOperator for ENSv2 names.",
    }),
  );
});
