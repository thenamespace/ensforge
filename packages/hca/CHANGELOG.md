# @ensforge/hca

## 1.1.0

### Minor Changes

- 4497b28: Smaller bundles, with unchanged types and behaviour.

  - Error translation (viem errors and reverts decoded against every ENS contract error) loads on the first failure that needs it instead of with every action. One read (`Actions.record.getText`) is 20% smaller up front (42.5 → 34.1 kB gzip), the Effect API 23%, `@ensforge/hca` 22% and `@ensforge/react` 10%. `Errors.fromCause` and `Errors.describe` stay synchronous.
  - `ensActions()` loads its rarely used groups (`approval`, `dns`, `event`, `migration`, `permission`, `registry`, `role`, `wrapper`) and `batch` with their first call instead of with the client: a client with every action is 15% smaller up front (107.6 → 91.7 kB gzip). Their own decorators (`migrationActions()`, …) still load with the client.
  - Code for L2 and off-chain names loads only when a name needs it.

- 4497b28: **Breaking:** `Ensforge.create` configures one client for every chain.

  - `Ensforge.create({ chain })` is enough to read: ensforge builds its own viem clients and uses each chain's public RPC when `transports` has none for it (`publicRpc`, default `true`).
  - `transports: { [chainId]: Transport }` sets the RPC of any chain, the ENS chain included. Reuse a viem client with `custom(client)`.
  - `wallet` signs on every chain: a write on another chain asks the wallet to switch first (`switchChain`, default `true`). A getter receives the chain the write is for.
  - A local `account` (`privateKeyToAccount(key)`) signs on any chain itself, without a wallet client.
  - `pollingInterval` and `cacheTime` apply to the clients ensforge builds.
  - `ens.client(chainId?)` returns the viem client of any chain (the ENS chain by default).
  - Standalone actions take any viem client as `ViemClientLike`: a `PublicClient`, `WalletClient`, test client or `createClient` client. It leaves out viem's generic `extend` and typed `request`, so apps that create the viem client inline type-check with about 69% fewer type instantiations. HCA actions take the same type.
  - `Ensforge.fromWagmi` builds on the same options; nothing changes for wagmi apps. A write on a chain the wagmi config does not have fails with `CHAIN_NOT_CONFIGURED` before the wallet is asked to switch.

  | 1.0                                                      | 1.1                                                                                                      |
  | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
  | `Ensforge.create({ publicClient })`                      | `Ensforge.create({ chain, transports: { [chain.id]: transport } })`, or just `{ chain }` for public RPCs |
  | `walletClient`                                           | `wallet`                                                                                                 |
  | `chains: { [id]: { publicClient, walletClient } }`       | `transports: { [id]: transport }`; the one `wallet` (or local `account`) signs there                     |
  | `ens.publicClient`                                       | `ens.client()`                                                                                           |
  | `ChainClients` type                                      | removed                                                                                                  |
  | `CHAIN_NOT_CONFIGURED` for a chain missing from `chains` | only for a chain without a transport when `publicRpc` is `false`, or a chain ensforge does not know      |

### Patch Changes

- Updated dependencies [b35e6c5]
- Updated dependencies [4497b28]
- Updated dependencies [4497b28]
- Updated dependencies [4497b28]
- Updated dependencies [4497b28]
  - @ensforge/contracts@1.1.0
  - @ensforge/sdk@1.1.0

## 1.0.1

### Patch Changes

- 9c3051f: - HCA reads have `.request`, so they run in `Actions.batch` and React's `useReads`.
  - `Errors.describe` has end-user copy for every `HcaError` code.
  - Removed `HCA_SAME_CHAIN_SOURCE`, which nothing raised.
  - A new README.
- e854649: The docs now say that `hca()` uses one executor and never falls back, that an upgrade needs the DAO's upgrade set plus the new implementation's `canUpgradeFrom` check, what a session's resolver may be, and how to pass `dehydrate` output to Next.js `getServerSideProps`.
- Updated dependencies [e338a7f]
- Updated dependencies [9c3051f]
- Updated dependencies [a393fc9]
- Updated dependencies [9c3051f]
  - @ensforge/sdk@1.0.1
  - @ensforge/contracts@1.0.1

## 1.0.0

### Major Changes

- 1743efc: ensforge 1.0: ENS Hosted Contract Accounts on the 1.0 client. Pass `via: hca()` to any write to run it through the user's HCA in one execution, with executors for the owner's wallet, any ERC-4337 bundler (`bundler()`, `pimlico()`) and Rhinestone intents (`rhinestone({ sdk })`), or your own (`defineExecutor`). Sessions, deposits, upgrades and governance actions follow the SDK's conventions. The 0.x HCA API is removed.

