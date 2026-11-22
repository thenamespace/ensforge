---
"@ensforge/hca": minor
"@ensforge/sdk": minor
"@ensforge/contracts": minor
---

Writes through `via: hca()` fund the HCA from the owner's wallet.

- When the HCA holds less than its calls spend plus the fees the executor quotes for each
  execution (with a 5% margin), `hca()` moves the shortfall from the owner's wallet: a `transfer`
  in the owner's setup step with `owner()`, or an EIP-2612 `permit` and `transferFrom` opening the
  first execution with relaying executors such as `rhinestone()`. The owner signs the permit while
  the plan is prepared, so `.prepare()` asks for a signature. The plan carries an `HCA_FUNDING`
  warning and a balance requirement on the owner. `hca({ funding: "none" })` fails with
  `INSUFFICIENT_TOKEN_BALANCE` instead; `funding: { deadline }` sets the permit's lifetime.
- A session may pull its refund token this way: `checkSessionCalls` accepts one permit and
  `transferFrom` of the same amount from the owner to the HCA, next to an action, as the
  validator does. Other tokens fail with `HCA_ACTION_NOT_ALLOWED`.
- `rhinestone()` declares the pulled funds to the orchestrator (`auxiliaryFunds`,
  `sourceAssets`).
- `@ensforge/sdk`: routed `register` and `renew` no longer fail when only the signer holds the
  payment token; the balance check counts the signer's balance, and their balance requirement
  names the route's account (`Plan.Requirement.account`).
- `@ensforge/contracts`: new `Abis.shared.erc2612` (permit, nonces, the ERC-5267 domain).
