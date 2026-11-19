---
"@ensforge/contracts": minor
---

L2 namespaces and off-chain providers.

- `Abis.basenames`, `Abis.durin`, `Abis.celonames` and `Abis.namespace`: complete ABIs of the contracts that hold L2 names (registries, registrars and resolvers), also exported from `@ensforge/contracts/namespaces`. Durin's are experimental, like Durin upstream. `Abis.basenames.interfaces`, `Abis.celonames.interfaces`, `Abis.durin.interfaces` and `Abis.namespace.interfaces` hold only the functions ensforge reads, for small bundles.
- `Deployments.namespaces`: for Basenames, Linea Names, Celonames, Durin and Namespace, the parent names, the L2 that stores their names and its contracts, on mainnet and on testnets.
- `Deployments.Profile.namespaces`: the L2 namespaces an ENS deployment resolves. `Deployments.mainnet` and `Deployments.sepolia` carry theirs, and `Deployments.define` validates a custom profile's (a devnet, a fork).
- `Deployments.namespaceOf({ profile, resolver })` finds the namespace a parent's ENS resolver belongs to.
- `Deployments.offchainProviders` and `Deployments.offchainProvider({ chainId, resolver })` identify the providers that serve names through a CCIP-Read gateway, with the status of each gateway.
