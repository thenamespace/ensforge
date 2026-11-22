---
"@ensforge/sdk": minor
---

- `registration.register` with an earlier commitment that is not ready yet waits for it, from the block that recorded it, instead of failing with `COMMITMENT_TOO_NEW`. `Plan.Step.waitFor` gains an optional `since` (a chain timestamp the wait counts from); `sendPlan` and the HCA route honour it.
- An expired commitment with the same secret is made again instead of failing with `COMMITMENT_TOO_OLD`: the registrar only refuses committing again while a commitment is unexpired. The plan carries the warning `COMMITMENT_RECOMMITTED`, and registering waits again.
- `registration.commit` reports `COMMITMENT_EXISTS` for any unexpired commitment, ready or not. `COMMITMENT_TOO_NEW` and `COMMITMENT_TOO_OLD` now only come from the registrar refusing a commitment on chain.
