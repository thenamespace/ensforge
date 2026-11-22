---
"@ensforge/sdk": minor
---

Plans with a wait (a registration's commit, then its register step) are simulated across it. On an RPC that supports `eth_simulateV1`, the steps after a wait run in a later simulated block, timed that long after the one before, so `register` failures (an owner that refuses the name's token, a resolver deployment, records) show in `.simulate` and stop a send before the commitment is paid for. On RPCs without it, or that ignore the block times, only the steps before the first wait are simulated, as before.
