import { Effect } from "effect";

import { hexToBigInt, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { LoadedName } from "../name/load.js";
import type { L2Location } from "../name/location.js";
import type { NameParts } from "../name/parts.js";
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

/**
 * The token of an L2 name that single-token approvals apply to (`client` is on its L2). A
 * Basenames subname is a registry record without one.
 */
export const l2ApprovableToken: (
  client: Client,
  location: L2Location,
  parts: NameParts,
) => Effect.Effect<{ readonly contract: Address; readonly tokenId: bigint }, AnyError> =
  Effect.fnUntraced(function* (
    client: Client,
    location: L2Location,
    parts: NameParts,
  ): Effect.fn.Return<{ readonly contract: Address; readonly tokenId: bigint }, AnyError> {
    const { l2TokenOf } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
    const token = l2TokenOf(client, location, parts);
    if (token !== null) return token;
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_ON_DEPLOYMENT",
        feature: "Single-token approvals of names without a token",
        shortMessage: "The name has no token: it is a registry record of its parent.",
        hint: "Use approval.setOperator with the name.",
      }),
    );
  });
