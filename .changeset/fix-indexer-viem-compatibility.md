---
"@ensforge/contracts": patch
"@ensforge/core": patch
"@ensforge/sdk": patch
"@ensforge/react": patch
"@ensforge/hca": patch
---

Support viem versions from 2.49.0 and use a peer dependency in the contracts package so applications can share their installed viem version.

Keep V1 names visible when both indexers are enabled. Interpret indexed migration flags as ENSv1-to-ENSv2 migration rather than the historical V1 registry migration.

Include names without a recorded expiry in expiryAfter filters, with consistent local filtering and pagination on the V2 indexer. Upper expiry bounds continue to require a recorded expiry.
