---
"@ensforge/sdk": patch
---

A resolver that rejects its gateway's signed answer (an expired or forged signature in EIP-3668 `resolveWithProof`, as L2 namespaces' and off-chain providers' gateways sign) now fails reads with `GatewayError` (`GATEWAY_RESPONSE_INVALID`), not an `UnauthorizedError` the read did not declare.
