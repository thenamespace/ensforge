---
"@ensforge/sdk": patch
---

`record.get` and `record.getAddress` no longer fail with `UNEXPECTED` when a resolver answers `addr(node, coinType)` with something other than ABI-encoded bytes, as world.id's resolver does. The answer counts as none: ETH falls back to the legacy `addr(node)` answer, other EVM chains to the default address.
