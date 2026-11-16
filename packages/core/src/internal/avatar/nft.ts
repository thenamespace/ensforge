import { getAddress, isAddress, parseAbi, toHex, type Address } from "viem";

/** An NFT avatar reference (ENSIP-12): `eip155:<chain>/<erc721|erc1155>:<contract>/<tokenId>`. */
export type NftReference = {
  readonly chainId: number;
  readonly standard: "erc721" | "erc1155";
  readonly contract: Address;
  readonly tokenId: bigint;
};

export const nftAbi = /* @__PURE__ */ parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function uri(uint256 id) view returns (string)",
]);

/** Parses an ENSIP-12 NFT avatar, or returns `undefined` when the value is not one. */
export const parseNftReference = (value: string): NftReference | undefined => {
  const match = /^eip155:(\d+)\/(erc721|erc1155):(0x[0-9a-fA-F]{40})\/(\d+)$/i.exec(value.trim());
  if (match === null) return undefined;

  const [, chainId = "", standard = "", contract = "", tokenId = ""] = match;
  if (!isAddress(contract, { strict: false })) return undefined;

  return {
    chainId: Number(chainId),
    standard: standard.toLowerCase() as NftReference["standard"],
    contract: getAddress(contract),
    tokenId: BigInt(tokenId),
  };
};

/** ERC-1155 metadata URIs may contain `{id}`: the token ID as 64 lowercase hex digits. */
export const fillTokenId = (uri: string, tokenId: bigint): string =>
  uri.replaceAll("{id}", toHex(tokenId, { size: 32 }).slice(2));

/** Image URI from NFT metadata (`image`, `image_url` or inline SVG `image_data`). */
export const imageFromMetadata = (metadata: unknown): string | undefined => {
  if (typeof metadata !== "object" || metadata === null) return undefined;

  const { image, image_url: imageUrl, image_data: imageData } = metadata as Record<string, unknown>;
  if (typeof image === "string" && image !== "") return image;
  if (typeof imageUrl === "string" && imageUrl !== "") return imageUrl;
  if (typeof imageData === "string" && imageData !== "") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageData)}`;
  }
  return undefined;
};
