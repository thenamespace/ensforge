---
"@ensforge/sdk": minor
---

`primaryName.get` reads a primary name for an L2 with ENS's L2 reverse registrar (Base, OP Mainnet, Arbitrum, Linea, Scroll) on that L2 when the client reaches it: the chain's registrar, then the default name, then the check that the name resolves back. It no longer depends on Ethereum's proof of the L2, which fails for Base today (`InvalidGameTypeBitMask` in ENS's Base verifier), and it sees a name as soon as it is set. Without a transport or public RPC for the chain, and for a past `blockNumber`, it is read through Ethereum as before; when that fails, the `GatewayError` says to add a transport for the chain.

`primaryName.set` on an L2 takes a route (`via`) again, as in 1.0. Only writes on names in L2 namespaces refuse routes.
