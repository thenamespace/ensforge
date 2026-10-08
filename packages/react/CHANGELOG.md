# @ensforge/react

## 0.6.1

### Patch Changes

- 4ebad9b: Support viem versions from 2.49.0 and use a peer dependency in the contracts package so applications can share their installed viem version.

  Keep V1 names visible when both indexers are enabled. Interpret indexed migration flags as ENSv1-to-ENSv2 migration rather than the historical V1 registry migration.

  Include names without a recorded expiry in expiryAfter filters, with consistent local filtering and pagination on the V2 indexer. Upper expiry bounds continue to require a recorded expiry.

- Updated dependencies [4ebad9b]
  - @ensforge/core@0.6.1
  - @ensforge/sdk@0.6.1

## 0.6.0

### Minor Changes

- 9d82878: Migrate Sepolia ENSv2 to the October 1 deployment snapshot 07e55a05. Update contract addresses and deployed ABIs, export the ENS URI renderers and VerifiableFactory address prediction, and refresh the indexer schema and migration guides. Mainnet behavior is unchanged.

  Support idempotent HCA deployment: preserve verification of existing accounts after deployment approval is revoked, reject unapproved new deployments, and report account reuse when deployments race. Recreate Sepolia fixtures and HCA accounts for the new factory, keeping workflow state separate from earlier deployments.

  Update the pinned devnet build and preserve the deployed Solidity submodule revisions rather than replacing them with revisions from the stale upstream lockfile.

  Require Effect 4 stable (`effect@^4.0.0`) and migrate HTTP and reactivity imports to their new export paths. Upgrade the React Atom integration to 4.0.0 and preserve HCA funding status return types with the updated Effect inference.

  Applications upgrading from the release candidate must install `effect@^4` alongside ensforge. Update any direct imports from `effect/unstable/http` and `effect/unstable/reactivity` to `effect/http` and `effect/reactivity`.

### Patch Changes

- Updated dependencies [9d82878]
  - @ensforge/core@0.6.0
  - @ensforge/sdk@0.6.0

## 0.5.0

### Minor Changes

- afe2eab: Migrate the Sepolia ENSv2 profile to deployment snapshot 71a3b733, including deployed ABIs, resolver permissions and record setters, registration, registry transfers, and HCA upgrade sets.

  HCA sessions now use reusable owner-signed authorization proofs rather than an on-chain enablement transaction. Pass the returned proof through the session authorization when executing with Rhinestone. Recreate Sepolia HCA accounts and fixtures for the new factory; old deployment workflow state and session proofs are not compatible.

  Add deployment verification commands, a pinned local devnet build, and updated playground setup and migration documentation. Mainnet behavior is unchanged.

  Sepolia Permissioned Resolver grants now require explicit scope-widening consent because record-key roles apply across names. Public-key writes and bulk record clearing are unsupported on that resolver. Registry transfers remain safe by default and expose an explicit unsafe-transfer option for compatible registry workflows.

  Fix Rhinestone stateless-session signing and validate HCA registrar token approvals against the current rent oracle, including mintable Sepolia test tokens. Update HCA funding examples to distinguish registration token balances from refund and cross-chain funding. Decode the new ENSv2 resolver record-update event formats and refresh live migration fixtures.

  Refresh the Sepolia V2 GraphQL schema and generated operations. Include record-model updates in general event-history filters and decode EAC role changes from their resulting bitmap, including complete revocation. Allow schema refreshes for a single protocol.

### Patch Changes

- Updated dependencies [afe2eab]
  - @ensforge/core@0.5.0
  - @ensforge/sdk@0.5.0

## 0.4.0

### Minor Changes

- f53985c: Default SDK instances to their own memory workflow storage, and React providers created from config
  to lazy IndexedDB storage. Preserve caller-supplied storage and SDK instances. Keep the Effect service
  context when adding default storage to an existing core config.
- f1147a9: Expose HCA and workflow hooks through the existing React provider, with generic action bindings for
  provider extensions. Add authenticated remote registration orchestration with explicit session signer
  custody and redacted progress responses.

### Patch Changes

- f53985c: Preserve action parameter, success and failure types in generated named query and mutation declarations.
- Updated dependencies [0ced8e8]
- Updated dependencies [f53985c]
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
  - @ensforge/sdk@0.4.0

## 0.3.1

### Patch Changes

- aed1b6d: Move package repository metadata and release provenance to the Namespace GitHub organization.
- Updated dependencies [aed1b6d]
  - @ensforge/sdk@0.3.1

## 0.3.0

### Minor Changes

- 2f7b053: Expose all indexer actions through the grouped SDK and add Effect Atom query and Suspense hooks for
  the complete indexer surface.

### Patch Changes

- 1f829bd: Support Wagmi 2.19 and 3.x, including RainbowKit applications, and point package homepages to
  ensforge.com.
- Updated dependencies [2f7b053]
- Updated dependencies [1f829bd]
  - @ensforge/sdk@0.3.0

## 0.2.0

### Minor Changes

- a5f4353: Add group-scoped Core and SDK type entrypoints, slim the SDK and React root type surfaces, and
  resolve workspace packages through generated declarations to improve editor IntelliSense. Import
  action-specific SDK types from `@ensforge/sdk/<group>`.

  Wagmi integration now uses the optional `@ensforge/core/wagmi` and `@ensforge/sdk/wagmi`
  entrypoints, so viem-only consumers no longer install Wagmi. Sequential write plans retain submitted
  transaction hashes across confirmation failures and resume without resubmission.

### Patch Changes

- Updated dependencies [a5f4353]
  - @ensforge/sdk@0.2.0

## 0.1.1

### Patch Changes

- 16f5713: Adopt Effect Atom-native read and mutation options, result state, and cache helper names while preserving `mutate`, `mutateAsync`, and `mutateEffect`.
- @ensforge/sdk@0.1.1

## 0.1.0

### Minor Changes

- 4f93c0d: Release the initial production-ready ensforge packages.

### Patch Changes

- Updated dependencies [4f93c0d]
  - @ensforge/sdk@0.1.0
