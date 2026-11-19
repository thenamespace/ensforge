---
"@ensforge/sdk": patch
---

- `record.get` and `record.getAddress` no longer fail with `UNEXPECTED` when a resolver answers `addr(node, coinType)` with something other than ABI-encoded bytes, as world.id's resolver does. The answer counts as none: ETH falls back to the legacy `addr(node)` answer, other EVM chains to the default address.
- A resolver that rejects its gateway's signed answer (an expired or forged EIP-3668 signature) fails reads with `GatewayError` (`GATEWAY_RESPONSE_INVALID`), not an `UnauthorizedError` the read did not declare.
- Reads on several chains of one client are batched per chain.
