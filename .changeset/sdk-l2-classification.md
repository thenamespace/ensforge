---
"@ensforge/sdk": minor
---

- `name.get` no longer reports names that live outside ENS's registries as available. A name no registry holds that its parent's resolver serves (Basenames such as `jesse.base.eth`, `uni.eth`, `cb.id`, `world.id`, Linea and Durin subnames) now has `kind: "offchain"` (served through a CCIP-Read gateway) or `kind: "wildcard"` (served by an on-chain ENSIP-10 resolver), `status: "external"` and `available: false`. The check is one `eth_call` and never contacts the gateway. Code that switches over every `NameKind` or `NameStatus` must handle the new members.
- Write actions on such names fail with the new `NameStateError` code `NAME_EXTERNAL` instead of `NAME_NOT_REGISTERED`; `subname.create` still lets the parent's owner create the child in the registry.
- `inheritedResolver` looks past ENSv2's DNS TLD resolvers to the ENSv1 resolver that answers (for example `cb.id`'s own resolver for `jesse.cb.id`).