### Patch Changes

- Updated dependencies [1743efc]
- Updated dependencies [1743efc]
  - @ensforge/contracts@1.0.0
  - @ensforge/sdk@1.0.0

## 0.6.1

### Patch Changes

- 4ebad9b: Support viem versions from 2.49.0 and use a peer dependency in the contracts package so applications can share their installed viem version.

  Keep V1 names visible when both indexers are enabled. Interpret indexed migration flags as ENSv1-to-ENSv2 migration rather than the historical V1 registry migration.

  Include names without a recorded expiry in expiryAfter filters, with consistent local filtering and pagination on the V2 indexer. Upper expiry bounds continue to require a recorded expiry.

- Updated dependencies [4ebad9b]
  - @ensforge/contracts@0.6.1
  - @ensforge/core@0.6.1

## 0.6.0

### Minor Changes

- 9d82878: Migrate Sepolia ENSv2 to the October 1 deployment snapshot 07e55a05. Update contract addresses and deployed ABIs, export the ENS URI renderers and VerifiableFactory address prediction, and refresh the indexer schema and migration guides. Mainnet behavior is unchanged.

  Support idempotent HCA deployment: preserve verification of existing accounts after deployment approval is revoked, reject unapproved new deployments, and report account reuse when deployments race. Recreate Sepolia fixtures and HCA accounts for the new factory, keeping workflow state separate from earlier deployments.

  Update the pinned devnet build and preserve the deployed Solidity submodule revisions rather than replacing them with revisions from the stale upstream lockfile.

  Require Effect 4 stable (`effect@^4.0.0`) and migrate HTTP and reactivity imports to their new export paths. Upgrade the React Atom integration to 4.0.0 and preserve HCA funding status return types with the updated Effect inference.

  Applications upgrading from the release candidate must install `effect@^4` alongside ensforge. Update any direct imports from `effect/unstable/http` and `effect/unstable/reactivity` to `effect/http` and `effect/reactivity`.

### Patch Changes

- Updated dependencies [9d82878]
  - @ensforge/contracts@0.6.0
  - @ensforge/core@0.6.0

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
  - @ensforge/contracts@0.5.0
  - @ensforge/core@0.5.0

## 0.4.0

### Minor Changes

- 0943f56: Add the optional HCA adapter package with typed execution envelopes, versioned tracking codecs,
  review and fee policies, and capability extensions. Preserve provider submission types through the
  SDK and add shared bounded execution waiting/watching with cancellation and receipt confirmation checks.

  Reserve type-only Rhinestone and Pimlico entrypoints for the initial provider integrations.

- 8aa0bb6: Add the Pimlico owner execution adapter using permissionless, with optional ETH sponsorship,
  first-operation HCA deployment, bounded fee reviews, and on-chain UserOperation receipt tracking.
  Expose the deployed EntryPoint execution fragment and explicit counterfactual owner verification.
- f1147a9: Expose HCA and workflow hooks through the existing React provider, with generic action bindings for
  provider extensions. Add authenticated remote registration orchestration with explicit session signer
  custody and redacted progress responses.
- 9bef00b: Add resumable same-chain HCA registration with caller-owned revision-checked storage, explicit
  spending limits, atomic registration and resolver grants, optional primary-name setup, and safe
  submission reconciliation. Expose start, get, resume, and local cancellation on the existing SDK.
- 9ba5df0: Add independent Rhinestone EOA/Permit2 funding with reviewed route manifests, bounded approvals and signatures, shared HCA storage, receipt observation, recovery and explicit cleanup calls. Public source routes remain disabled pending hosted settlement proofs.
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

### Patch Changes

- 0a68e20: Align HCA execution with verified Sepolia provider behavior: record the intent executor adapter, validate same-chain signature envelopes against the reviewed nonce, bound session-history log requests, and check Pimlico self-funded prefunds. Review packed cross-chain token IDs and pin proxy implementation storage alongside contract bytecode. Reject unsupported source-funded destination quotes before signing; token-paid Rhinestone refunds remain outside the supported release boundary.
- Updated dependencies [0ced8e8]
- Updated dependencies [e48eedc]
- Updated dependencies [41bf652]
- Updated dependencies [77bca68]
- Updated dependencies [0943f56]
- Updated dependencies [b9073ba]
- Updated dependencies [8aa0bb6]
- Updated dependencies [0a68e20]
- Updated dependencies [9bef00b]
- Updated dependencies [47095d1]
- Updated dependencies [bdf2872]
- Updated dependencies [d9025fa]
- Updated dependencies [c1e8c43]
- Updated dependencies [f53985c]
  - @ensforge/core@0.4.0
  - @ensforge/contracts@0.4.0
