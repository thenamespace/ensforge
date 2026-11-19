---
"@ensforge/sdk": minor
---

Names that live outside ENS's registries: on an L2 (Basenames, Linea Names, Celonames, Durin, Namespace), or with an off-chain provider (Coinbase's `cb.id` and others). ensforge finds where a name lives from its parent's resolver and the deployment's namespaces (`Deployments.Profile.namespaces`), and remembers it for a minute per client.

**Breaking:**

- `name.get` reports where a name lives. An L2 name has `kind: "l2"`, `protocol: "l2"`, the L2's `chainId`, and `namespace` (the namespace, its parent, the L2 and the registry there). Its `owner`, `expiry` and `status` come from its L2 (`available` when nobody holds it there, `renewable: false`). A name only a parent's resolver serves has `kind: "offchain"` (a gateway answers) or `kind: "wildcard"` (an on-chain ENSIP-10 resolver answers), `status: "external"`, `available: false`, and `namespace.provider` when ensforge knows the provider. These names were reported as `available` in 1.0. Code that switches over every `NameKind`, `NameStatus` or `protocol` must handle the new members.
- Writes ensforge does not make on these names fail with the new `NameStateError` code `NAME_EXTERNAL`, whose message names the L2 and namespace, or the provider, instead of `NAME_NOT_REGISTERED`.
- Records of an L2 name are read on its L2 (`record.get`, `getText`, `getAddress`, `getAvatar`, `getContentHash`, `resolver.get`), not through Ethereum's gateway. Without a transport or public RPC for the L2 they fall back to Ethereum, and `strict` reads fail with `CHAIN_NOT_CONFIGURED`.
- `indexer.getName`, `getRecords`, `getHistory` and `getSubnames` fail with `INDEXER_UNSUPPORTED` for Linea Names and Celonames names, which no indexer serves, instead of answering as if they did not exist.

**New:**

- `name.getNamespace({ name })` returns where a name lives alone, or `null` for names in ENS.
- Writes on L2 names run on their L2, signed by the client's wallet (asked to switch) or local account there:
  - every namespace: `record.set` (with `clear`), `name.transfer` (its ERC-721 token, Linea's NameWrapper token, and a Basenames second-level name's registry record unless `role: "registrant"`), `approval.setToken` and `approval.getToken`;
  - Basenames and Linea Names, which fork ENSv1: `resolver.set` and `record.set({ resolver })` (`"default"` is the family's current resolver; a Linea name accepts only Linea's PublicResolver), `name.setTtl`, `subname.create`, `subname.update` and `subname.remove` (children get the family's current resolver; records for another `owner` are written before the hand-over), and `approval.setDelegate`/`getDelegate`.
  - Expired or in-grace L2 names fail with `NAME_EXPIRED`, names their L2 does not hold with `NAME_NOT_REGISTERED`, and an L2 the client cannot reach with `CHAIN_NOT_CONFIGURED`: writes never fall back to Ethereum. Routes (`via`) are refused for writes on L2 names; wallet bundles and paymasters work.
- `approval.setOperator` and `approval.getOperator` take `name` instead of `contract`: the contract that holds that name's token, on the chain the name lives on.
- `permission.check` and `permission.get` answer for L2 names as their contracts decide (holder, approved address, operators, resolver delegates), limited by a Linea name's burned NameWrapper fuses, which `permission.get` reports. `name.get` reports the TTL of Basenames and Linea names.
- `primaryName.get` reads a primary name for an L2 with ENS's L2 reverse registrar (Base, OP Mainnet, Arbitrum, Linea, Scroll) on that L2 when the client reaches it: the chain's registrar, then the default name, then the forward check. It works while Ethereum's proof of the L2 fails (Base today), and sees a name as soon as it is set. Otherwise, and for a past `blockNumber`, it reads through Ethereum, whose `GatewayError` then says to add a transport for the chain.
