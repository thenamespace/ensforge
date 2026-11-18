/** One read action to record: its path on the client and the options to call it with. */
export type RecordedCall = { readonly path: string; readonly options: unknown };

const vitalik = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const publicResolver = "0xF29100983E058B709F3D539b0c765937B804AC15";
const ensRegistry = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

/**
 * The read actions recorded against Ethereum mainnet, each with a famous name or address. One
 * call per action. Indexer reads need the bigname indexer; `jesse.base.eth` is an off-chain name.
 */
export const recordedCalls: readonly RecordedCall[] = [
  {
    path: "record.get",
    options: { name: "vitalik.eth", texts: ["url", "com.twitter"], addresses: ["eth"] },
  },
  { path: "record.getAddress", options: { name: "nick.eth" } },
  { path: "record.getAvatar", options: { name: "jesse.base.eth" } },
  { path: "record.getContentHash", options: { name: "ens.eth" } },
  { path: "record.getText", options: { name: "vitalik.eth", key: "url" } },
  { path: "primaryName.get", options: { address: vitalik } },
  { path: "name.get", options: { name: "nick.eth" } },
  {
    path: "name.getLabel",
    options: { labelhash: "0xaf2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc" },
  },
  { path: "resolver.get", options: { name: "nick.eth" } },
  { path: "resolver.getLink", options: { name: "nick.eth" } },
  {
    path: "resolver.resolve",
    options: {
      name: "nick.eth",
      data: "0x3b3b57de05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00",
    },
  },
  { path: "registry.get", options: { name: "nick.eth" } },
  { path: "registration.isAvailable", options: { name: "nick.eth" } },
  { path: "registration.getParameters", options: {} },
  {
    path: "registration.getPrice",
    options: { name: "ensforge-example.eth", duration: 31_536_000n },
  },
  { path: "registration.getRenewalPrice", options: { names: "nick.eth", duration: 31_536_000n } },
  { path: "permission.get", options: { name: "nick.eth", account: vitalik } },
  {
    path: "permission.check",
    options: { name: "nick.eth", operation: "transfer", account: vitalik },
  },
  { path: "approval.getDelegate", options: { name: "nick.eth", delegate: vitalik } },
  { path: "approval.getToken", options: { name: "nick.eth" } },
  { path: "wrapper.getFuses", options: { name: "ens.eth" } },
  { path: "migration.get", options: { name: "nick.eth" } },
  { path: "dns.getStatus", options: { name: "ens.domains" } },
  { path: "dns.getRecords", options: { name: "ens.domains" } },
  {
    path: "event.get",
    options: { name: "nick.eth", fromBlock: 16_000_000n, toBlock: 16_001_000n },
  },
  { path: "indexer.getName", options: { name: "ens.eth", namespace: "ens" } },
  { path: "indexer.getPrimaryName", options: { address: vitalik } },
  { path: "indexer.getRecords", options: { name: "ens.eth", namespace: "ens" } },
  { path: "indexer.getSubnames", options: { name: "ens.eth", namespace: "ens", limit: 3 } },
  { path: "indexer.getNamesForAddress", options: { address: vitalik, limit: 3 } },
  { path: "indexer.getEvents", options: { name: "ens.eth", limit: 3 } },
  { path: "indexer.getHistory", options: { name: "ens.eth", namespace: "ens", limit: 3 } },
  { path: "indexer.getPermissions", options: { name: "ens.eth", limit: 3 } },
  { path: "indexer.getNamesByExpiry", options: { namespace: "ens", limit: 3 } },
  { path: "indexer.getResolver", options: { address: publicResolver, chainId: 1, limit: 3 } },
  { path: "indexer.getResolverLinks", options: { address: publicResolver, chainId: 1, limit: 3 } },
  { path: "indexer.getResolverRoles", options: { address: publicResolver, chainId: 1, limit: 3 } },
  { path: "indexer.getRegistry", options: { address: ensRegistry, chainId: 1 } },
  { path: "indexer.getRegistryLabels", options: { address: ensRegistry, chainId: 1, limit: 3 } },
  { path: "indexer.getResolvers", options: { roleHolder: vitalik, limit: 3 } },
  { path: "indexer.getNamespace", options: { namespace: "ens" } },
  { path: "indexer.getStatus", options: {} },
  { path: "indexer.search", options: { query: "nick", limit: 3 } },
  { path: "indexer.lookup", options: { inputs: ["nick.eth", "vitalik.eth"] } },
];

/** Read actions left out on purpose, with why. */
export const skippedReads: Readonly<Record<string, string>> = {
  "approval.getOperator": "needs a real operator approval to show anything but false",
  batch: "takes deferred requests of other actions; its result is theirs",
  "dns.getOffchainResolver":
    "mainnet names with DNSSEC have no off-chain resolver to show; returns null",
  "approval.getToken": "nick.eth is a v2 name now and the token approval is v1 only",
  "event.get": "scans a block range of the caller's choice, which needs a deployment at that block",
  "indexer.getNamesByExpiry":
    "needs an expiry window the indexer accepts; nothing to show without one",
  "event.decode": "decodes logs the caller already has",
  "plan.get": "needs a saved plan",
  "plan.list": "needs saved plans",
  "registration.getCommitmentStatus": "needs a commitment made by the caller",
  "role.get": "ENSv2 roles are not on mainnet",
};
