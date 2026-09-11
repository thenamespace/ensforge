# @ensforge/core

## 0.4.0

### Minor Changes

- 0ced8e8: Support custom ENS V1 and V2 deployment profiles in Viem and Wagmi configuration. Validate chain IDs and complete contract address groups, snapshot custom deployments, and avoid inheriting preset indexer endpoints. Resolved network IDs and chain IDs now support arbitrary deployments; runtime deployment provenance is optional.
- e48eedc: Add HCA account inspection, EntryPoint deposits and owner-authorized withdrawals, signature verification, and upgrades with both directional gate checks. Expose factory, upgrade-gate, and trusted-set governance through hca/admin and sdk.hca.admin. Include exact deployed ABI fragments and an explicit function-coverage catalogue.
- 0943f56: Add the optional HCA adapter package with typed execution envelopes, versioned tracking codecs,
  review and fee policies, and capability extensions. Preserve provider submission types through the
  SDK and add shared bounded execution waiting/watching with cancellation and receipt confirmation checks.

  Reserve type-only Rhinestone and Pimlico entrypoints for the initial provider integrations.

- b9073ba: Add 16 HCA account, deployment, owner-execution and tracking actions with the existing sdk.hca group.
  Support direct atomic owner transactions and an explicit execution adapter boundary without wallet
  fallback. Add matching execution ABI fragments, profile configuration, session revocation, and
  validated submission tracking. Provider packages and session execution remain future work.
- 8aa0bb6: Add the Pimlico owner execution adapter using permissionless, with optional ETH sponsorship,
  first-operation HCA deployment, bounded fee reviews, and on-chain UserOperation receipt tracking.
  Expose the deployed EntryPoint execution fragment and explicit counterfactual owner verification.
- 9bef00b: Add resumable same-chain HCA registration with caller-owned revision-checked storage, explicit
  spending limits, atomic registration and resolver grants, optional primary-name setup, and safe
  submission reconciliation. Expose start, get, resume, and local cancellation on the existing SDK.
- 47095d1: Add fixed-policy HCA destination sessions and a Rhinestone execution adapter. Core exposes owner
  enablement, bounded refunds, enabled-status reads and confirmed session references. Session plans
  validate complete calldata and reconcile expiry, replacement and nonce revocation.

  The optional Rhinestone subpath requires SDK 1.8.0 with the shipped compatibility patch. It supports
  prefunded same-chain destination execution, SDK signing, on-chain signature verification and
  restorable public intent tracking. Hosted relayer settlement remains a release verification step.

- bdf2872: Add a shared namespaced HCA storage contract with atomic revision updates. Registration accepts the common backend while preserving existing registration storage implementations.
- c1e8c43: Add shared config workflow storage with memory and IndexedDB adapters, generated workflow IDs,
  automatic unfinished-operation recovery, transaction checkpoints, and workflow inspection and
  reconciliation. Preserve explicit resume and legacy HCA storage while allowing HCA registration
  and independent Rhinestone funding to use config storage.
- f53985c: Expose memory storage and adapter types from `@ensforge/core/storage`, and lazy IndexedDB storage
  from `@ensforge/core/storage/browser`. Existing root imports remain available.

### Patch Changes

- 41bf652: Rename the internal HCA call hash module to prevent browser privacy filters from blocking SDK imports during local development. Public APIs and transaction hashes are unchanged.
- 0a68e20: Align HCA execution with verified Sepolia provider behavior: record the intent executor adapter, validate same-chain signature envelopes against the reviewed nonce, bound session-history log requests, and check Pimlico self-funded prefunds. Review packed cross-chain token IDs and pin proxy implementation storage alongside contract bytecode. Reject unsupported source-funded destination quotes before signing; token-paid Rhinestone refunds remain outside the supported release boundary.
- Updated dependencies [e48eedc]
- Updated dependencies [77bca68]
- Updated dependencies [b9073ba]
- Updated dependencies [8aa0bb6]
- Updated dependencies [0a68e20]
- Updated dependencies [47095d1]
- Updated dependencies [d9025fa]
  - @ensforge/contracts@0.4.0

