import { parseAbi } from "viem";

// Minimal ENSv2 fragments (contracts-v2 v1.0.1); errors are decoded separately.

/** UniversalHelper. */
export const universalHelperAbi = /* @__PURE__ */ parseAbi([
  "function findParentRegistry(bytes name) view returns (address)",
]);

/** PermissionedRegistry (root, `.eth`, user and wrapper registries). */
export const permissionedRegistryAbi = /* @__PURE__ */ parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function unsafeTransfer(address to, uint256 anyId, bytes data)",
  "function setResolver(uint256 anyId, address resolver)",
]);

/** ETHRegistrar. */
export const ethRegistrarAbi = /* @__PURE__ */ parseAbi([
  "function GRACE_PERIOD() view returns (uint64)",
]);

/** LabelStore. */
export const labelStoreAbi = /* @__PURE__ */ parseAbi([
  "function getLabel(uint256 anyId) view returns (string)",
]);

/** VerifiableFactory: deploys verifiable UUPS proxies at CREATE2 addresses. */
export const verifiableFactoryAbi = /* @__PURE__ */ parseAbi([
  "function proxyLogic() view returns (address)",
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
]);

/** PermissionedAddressSet (e.g. the set of known public resolvers). */
export const addressSetAbi = /* @__PURE__ */ parseAbi([
  "function includes(address addr) view returns (bool)",
]);

/** ReverseRegistrarAdapter: claims `addr.reverse` nodes for accounts the caller may name. */
export const reverseRegistrarAdapterAbi = /* @__PURE__ */ parseAbi([
  "function claim(address account, address resolver) returns (bytes32)",
]);

/** DefaultReverseRegistrarAdapter: sets `default.reverse` names for accounts the caller may name. */
export const defaultReverseRegistrarAdapterAbi = /* @__PURE__ */ parseAbi([
  "function setName(address account, string name)",
]);
