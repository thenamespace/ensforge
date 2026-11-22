# @ensforge/core

## 1.2.0

### Minor Changes

- d1b9625: ensforge 1.2.0 fixes the differences an audit found between ensforge and the ENS app, and makes
  writes that would fail late, or succeed while doing nothing, fail before anything is sent. See
  the upgrade guide, "Upgrade from ensforge 1.1", for code changes.

  ### Behaviour changes
  - **Registration resolver.** A name the signer owns now goes on the signer's shared
    PermissionedResolver (`resolver: "owned"`, one per wallet at the ENS app's address), deployed
    with the first registration and reused. `resolver: "new"` deploys one per name as before. A
    commitment made by ensforge 1.1 with the default resolver is revealed with `resolver: "new"`;
    without it, `register` commits again.
  - **Transfers.** `name.transfer` takes `unsafe: "auto"` by default: a safe transfer when the
    registry allows one, else `unsafeTransfer` with the warning `TRANSFER_UNSAFE`. Pass
    `unsafe: false` to refuse instead.
  - **Switching resolvers.** `record.set({ resolver })` onto a resolver that already holds records
    for the name starts a fresh record there, as `clear: true` would. Pass `clear: false` for the
    old merge.
  - **Migration records.** Records that cannot be copied (a public key, an unknown key, or an
    incomplete list from the indexer) fail with `RECORDS_UNKNOWN` unless `allowIncompleteRecords`.
  - **Renewal steps.** Each `renewBatch` call is its own plan step (`renew:v2:0`, `renew:v1:0`, …;
    `renew` when there is one).
  - **Unwrapping.** `wrapper.unwrap` leaves the name with its current holder by default, not the
    signer. Pass `owner` to send it elsewhere.
  - **Role names.** `role.grant` and `role.revoke` read role names from the table of the contract
    they target. `roles: ["setAddr"]` with `target: "registry"` used to grant `registrar`; it now
    fails with `INVALID_ROLES`. The option types accept `Role.RegistryName` for registries and
    `Role.ResolverName` for resolvers, so a `Role.Name[]` variable must be narrowed.
  - **`@ensforge/hca`.** `rhinestone()` no longer requests sponsorship: executions pay their fee
    from the HCA. Pass `sponsored: true` if your Rhinestone project sponsors gas. Writes through
    `via: hca()` fund the HCA from the owner's wallet when it holds too little; pass
    `hca({ funding: "none" })` to fail instead.

  ### Registration and renewal
  - Through `via: hca()`, the commit is one HCA execution and the reveal another: the payment
    approval, the HCA's shared resolver, the registrations, their records, the primary name and
    the approval reset to zero.
  - `register({ primaryName: true })` writes the owner's default name (`default.reverse`) and
    clears an `addr.reverse` entry with another name, as the ENS app does.
  - A commitment that is not ready yet is waited for from the block that recorded it, instead of
    failing with `COMMITMENT_TOO_NEW`. `Plan.Step.waitFor` gains `since`. An expired commitment
    with the same secret is made again (warning `COMMITMENT_RECOMMITTED`). `registration.commit`
    reports `COMMITMENT_EXISTS` for any unexpired commitment.
  - `register` and `commit` refuse the zero owner (`INVALID_ADDRESS`), a subregistry without a
    contract (`REGISTRY_NOT_FOUND`) and a resolver without a contract (`RESOLVER_NOT_DEPLOYED`)
    before the commitment is paid for. Durations must be at most 100 years (`INVALID_DURATION`).
  - `renew` refuses a renewal in grace that would leave the name expired (`DURATION_TOO_SHORT`,
    naming the shortest duration that works).
  - New `until` option on `renew` and `getRenewalPrice`: every name is extended to one expiry, and
    names already reaching it are skipped, so a retry never pays twice (`NAME_ALREADY_RENEWED`
    when nothing is left). `getRenewalPrice` items carry `expiry` and `duration`.
  - An allowance covering the exact price is not approved again. A new registration approval adds
    2% headroom. Names typed in another form warn `NAME_NORMALIZED`. The referrer takes up to 32
    bytes of hex, left-padded.
  - `getPrice` quotes the registrar's own `getRegisterPrice`, and a past block with that block's
    price oracle.
  - Routed `register` and `renew` count the signer's payment token balance
    (`Plan.Requirement.account` names the account).

  ### Migration
  - New `resume` option on `migration.migrate`: names already on ENSv2 get only the steps an
    interrupted run left after the transfer (subnames still on ENSv1, PublicResolverV2 records
    from `records`), and names not moved yet migrate as usual. It fails with `ALREADY_MIGRATED`
    when nothing is left. `plan.resume` still finishes a stored plan.
  - Plans whose steps after the transfer are separate transactions warn `NOT_ATOMIC`.
  - Steps are sized by a gas cost model (15M per step), and `Plan.Step.gas` carries the estimate.
  - Through the signer's HCA, migration calls ENS's MigrationHelper: the owner approves
    MigrationHelper, never the HCA, and the NameWrapper approval added for the run is revoked in a
    last step.
  - A retry reuses a resolver or registry an interrupted run created only when it belongs to the
    same owner (blockers `resolver-conflict`, `registry-conflict`).
  - New blockers: `recipient-cannot-receive` for an owner that cannot receive ERC-1155 tokens,
    `wrapper-out-of-sync` for a wrapped name renewed without the NameWrapper being told, and
    `uncertified-parent-registry` for a locked child whose parent registry is not the
    WrapperRegistry its migration created.
  - New action `wrapper.sync` (and `wrapper.syncSync`) calls `ETHRenewerV1.syncWrapper`. A name
    late in grace whose reservation lapsed can migrate with `renew`.
  - Records on a custom resolver are copied too, read through resolution (warning
    `RECORDS_FROM_CUSTOM_RESOLVER`). ABI, interface, data and name records are copied, and the
    content hash as its raw bytes.
  - A locked `cannotSetResolver` name migrated through an HCA has its records copied to
    PublicResolverV2 in the same execution. Migrating one with records to another `owner` fails
    (`records-not-replayable`) unless `allowEmptyResolver`.
  - An emancipated child without `cannotUnwrap` is planned as detached, not locked: its subnames go
    into a UserRegistry. `migrateSync` verifies recreated subnames and WrapperRegistries
    (`VERIFICATION_FAILED`). Names are planned parents first whatever the input order.
  - Recreated wrapped subnames keep a future wrapper expiry (`SUBNAME_EXPIRY_EXTENDED` for a past
    one). `preserveManager` can be set per name.

  ### Transfers, registries and roles
  - Roles other accounts hold on an ENSv2 name are reported (`ROLES_RETAINED`). The new
    `delegates: "revoke"` revokes them before the move, with holders the indexer lists and the
    chain confirms (`INDEXER_BEHIND`, `INDEXER_NOT_CONFIGURED`).
  - `name.transfer` takes `setEthAddress`. `records: "handover"` hands over a PermissionedResolver
    only when it serves the name alone (`INVALID_RECORD_VALUE` otherwise, warning
    `RESOLVER_SHARING_UNCHECKED` when the indexer cannot answer).
  - `registry.attach` and `registry.deploy({ attachTo })` refuse to replace a subregistry
    (`SUBREGISTRY_EXISTS`) unless `replace: true`, refuse addresses that are not a registry
    (`INVALID_ADDRESS`), and warn `REGISTRY_UPGRADE_AVAILABLE` on outdated ones.
  - `role.revoke` refuses to revoke `canTransferAdmin` from a name's owner unless
    `allowIrreversible: true`, and warns `ROLE_ADMIN_LOCKOUT` when an admin role loses its last
    holder. An explicit `contract`, or a name's resolver, must be the kind `target` names.
  - New `Role.RegistryName`, `Role.ResolverName` and `Role.NameOf<target>` types; `Role.from` and
    `Role.has` take an optional `target`.
  - PermissionedResolvers ensforge deploys give their writers every role, as the ENS app requires.
    Reusing a shared resolver from ensforge 1.0 or 1.1 warns `RESOLVER_ROLES_PARTIAL`.
    `resolver.create` honours `via`.

  ### Records and primary names
  - `record.set({ clear: true })` alone gives a PermissionedResolver name a fresh, empty record.
    Node-keyed resolvers that cannot clear warn `RECORDS_MAY_REMAIN`. `resolver.link({ to: null })`
    unlinks a name.
  - ABI records are encoded as zlib (2) or CBOR (4) from an `Abi`, and as a URI (8) from a string.
    Deleting an ABI without a content type clears every content type the resolver holds.
  - `record.set` and `resolver.set` refuse a resolver without a contract (`RESOLVER_NOT_DEPLOYED`);
    `resolver.set({ allowNonContract: true })` still allows it.
  - `primaryName.set({ ensureForward: true })` writes the missing ETH address first. An
    `addr.reverse` entry with a resolver outranks the default name, as ENS resolves it: clearing
    the Ethereum name removes that entry's resolver, and the new `coin: "all"` sets or clears both.
  - `primaryName.set` honours `via`, through the reverse registrar adapters' HCA entry points
    (warning `PRIMARY_NAME_ROUTED_TO_SIGNER` when the call goes to the signer).
  - L2 primary names: a client on mainnet sets them on mainnet L2s and one on Sepolia on testnets.
    Naming another address on an L2 checks that the signer owns the contract (`NOT_APPROVED`).

  ### Subnames and the NameWrapper
  - `subname.create({ upsert: true })` changes only what it is given on an existing child. A child
    created for another `owner` with records is created for the signer, given its records, then
    handed over.
  - `subname.remove` refuses an ENSv1 child with subnames of its own (`NAME_HAS_SUBNAMES`) unless
    `allowOrphanedSubnames: true`, with the warning `SUBNAMES_UNCHECKED` without an indexer.
  - ENSv1 subname writes pick a route the registry and NameWrapper accept, or fail before signing,
    naming the route the signer has authority on. Children named by their labelhash are written
    with their real label (warning `WRAPPER_TOKEN_STRANDED` where a token is left controlling
    nothing).

  ### Plans
  - Plans with a wait are simulated across it on RPCs with `eth_simulateV1`, so `register`
    failures show in `.simulate` before the commitment is paid for.

  ### `@ensforge/hca`
  - Session executions through `rhinestone()` send `hcaSessionNonce` and `hcaSessionConfig`, which
    the ENS-patched `@rhinestone/sdk@1.22.0` needs; before, every session-signed intent failed.
  - The orchestrator's route is checked before signing (`HCA_ROUTE_REJECTED`, new `maxRefund`
    option). `rhinestone()` implements `quote` and `quoteRefund`, and `plan.fees` has one entry per
    execution. `hca.authorizeSession({ executor })` sizes the refund gas cap from a quote.
  - Funding moves the shortfall from the owner: a `transfer` in the owner's setup step with
    `owner()`, or an EIP-2612 `permit` and `transferFrom` with relaying executors (warning
    `HCA_FUNDING`). Sessions may pull their refund token this way.
  - An existing HCA's implementation is read through `VerifiableFactory.verifyContract`
    (`untrusted-implementation` when it cannot be verified).
  - `hca.revokeSessions` works on an HCA that is not deployed yet (warning `HCA_DEPLOYED`). A
    session for another HCA fails with `HCA_SESSION_INVALID`. `rhinestone()` takes `ownerAccount`.

  ### `@ensforge/contracts`
  - New `Abis.shared.erc2612`, `Abis.shared.erc1155Receiver`, `Abis.shared.ownable`,
    `InterfaceIds.resolver.addressSetter`, `mainnetL2ReverseRegistrars`,
    `testnetL2ReverseRegistrars`, and `hcaRefundCaps` in `@ensforge/contracts/v2/experimental/hca`.

