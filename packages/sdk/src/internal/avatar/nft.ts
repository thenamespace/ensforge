import { String as Str } from "effect";

import { getAddress, isAddress, toHex, type Address } from "viem";

/** An NFT avatar reference (ENSIP-12): `eip155:<chain>/<erc721|erc1155>:<contract>/<tokenId>`. */
export type NftReference = {
  readonly chainId: number;
  readonly standard: "erc721" | "erc1155";
  readonly contract: Address;
  readonly tokenId: bigint;
};

/** Parses an ENSIP-12 NFT avatar, or returns `undefined` when the value is not one. */
export const parseNftReference = (value: string): NftReference | undefined => {
  const match = /^eip155:(\d+)\/(erc721|erc1155):(0x[0-9a-fA-F]{40})\/(\d+)$/i.exec(
    Str.trim(value),
  );
  if (match === null) return undefined;

  const [, chainId = "", standard = "", contract = "", tokenId = ""] = match;
  if (!isAddress(contract, { strict: false })) return undefined;

  return {
    chainId: Number(chainId),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the pattern admits only the two NFT standards
    standard: Str.toLowerCase(standard) as NftReference["standard"],
    contract: getAddress(contract),
    tokenId: BigInt(tokenId),
  };
};

/** ERC-1155 metadata URIs may contain `{id}`: the token ID as 64 lowercase hex digits. */
export const fillTokenId = (uri: string, tokenId: bigint): string =>
  Str.replaceAll("{id}", Str.slice(2)(toHex(tokenId, { size: 32 })))(uri);

/** Image URI from NFT metadata (`image`, `image_url` or inline SVG `image_data`). */
export const imageFromMetadata = (metadata: unknown): string | undefined => {
  if (typeof metadata !== "object" || metadata === null) return undefined;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an object was checked above
  const { image, image_url: imageUrl, image_data: imageData } = metadata as Record<string, unknown>;
  if (typeof image === "string" && image !== "") return image;
  if (typeof imageUrl === "string" && imageUrl !== "") return imageUrl;
  if (typeof imageData === "string" && imageData !== "") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageData)}`;
  }
  return undefined;
};
