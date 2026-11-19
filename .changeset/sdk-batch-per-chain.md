---
"@ensforge/sdk": patch
---

Reads on another chain of the same client (an L2 primary name, an L2 namespace) are batched on that chain. They were coalesced into the multicall of whichever chain the client read first.
