---
"@ensforge/sdk": minor
"@ensforge/hca": minor
"@ensforge/contracts": minor
---

Migration steps sized by gas, a narrower HCA route, and checks before anything is sent.

- Migration steps are packed by a gas cost model (15M per step) instead of 30 calls, and a
  batched NameWrapper transfer is split to fit; `Plan.Step.gas` carries the estimate. `hca()`
  merges executions by gas as well as by call count.
- Through the signer's HCA, a migration calls ENS's MigrationHelper, as the ENS app does: the
  owner approves MigrationHelper, never the HCA, and a NameWrapper approval added for the run is
  revoked in a last step. A NameWrapper approval an earlier version gave the HCA is not revoked:
  remove it with `approval.setOperator`.
- A retry reuses a resolver or registry an interrupted run created only when it belongs to the
  same owner (blockers `resolver-conflict`, `registry-conflict`), and writes the new records to
  a reused resolver.
- An owner that cannot receive ERC-1155 tokens is refused (`recipient-cannot-receive`).
- Plans whose steps after the transfer are separate transactions warn `NOT_ATOMIC`; finish an
  interrupted run with `plan.resume`.
- Recreated wrapped subnames keep a future wrapper expiry (`SUBNAME_EXPIRY_EXTENDED` for a past
  one). `preserveManager` can be set per name.
- `@ensforge/contracts`: `Abis.shared.erc1155Receiver`.