### Patch Changes

- Updated dependencies [d1b9625]
  - @ensforge/contracts@1.2.0

## 1.1.0

### Minor Changes

- 4497b28: Smaller bundles, with unchanged types and behaviour.

  - Error translation (viem errors and reverts decoded against every ENS contract error) loads on the first failure that needs it instead of with every action. One read (`Actions.record.getText`) is 20% smaller up front (42.5 → 34.1 kB gzip), the Effect API 23%, `@ensforge/hca` 22% and `@ensforge/react` 10%. `Errors.fromCause` and `Errors.describe` stay synchronous.
  - `ensActions()` loads its rarely used groups (`approval`, `dns`, `event`, `migration`, `permission`, `registry`, `role`, `wrapper`) and `batch` with their first call instead of with the client: a client with every action is 15% smaller up front (107.6 → 91.7 kB gzip). Their own decorators (`migrationActions()`, …) still load with the client.
  - Code for L2 and off-chain names loads only when a name needs it.

- 4497b28: Names that live outside ENS's registries: on an L2 (Basenames, Linea Names, Celonames, Durin, Namespace), or with an off-chain provider (Coinbase's `cb.id` and others). ensforge finds where a name lives from its parent's resolver and the deployment's namespaces (`Deployments.Profile.namespaces`), and remembers it for a minute per client.

  **Breaking:**

  - `name.get` reports where a name lives. An L2 name has `kind: "l2"`, `protocol: "l2"`, the L2's `chainId`, and `namespace` (the namespace, its parent, the L2 and the registry there). Its `owner`, `expiry` and `status` come from its L2 (`available` when nobody holds it there, `renewable: false`). A name only a parent's resolver serves has `kind: "offchain"` (a gateway answers) or `kind: "wildcard"` (an on-chain ENSIP-10 resolver answers), `status: "external"`, `available: false`, and `namespace.provider` when ensforge knows the provider. These names were reported as `available` in 1.0. Code that switches over every `NameKind`, `NameStatus` or `protocol` must handle the new members.
  - Writes ensforge does not make on these names fail with the new `NameStateError` code `NAME_EXTERNAL`, whose message names the L2 and namespace, or the provider, instead of `NAME_NOT_REGISTERED`.
  - Records of an L2 name are read on its L2 (`record.get`, `getText`, `getAddress`, `getAvatar`, `getContentHash`, `resolver.get`), not through Ethereum's gateway. Without a transport or public RPC for the L2 they fall back to Ethereum, and `strict` reads fail with `CHAIN_NOT_CONFIGURED`.
  - `indexer.getName`, `getRecords`, `getHistory` and `getSubnames` fail with `INDEXER_UNSUPPORTED` for Linea Names and Celonames names, which no indexer serves, instead of answering as if they did not exist.

  **New:**

  - `name.getNamespace({ name })` returns where a name lives alone, or `null` for names in ENS.
  - Writes on L2 names run on their L2, signed by the client's wallet (asked to switch) or local account there:
    - every namespace: `record.set` (with `clear`), `name.transfer` (its ERC-721 token, Linea's NameWrapper token, and a Basenames second-level name's registry record unless `role: "registrant"`), `approval.setToken` and `approval.getToken`;
    - Basenames and Linea Names, which fork ENSv1: `resolver.set` and `record.set({ resolver })` (`"default"` is the family's current resolver; a Linea name accepts only Linea's PublicResolver), `name.setTtl`, `subname.create`, `subname.update` and `subname.remove` (children get the family's current resolver; records for another `owner` are written before the hand-over), and `approval.setDelegate`/`getDelegate`.
    - Expired or in-grace L2 names fail with `NAME_EXPIRED`, names their L2 does not hold with `NAME_NOT_REGISTERED`, and an L2 the client cannot reach with `CHAIN_NOT_CONFIGURED`: writes never fall back to Ethereum. Routes (`via`) are refused for writes on L2 names; wallet bundles and paymasters work.
  - `approval.setOperator` and `approval.getOperator` take `name` instead of `contract`: the contract that holds that name's token, on the chain the name lives on.
  - `permission.check` and `permission.get` answer for L2 names as their contracts decide (holder, approved address, operators, resolver delegates), limited by a Linea name's burned NameWrapper fuses, which `permission.get` reports. `name.get` reports the TTL of Basenames and Linea names.
  - `primaryName.get` reads a primary name for an L2 with ENS's L2 reverse registrar (Base, OP Mainnet, Arbitrum, Linea, Scroll) on that L2 when the client reaches it: the chain's registrar, then the default name, then the forward check. It works while Ethereum's proof of the L2 fails (Base today), and sees a name as soon as it is set. Otherwise, and for a past `blockNumber`, it reads through Ethereum, whose `GatewayError` then says to add a transport for the chain.

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

- 4497b28: - `record.get` and `record.getAddress` no longer fail with `UNEXPECTED` when a resolver answers `addr(node, coinType)` with something other than ABI-encoded bytes, as world.id's resolver does. The answer counts as none: ETH falls back to the legacy `addr(node)` answer, other EVM chains to the default address.
  - A resolver that rejects its gateway's signed answer (an expired or forged EIP-3668 signature) fails reads with `GatewayError` (`GATEWAY_RESPONSE_INVALID`), not an `UnauthorizedError` the read did not declare.
  - Reads on several chains of one client are batched per chain.
- Updated dependencies [b35e6c5]
  - @ensforge/contracts@1.1.0

## 1.0.1

### Patch Changes

- e338a7f: Actions now declare the error codes they can raise (wallet, nonce, RPC, indexer, gateway, plan, commitment, migration and name-state codes), so their typed errors and the API reference list every code an action can fail with.
- a393fc9: `docsUrl` on every ensforge error now points to the error's page in the API reference, `https://ensforge.com/docs/reference/errors/<CODE>` (it was `https://ensforge.com/errors/<CODE>`).
- 9c3051f: - `Errors.describe` gives end-user copy for the error codes of packages that extend ensforge (such as `@ensforge/hca`), and falls back to generic copy instead of throwing for a code it does not know.
  - New `Plan.deserializeRecord` reads back a saved plan record for custom plan stores; `Plan.localStorage()` now rejects broken records with `PLAN_INVALID`.
  - `Actions.batch` runs reads of extension packages, such as `@ensforge/hca`.
  - Removed the error codes nothing raised: `PRICE_ABOVE_MAXIMUM`, `DNS_OWNER_MISMATCH` and `TRANSACTION_REPLACED`. `INSUFFICIENT_ETH` and `CONTRACT_NOT_DEPLOYED` are documented as errors any write or action can fail with.
  - More examples for `Fuse`, `Name`, `Role`, `CoinType`, `ContentHash` and `Duration`, corrected docs (grace-period renewals, avatar gateways, batch gateways), and a new README.
- Updated dependencies [9c3051f]
  - @ensforge/contracts@1.0.1

## 1.0.0

### Major Changes

- 1743efc: ensforge 1.0: a rewrite of the SDK for ENSv1 and ENSv2. `@ensforge/core` is now `@ensforge/sdk`; the 0.x config-bound `@ensforge/sdk` client and every `./legacy` entry are removed.

  - `Ensforge.create({ publicClient, walletClient })` with action groups added by `extend(ensActions())`, or standalone `Actions.<domain>.<action>(client, options)`; the same actions return `Effect`s from `@ensforge/sdk/effect`.
  - 124 actions across names, records, resolvers, registration and renewal, subnames, registries, permissions, roles, approvals, primary names, the NameWrapper, DNS, migration to ENSv2, events and plans.
  - Writes are plans: `.prepare`, `.simulate`, `.estimateGas`, EIP-5792 batching, resume after failures, `…Sync` variants that wait for receipts, pluggable routes (`via`) and paymasters.
  - Pluggable indexers: `bigname()`, `goldsky()`, `fallback()` and `defineIndexer()` for lists, history and search.
  - `Ensforge.fromWagmi` in `@ensforge/sdk/wagmi`, for wagmi 2 and 3.
  - Typed errors with codes, hints and `Errors.describe` for UI copy. Each action's `ErrorType`, and its Effect error channel, is the classes its `@throws` documents plus `Errors.CommonError` (or `Errors.WriteError` for writes).

### Patch Changes

- Updated dependencies [1743efc]
  - @ensforge/contracts@1.0.0

## 0.6.1

### Patch Changes

- 4ebad9b: Support viem versions from 2.49.0 and use a peer dependency in the contracts package so applications can share their installed viem version.

  Keep V1 names visible when both indexers are enabled. Interpret indexed migration flags as ENSv1-to-ENSv2 migration rather than the historical V1 registry migration.

  Include names without a recorded expiry in expiryAfter filters, with consistent local filtering and pagination on the V2 indexer. Upper expiry bounds continue to require a recorded expiry.

- Updated dependencies [4ebad9b]
  - @ensforge/contracts@0.6.1

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