## 0.3.1

### Patch Changes

- aed1b6d: Move package repository metadata and release provenance to the Namespace GitHub organization.
- Updated dependencies [aed1b6d]
  - @ensforge/contracts@0.3.1

## 0.3.0

### Minor Changes

- ab3b407: Add relation-aware address discovery, indexed resolved-name lookup, name search, cross-protocol
  subname pagination, evidence-based encoded-label recovery, record inventories, and resolver-record
  history to the indexer entrypoints. Add cross-protocol registration discovery and unified semantic
  name/event history with focused registration history queries. Add V2 registry, namespace
  relationship, and role-assignment discovery.
  Add cross-protocol resolver details plus V2 resolver ownership, ENSIP-16 metadata, and delegate
  approval discovery.
  Use the newer ENS staging GraphQL deployment for Sepolia V2 discovery and validate live coverage
  against the indexed `ensforge-smoke.eth` fixture hierarchy.
  Keep registration feeds server-filterable, require bounded resolver-approval selectors, default
  address discovery to effective ownership, and push registry role resource filters into the V2
  connection. Require a name anchor for semantic event kinds that the V2 indexer cannot filter by
  wire event type.
- 67227c2: Add the ENS indexer configuration and GraphQL transport foundation, including network-aware source
  defaults, lazy authentication headers, request cancellation, timeouts, transient retries, and typed
  indexer errors through the isolated `@ensforge/core/indexer` entrypoint.
  Use Effect's fetch HTTP client for indexer requests and emit generated operations as typed query
  strings so consumers do not install GraphQL transport or runtime packages.
- 2448cb6: Add stable Schema-backed indexed-name models, portable name filters and ordering, protocol-aware V1
  and V2 normalization, versioned multi-source cursors, and deterministic cross-indexer page merging.
- 722707f: Add `getIndexedName` and cursor-paginated `getNames` actions with generated V1/V2 queries,
  protocol-neutral models, V2-preferred routing, cross-source deduplication, and partial-source status.
- 7f43949: Add generated ENSv1 and ENSv2 indexer operations and the protocol-neutral `getIndexerStatus` action,
  including source health, indexed block metadata, explicit unavailable or disabled states, and safe
  per-source failures.

### Patch Changes

- 1f829bd: Support Wagmi 2.19 and 3.x, including RainbowKit applications, and point package homepages to
  ensforge.com.
- Updated dependencies [1f829bd]
  - @ensforge/contracts@0.3.0

## 0.2.0

### Minor Changes

- 94e55fe: Align the Sepolia ENSv2 deployment, contract interfaces, initializer fragments, interface IDs, and
  renewal execution with the contracts deployed from the pinned July source snapshot. Remove
  forward-looking interface and contract-batch renewal exports that are not available onchain.
- a5f4353: Add group-scoped Core and SDK type entrypoints, slim the SDK and React root type surfaces, and
  resolve workspace packages through generated declarations to improve editor IntelliSense. Import
  action-specific SDK types from `@ensforge/sdk/<group>`.

  Wagmi integration now uses the optional `@ensforge/core/wagmi` and `@ensforge/sdk/wagmi`
  entrypoints, so viem-only consumers no longer install Wagmi. Sequential write plans retain submitted
  transaction hashes across confirmation failures and resume without resubmission.

### Patch Changes

- Updated dependencies [94e55fe]
  - @ensforge/contracts@0.2.0

## 0.1.1

### Patch Changes

- @ensforge/contracts@0.1.1

## 0.1.0

### Minor Changes

- 4f93c0d: Release the initial production-ready ensforge packages.

### Patch Changes

- Updated dependencies [4f93c0d]
  - @ensforge/contracts@0.1.0
