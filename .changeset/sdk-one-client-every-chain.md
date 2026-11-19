---
"@ensforge/sdk": minor
"@ensforge/hca": minor
"@ensforge/react": minor
---

**Breaking:** `Ensforge.create` configures one client for every chain.

- `Ensforge.create({ chain })` is enough to read: ensforge builds its own viem clients and uses each chain's public RPC when `transports` has none for it (`publicRpc`, default `true`).
- `transports: { [chainId]: Transport }` sets the RPC of any chain, the ENS chain included. Reuse a viem client with `custom(client)`.
- `wallet` signs on every chain: a write on another chain asks the wallet to switch first (`switchChain`, default `true`). A getter receives the chain the write is for.
- A local `account` (`privateKeyToAccount(key)`) signs on any chain itself, without a wallet client.
- `pollingInterval` and `cacheTime` apply to the clients ensforge builds.
- `ens.client(chainId?)` returns the viem client of any chain (the ENS chain by default).
- `Ensforge.fromWagmi` builds on the same options; nothing changes for wagmi apps.

| 1.0                                                      | 1.1                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Ensforge.create({ publicClient })`                      | `Ensforge.create({ chain, transports: { [chain.id]: transport } })`, or just `{ chain }` for public RPCs |
| `walletClient`                                           | `wallet`                                                                                                 |
| `chains: { [id]: { publicClient, walletClient } }`       | `transports: { [id]: transport }`; the one `wallet` (or local `account`) signs there                     |
| `ens.publicClient`                                       | `ens.client()`                                                                                           |
| `ChainClients` type                                      | removed                                                                                                  |
| `CHAIN_NOT_CONFIGURED` for a chain missing from `chains` | only for a chain without a transport when `publicRpc` is `false`, or a chain ensforge does not know      |
