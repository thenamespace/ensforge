---
"@ensforge/sdk": minor
---

Safer ENSv2 transfers and registry attachment.

- `name.transfer` takes `unsafe: "auto"` by default: a safe transfer when the registry allows
  one, else `unsafeTransfer` (which still checks the receiver) with the warning
  `TRANSFER_UNSAFE` saying why. Transfers of `subname.create`d children, whose registries are not
  emancipated, no longer fail. `unsafe: false` refuses before sending.
- Roles other accounts hold on an ENSv2 name are reported (`ROLES_RETAINED`). The new
  `delegates: "revoke"` revokes them in the same step before the move, with holders the indexer
  lists and the chain confirms (`INDEXER_BEHIND` when they do not add up,
  `INDEXER_NOT_CONFIGURED` without an indexer); the move uses the token ID the revocations leave.
- `name.transfer` takes `setEthAddress`, writing the recipient as the ETH address first.
- `registry.attach` and `registry.deploy({ attachTo })` refuse to replace an existing subregistry
  with the new `NameStateError` code `SUBREGISTRY_EXISTS` unless `replace: true`, refuse
  addresses that are not a registry a name can hold (`INVALID_ADDRESS`), and warn
  (`REGISTRY_UPGRADE_AVAILABLE`) on outdated ones. `setParent` gets a label known only by its
  hash from the LabelStore, and is skipped with `REGISTRY_PARENT_UNSET` when it is unknown.
- Revert hints for unsafe transfers no longer mention skipped receiver checks.
