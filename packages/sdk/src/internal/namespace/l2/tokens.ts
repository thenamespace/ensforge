import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import type { Plan } from "../../../plan/Plan.js";
import type { L2Location, L2WriteTarget } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";

/** The token that holds an L2 name. */
export type L2Token = {
  readonly contract: Address;
  readonly tokenId: bigint;
  /** Linea Names' NameWrapper is ERC-1155; every other family's tokens are ERC-721. */
  readonly standard: "erc721" | "erc1155";
};

/**
 * The token of an L2 name (`client` is on its L2), or `null` for a Basenames subname, which is a
 * registry record without one: BaseRegistrar tokens are labelhashes of second-level names, the
 * NameWrapper's and every other family's registry's are namehashes.
 */
export const l2TokenOf = (
  client: Client,
  location: L2Location,
  parts: NameParts,
): L2Token | null => {
  const namespaces = client.deployment.namespaces ?? {};
  switch (location.id) {
    case "basenames": {
      const baseRegistrar = namespaces.basenames?.contracts.baseRegistrar;
      return parts.name !== `${parts.label}.${location.parent}` || baseRegistrar === undefined
        ? null
        : { contract: baseRegistrar, tokenId: hexToBigInt(parts.labelhash), standard: "erc721" };
    }
    case "linea": {
      const nameWrapper = namespaces.linea?.contracts.nameWrapper;
      return nameWrapper === undefined
        ? null
        : { contract: nameWrapper, tokenId: hexToBigInt(parts.node), standard: "erc1155" };
    }
    default:
      return location.registry === null
        ? null
        : { contract: location.registry, tokenId: hexToBigInt(parts.node), standard: "erc721" };
  }
};

/**
 * The contract on which an operator of an L2 name's owner acts for it: the token's contract, or
 * the Basenames registry for its subnames.
 */
export const l2OperatorContract = (
  client: Client,
  location: L2Location,
  parts: NameParts,
): Address | null =>
  l2TokenOf(client, location, parts)?.contract ??
  (location.id === "basenames"
    ? (client.deployment.namespaces?.basenames?.contracts.registry ?? null)
    : null);

const call = (to: Address, data: `0x${string}`): Plan.Call => ({ to, data, value: 0n });

/**
 * The calls that transfer an L2 name to `to`: its token, and for a Basenames second-level name
 * the registry record too (`reclaim`, unless `role` is `registrant`), as on ENS's `.eth`
 * registrar. A Basenames subname moves with the registry's `setOwner`.
 */
export const l2TransferCalls = (
  target: L2WriteTarget,
  parts: NameParts,
  to: Address,
  role: "owner" | "registrant",
): Effect.Effect<readonly Plan.Call[], AnyError> => {
  const token = l2TokenOf(target.client, target.location, parts);
  const { owner, registry } = target.state;

  if (token === null || owner === null) {
    if (role === "registrant" || registry === null) {
      return Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_ON_DEPLOYMENT",
          feature: "Registrant transfers of names without a token",
          shortMessage: "The name has no token: it is a registry record of its parent.",
          hint: 'Transfer it without `role: "registrant"`.',
        }),
      );
    }
    return Effect.succeed([
      call(
        registry,
        encodeFunctionData({
          abi: Abis.v1.ensRegistry,
          functionName: "setOwner",
          args: [parts.node, to],
        }),
      ),
    ]);
  }

  if (token.standard === "erc1155") {
    return Effect.succeed([
      call(
        token.contract,
        encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "safeTransferFrom",
          args: [owner, to, token.tokenId, 1n, "0x"],
        }),
      ),
    ]);
  }

  const moveToken = call(
    token.contract,
    encodeFunctionData({
      abi: Abis.shared.erc721,
      functionName: "safeTransferFrom",
      args: [owner, to, token.tokenId],
    }),
  );
  if (target.location.id !== "basenames" || role === "registrant")
    return Effect.succeed([moveToken]);
  // Reclaim first: only the current holder may point the registry record at `to`. The
  // BaseRegistrar's `reclaim` is ENS's.
  const reclaim = call(
    token.contract,
    encodeFunctionData({
      abi: Abis.v1.baseRegistrar,
      functionName: "reclaim",
      args: [token.tokenId, to],
    }),
  );
  return Effect.succeed([reclaim, moveToken]);
};
