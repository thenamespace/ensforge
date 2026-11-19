---
"@ensforge/sdk": minor
---

`name.get` tells where a name lives. A name in an L2 namespace (Basenames, Linea Names, Celonames, Durin, Namespace) is `kind: "l2"`; `chainId` is the chain it lives on and `namespace` names the namespace, its parent, the L2 and the registry there. A name an off-chain provider serves has `namespace.kind: "offchain"` with the provider. `name.getNamespace({ name })` returns the location alone. The namespaces come from the client's deployment profile (`Deployments.Profile.namespaces`); a client remembers a name's location for a minute and forgets it after its own writes.
