---
"@ensforge/sdk": minor
"@ensforge/hca": minor
"@ensforge/contracts": minor
---

ensforge 1.2.0 fixes the differences an audit found between ensforge and the ENS app, and makes
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
