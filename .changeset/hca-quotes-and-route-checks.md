---
"@ensforge/hca": minor
"@ensforge/contracts": minor
---

Rhinestone executions are quoted, paid for by the HCA by default, and checked before signing.

- `rhinestone()` no longer requests sponsorship by default: executions pay their fee from the HCA
  in `feeToken` (the session's refund token, else the deployment's USDC). Pass `sponsored: true`
  if your Rhinestone project sponsors gas.
- The orchestrator's route is checked before anything is signed. An owner-signed route must run
  exactly the requested calls from the HCA (after at most one fee approval to the gas refund
  paymaster), on this chain, with no other funding and a refund within the new `maxRefund`
  option; otherwise the new error code `HCA_ROUTE_REJECTED` lists each difference. A session's
  refund above its caps fails with `HCA_SESSION_INVALID`.
- `rhinestone()` implements `quote` and the new `quoteRefund`. `hca()` quotes each HCA execution
  on its own, so `plan.fees` has one entry per execution (a registration has two).
- `hca.authorizeSession({ executor })` sizes `refund.maxGasOverhead` from a quote: four times the
  quoted overhead, between 500k and 100M gas (500k without a quote). Refund caps the validator
  cannot store fail with `INVALID_RECORD_VALUE`.
- New `hcaRefundCaps(quotedGasOverhead?)` in `@ensforge/contracts/v2/experimental/hca`.
