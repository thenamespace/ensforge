---
"@ensforge/hca": major
---

ensforge 1.0: ENS Hosted Contract Accounts on the 1.0 client. Pass `via: hca()` to any write to run it through the user's HCA in one execution, with executors for the owner's wallet, any ERC-4337 bundler (`bundler()`, `pimlico()`) and Rhinestone intents (`rhinestone({ sdk })`), or your own (`defineExecutor`). Sessions, deposits, upgrades and governance actions follow the SDK's conventions. The 0.x HCA API is removed.
