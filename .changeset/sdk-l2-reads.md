---
"@ensforge/sdk": minor
---

Names in L2 namespaces are read where they live. `name.get` reports an L2 name's owner, expiry and status from its L2 (`protocol: "l2"`, `available` when nobody holds it, `renewable: false`). `record.get` and its shortcuts read its records from its resolver on the L2, `resolver.get` describes that resolver, and `permission.check`/`permission.get` say who may write its records there (other operations are not supported on L2 names). Without a transport or public RPC for the L2, reads fall back to Ethereum's gateway, and `strict` reads fail with `CHAIN_NOT_CONFIGURED`.
