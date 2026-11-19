---
"@ensforge/sdk": minor
---

Basenames and Linea Names, which fork ENSv1, take ENS's registry writes on their L2.

- `resolver.set` and `record.set({ resolver })` change a name's resolver, in the registry or Linea's NameWrapper. `"default"` is the family's current resolver, which also moves a Basename off the legacy resolver. A Linea name accepts only Linea's PublicResolver, the only one its Ethereum resolver reads; another fails with `UNSUPPORTED_ON_DEPLOYMENT`.
- `name.setTtl` sets their TTL, and `name.get` reports it.
- `subname.create`, `subname.update` and `subname.remove` work under their names, from the parent's owner (the child's own owner can also remove it). Children get the family's current resolver by default. Records for another `owner` are written while the signer holds the child, which then goes to `owner` in the same step. `fuses`, `expiry`, `roles` and `emancipate` are not supported there.
- `approval.setDelegate` and `approval.getDelegate` work with their resolvers on the L2.
- `permission.check` and `permission.get` answer these operations, limited by a Linea name's burned NameWrapper fuses, which `permission.get` reports.
- `NAME_EXTERNAL` for writes ensforge does not make lists what it does write for each family.
