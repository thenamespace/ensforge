# @ensforge/sdk

## 0.4.0

### Minor Changes

- 0ced8e8: Support custom ENS V1 and V2 deployment profiles in Viem and Wagmi configuration. Validate chain IDs and complete contract address groups, snapshot custom deployments, and avoid inheriting preset indexer endpoints. Resolved network IDs and chain IDs now support arbitrary deployments; runtime deployment provenance is optional.
- f53985c: Default SDK instances to their own memory workflow storage, and React providers created from config
  to lazy IndexedDB storage. Preserve caller-supplied storage and SDK instances. Keep the Effect service
  context when adding default storage to an existing core config.
- e48eedc: Add HCA account inspection, EntryPoint deposits and owner-authorized withdrawals, signature verification, and upgrades with both directional gate checks. Expose factory, upgrade-gate, and trusted-set governance through hca/admin and sdk.hca.admin. Include exact deployed ABI fragments and an explicit function-coverage catalogue.
- 0943f56: Add the optional HCA adapter package with typed execution envelopes, versioned tracking codecs,
  review and fee policies, and capability extensions. Preserve provider submission types through the
  SDK and add shared bounded execution waiting/watching with cancellation and receipt confirmation checks.

  Reserve type-only Rhinestone and Pimlico entrypoints for the initial provider integrations.

- b9073ba: Add 16 HCA account, deployment, owner-execution and tracking actions with the existing sdk.hca group.
  Support direct atomic owner transactions and an explicit execution adapter boundary without wallet
  fallback. Add matching execution ABI fragments, profile configuration, session revocation, and
  validated submission tracking. Provider packages and session execution remain future work.
- 9bef00b: Add resumable same-chain HCA registration with caller-owned revision-checked storage, explicit
  spending limits, atomic registration and resolver grants, optional primary-name setup, and safe
  submission reconciliation. Expose start, get, resume, and local cancellation on the existing SDK.
- 47095d1: Add fixed-policy HCA destination sessions and a Rhinestone execution adapter. Core exposes owner
  enablement, bounded refunds, enabled-status reads and confirmed session references. Session plans
  validate complete calldata and reconcile expiry, replacement and nonce revocation.

  The optional Rhinestone subpath requires SDK 1.8.0 with the shipped compatibility patch. It supports
  prefunded same-chain destination execution, SDK signing, on-chain signature verification and
  restorable public intent tracking. Hosted relayer settlement remains a release verification step.

- c1e8c43: Add shared config workflow storage with memory and IndexedDB adapters, generated workflow IDs,
  automatic unfinished-operation recovery, transaction checkpoints, and workflow inspection and
  reconciliation. Preserve explicit resume and legacy HCA storage while allowing HCA registration
  and independent Rhinestone funding to use config storage.

### Patch Changes

- Updated dependencies [0ced8e8]
- Updated dependencies [e48eedc]
- Updated dependencies [41bf652]
- Updated dependencies [0943f56]
- Updated dependencies [b9073ba]
- Updated dependencies [8aa0bb6]
- Updated dependencies [0a68e20]
- Updated dependencies [9bef00b]
- Updated dependencies [47095d1]
- Updated dependencies [bdf2872]
- Updated dependencies [c1e8c43]
- Updated dependencies [f53985c]
  - @ensforge/core@0.4.0

## 0.3.1

### Patch Changes

- aed1b6d: Move package repository metadata and release provenance to the Namespace GitHub organization.
- Updated dependencies [aed1b6d]
  - @ensforge/core@0.3.1

## 0.3.0

### Minor Changes

- 2f7b053: Expose all indexer actions through the grouped SDK and add Effect Atom query and Suspense hooks for
  the complete indexer surface.

### Patch Changes

- 1f829bd: Support Wagmi 2.19 and 3.x, including RainbowKit applications, and point package homepages to
  ensforge.com.
- Updated dependencies [ab3b407]
- Updated dependencies [67227c2]
- Updated dependencies [2448cb6]
- Updated dependencies [722707f]
- Updated dependencies [7f43949]
- Updated dependencies [1f829bd]
  - @ensforge/core@0.3.0

## 0.2.0

### Minor Changes

- a5f4353: Add group-scoped Core and SDK type entrypoints, slim the SDK and React root type surfaces, and
  resolve workspace packages through generated declarations to improve editor IntelliSense. Import
  action-specific SDK types from `@ensforge/sdk/<group>`.

  Wagmi integration now uses the optional `@ensforge/core/wagmi` and `@ensforge/sdk/wagmi`
  entrypoints, so viem-only consumers no longer install Wagmi. Sequential write plans retain submitted
  transaction hashes across confirmation failures and resume without resubmission.

### Patch Changes

- Updated dependencies [94e55fe]
- Updated dependencies [a5f4353]
  - @ensforge/core@0.2.0

## 0.1.1

### Patch Changes

- @ensforge/core@0.1.1

## 0.1.0

### Minor Changes

- 4f93c0d: Release the initial production-ready ensforge packages.

### Patch Changes

- Updated dependencies [4f93c0d]
  - @ensforge/core@0.1.0
