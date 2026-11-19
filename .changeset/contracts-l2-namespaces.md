---
"@ensforge/contracts": minor
---

L2 namespaces and off-chain providers.

- `Abis.basenames`, `Abis.durin`, `Abis.celonames` and `Abis.namespace`: complete ABIs of the contracts that hold L2 names (registries, registrars and resolvers), also exported from `@ensforge/contracts/namespaces`. Durin's are experimental, like Durin upstream.
- `Deployments.namespaces`: for Basenames, Linea Names, Celonames, Durin and Namespace, the parent names, the L2 that stores their names and its contracts, on mainnet and on testnets.
- `Deployments.namespaceOf({ chainId, resolver })` finds the namespace a parent's ENS resolver belongs to.
- `Deployments.offchainProviders` and `Deployments.offchainProvider({ chainId, resolver })` identify the providers that serve names through a CCIP-Read gateway, with the status of each gateway.
