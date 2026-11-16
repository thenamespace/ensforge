import { parseAbi } from "viem";

// Minimal ENSv1 fragments (ens-contracts v1.7.0); errors are decoded separately.

/** ENSRegistry. */
export const ensRegistryAbi = /* @__PURE__ */ parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function ttl(bytes32 node) view returns (uint64)",
  "function setOwner(bytes32 node, address owner)",
  "function setResolver(bytes32 node, address resolver)",
  "function setTTL(bytes32 node, uint64 ttl)",
]);

/** BaseRegistrarImplementation (`.eth` ERC-721 registrar). */
export const baseRegistrarAbi = /* @__PURE__ */ parseAbi([
  "function GRACE_PERIOD() view returns (uint256)",
  "function nameExpires(uint256 id) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function reclaim(uint256 id, address owner)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
]);

/** NameWrapper (ERC-1155). */
export const nameWrapperAbi = /* @__PURE__ */ parseAbi([
  "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function setResolver(bytes32 node, address resolver)",
  "function setTTL(bytes32 node, uint64 ttl)",
]);
