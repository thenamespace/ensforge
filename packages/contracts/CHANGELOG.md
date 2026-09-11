# @ensforge/contracts

## 0.4.0

### Minor Changes

- e48eedc: Add HCA account inspection, EntryPoint deposits and owner-authorized withdrawals, signature verification, and upgrades with both directional gate checks. Expose factory, upgrade-gate, and trusted-set governance through hca/admin and sdk.hca.admin. Include exact deployed ABI fragments and an explicit function-coverage catalogue.
- 77bca68: Add the pinned Sepolia HCA deployment profile, runtime verification metadata, and focused factory,
  account-inspection and validator-wiring ABI fragments under the v2 export. Unsupported public
  networks are rejected; provider and cross-chain compatibility remain unverified.
- b9073ba: Add 16 HCA account, deployment, owner-execution and tracking actions with the existing sdk.hca group.
  Support direct atomic owner transactions and an explicit execution adapter boundary without wallet
  fallback. Add matching execution ABI fragments, profile configuration, session revocation, and
  validated submission tracking. Provider packages and session execution remain future work.
- 8aa0bb6: Add the Pimlico owner execution adapter using permissionless, with optional ETH sponsorship,
  first-operation HCA deployment, bounded fee reviews, and on-chain UserOperation receipt tracking.
  Expose the deployed EntryPoint execution fragment and explicit counterfactual owner verification.
- 47095d1: Add fixed-policy HCA destination sessions and a Rhinestone execution adapter. Core exposes owner
  enablement, bounded refunds, enabled-status reads and confirmed session references. Session plans
  validate complete calldata and reconcile expiry, replacement and nonce revocation.

  The optional Rhinestone subpath requires SDK 1.8.0 with the shipped compatibility patch. It supports
  prefunded same-chain destination execution, SDK signing, on-chain signature verification and
  restorable public intent tracking. Hosted relayer settlement remains a release verification step.

### Patch Changes

- 0a68e20: Align HCA execution with verified Sepolia provider behavior: record the intent executor adapter, validate same-chain signature envelopes against the reviewed nonce, bound session-history log requests, and check Pimlico self-funded prefunds. Review packed cross-chain token IDs and pin proxy implementation storage alongside contract bytecode. Reject unsupported source-funded destination quotes before signing; token-paid Rhinestone refunds remain outside the supported release boundary.
- d9025fa: Correct the Sepolia V2 HCA validator and standalone implementation addresses against the pinned post-audit-2 deployment artifacts. Update deployment provenance; the 32 complete deployed V2 ABIs already match this snapshot.

## 0.3.1

### Patch Changes

- aed1b6d: Move package repository metadata and release provenance to the Namespace GitHub organization.

## 0.3.0

### Patch Changes

- 1f829bd: Support Wagmi 2.19 and 3.x, including RainbowKit applications, and point package homepages to
  ensforge.com.

## 0.2.0

### Minor Changes

- 94e55fe: Align the Sepolia ENSv2 deployment, contract interfaces, initializer fragments, interface IDs, and
  renewal execution with the contracts deployed from the pinned July source snapshot. Remove
  forward-looking interface and contract-batch renewal exports that are not available onchain.

## 0.1.1

## 0.1.0

### Minor Changes

- 4f93c0d: Release the initial production-ready ensforge packages.
