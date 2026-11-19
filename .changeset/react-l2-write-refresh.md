---
"@ensforge/react": patch
---

After a write that ran on an L2 (a record, transfer or approval of an L2 name, an L2 primary name), its reads refresh once the L2 mines it. They waited for the transaction on the ENS chain, which never sees it, so they refreshed only when viem gave up after three minutes. Indexer reads wait for the indexer to reach the write's block on that same chain.
