import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../client/types.js";
import { GatewayError } from "../../errors/classes/GatewayError.js";
import type { AnyError } from "../../errors/types.js";
import * as Rpc from "../rpc/index.js";
import { fillTokenId, imageFromMetadata, parseNftReference, type NftReference } from "./nft.js";
import { toHttpUrl, type Gateways } from "./uri.js";

const fetchJson = (url: string, timeout: number): Effect.Effect<unknown, AnyError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok)
        throw new GatewayError({ code: "GATEWAY_REQUEST_FAILED", status: response.status, url });
      return (await response.json()) as unknown;
    },
    catch: (cause) =>
      cause instanceof GatewayError
        ? cause
        : new GatewayError({ code: "GATEWAY_RESPONSE_INVALID", url, cause }),
  });

const tokenUri = (client: Client, nft: NftReference): Effect.Effect<string, AnyError> =>
  nft.standard === "erc721"
    ? Rpc.readContract(client, {
        address: nft.contract,
        abi: Abis.shared.erc721,
        functionName: "tokenURI",
        args: [nft.tokenId],
      })
    : Rpc.readContract(client, {
        address: nft.contract,
        abi: Abis.shared.erc1155,
        functionName: "uri",
        args: [nft.tokenId],
      });

/**
 * Resolves an avatar record (ENSIP-12) to a URL a browser can load. NFT avatars read the token's
 * metadata and use its image; they resolve only on the client's own chain.
 */
export const resolveAvatar = Effect.fnUntraced(function* (
  client: Client,
  value: string,
  options: { readonly gateways: Gateways; readonly timeout: number },
): Effect.fn.Return<string | null, AnyError> {
  const nft = parseNftReference(value);
  if (nft === undefined) return toHttpUrl(value, options.gateways) ?? null;
  if (nft.chainId !== client.chain.id) return null;

  const metadataUrl = toHttpUrl(
    fillTokenId(yield* tokenUri(client, nft), nft.tokenId),
    options.gateways,
  );
  if (metadataUrl === undefined) return null;

  const image = imageFromMetadata(yield* fetchJson(metadataUrl, options.timeout));
  return image === undefined ? null : (toHttpUrl(image, options.gateways) ?? null);
});
