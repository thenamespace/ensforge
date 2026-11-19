---
"@ensforge/sdk": minor
---

- `ensActions()` loads its rarely used groups (`approval`, `dns`, `event`, `migration`, `permission`, `registry`, `role`, `wrapper`) and `batch` with their first call instead of with the client: a client with every action is 15% smaller up front (107.6 → 91.7 kB gzip). Their types and behaviour are unchanged; their own decorators (`migrationActions()`, …) still load with the client.
