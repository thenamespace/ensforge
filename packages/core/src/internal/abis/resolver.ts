import { parseAbi } from "viem";

/** Resolver reads (ENSIP profiles), shared by every resolver. */
export const resolverReadAbi = /* @__PURE__ */ parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function contenthash(bytes32 node) view returns (bytes)",
  "function ABI(bytes32 node, uint256 contentTypes) view returns (uint256, bytes)",
  "function pubkey(bytes32 node) view returns (bytes32 x, bytes32 y)",
  "function name(bytes32 node) view returns (string)",
  "function interfaceImplementer(bytes32 node, bytes4 interfaceId) view returns (address)",
  "function data(bytes32 node, string key) view returns (bytes)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

/** Setters of node-based resolvers: PublicResolver (ENSv1) and PublicResolverV2. */
export const nodeResolverWriteAbi = /* @__PURE__ */ parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function setAddr(bytes32 node, uint256 coinType, bytes a)",
  "function setContenthash(bytes32 node, bytes hash)",
  "function setABI(bytes32 node, uint256 contentType, bytes data)",
  "function setPubkey(bytes32 node, bytes32 x, bytes32 y)",
  "function setName(bytes32 node, string newName)",
  "function setInterface(bytes32 node, bytes4 interfaceId, address implementer)",
  "function setData(bytes32 node, string key, bytes value)",
  "function clearRecords(bytes32 node)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

/** Setters of the ENSv2 PermissionedResolver: they take the DNS-encoded name, not the node. */
export const permissionedResolverWriteAbi = /* @__PURE__ */ parseAbi([
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function setContenthash(bytes name, bytes hash)",
  "function setABI(bytes name, uint256 contentType, bytes data)",
  "function setName(bytes name, string primaryName)",
  "function setInterface(bytes name, bytes4 interfaceId, address implementer)",
  "function setData(bytes name, string key, bytes value)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

/** ERC-165. */
export const erc165Abi = /* @__PURE__ */ parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

/** Record versions of ENSv1 resolvers (`IVersionableResolver`). */
export const versionableResolverAbi = /* @__PURE__ */ parseAbi([
  "function recordVersions(bytes32 node) view returns (uint64)",
]);

/** ENSv2 PermissionedResolver administration: initialization, links and upgrades. */
export const permissionedResolverAdminAbi = /* @__PURE__ */ parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants, bytes[] calls)",
  "function getRecordId(bytes32 node) view returns (uint256)",
  "function getRecordCount() view returns (uint256)",
  "function linkToNode(bytes sourceName, bytes32 targetNode)",
  "function linkToRecord(bytes sourceName, uint256 recordId)",
  "function canUpgradeFrom(address previousImplementation) view returns (bool)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
]);
