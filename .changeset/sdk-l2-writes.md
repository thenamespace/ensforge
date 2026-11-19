---
"@ensforge/sdk": minor
---

Names in L2 namespaces (Basenames, Linea Names, Celonames, Durin, Namespace) can be written where they live, with the same actions as ENS names. The plan runs on the name's L2, signed by the client's wallet on that chain.

- `record.set` writes their records to their resolver on the L2, `clear` included. `resolver` is not supported for them.
- `name.transfer` moves their token: ERC-721, or Linea Names' NameWrapper token. A Basenames second-level name also moves its registry record (`reclaim`) unless `role` is `"registrant"`; a Basenames subname changes its registry owner.
- `approval.setToken` and `approval.getToken` approve and read their token. `approval.setOperator` and `approval.getOperator` take `name` instead of `contract`: the contract that holds the name's token, on the chain the name lives on.
- `permission.check` and `permission.get` report who may transfer an L2 name.
- An expired or in-grace L2 name fails with `NAME_EXPIRED`, one its L2 does not hold with `NAME_NOT_REGISTERED`, and an L2 the client cannot reach with `CHAIN_NOT_CONFIGURED`. A route (`via`) is refused for L2 writes; wallet batching and paymasters still apply.
- Other writes on an L2 name fail with `NAME_EXTERNAL`, saying which L2 and namespace hold it. Writes on a name an off-chain provider serves name the provider.
