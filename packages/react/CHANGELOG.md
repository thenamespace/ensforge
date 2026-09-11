# @ensforge/react

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
