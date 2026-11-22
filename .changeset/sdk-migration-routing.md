---
"@ensforge/sdk": minor
---

Migration routing fixes for locked and detached ENSv1 names.

- An emancipated child without `cannotUnwrap` is detached, not locked: the contract deploys it no WrapperRegistry and registers it like an unlocked name. Before, ensforge planned it as locked and registered its subnames into a WrapperRegistry that was never deployed: the calls succeeded, nothing was stored, and `migrate` reported success. Its subnames now go into a UserRegistry under its parent's WrapperRegistry. `migration.get` reports its `after.roles` as the registration roles and no `after.subregistry`.
- Recreated subnames are verified after migrating, and so is a locked name's WrapperRegistry: `migrateSync` fails with `VERIFICATION_FAILED` when one is missing.
- Names are planned parents-first whatever the input order, so a locked child listed before its locked parent migrates into the parent's WrapperRegistry; a child whose parent registry is unknown fails with `NOT_ELIGIBLE` (`parent-not-migrated`) instead of an untyped error.
- The role preview of locked names follows each build: on builds that grant a renew role for `canExtendExpiry`, its admin comes only without `cannotBurnFuses`.
- New blocker `uncertified-parent-registry`: a locked child's parent registry must be the WrapperRegistry the parent's migration created (its deterministic address, which the parent's registry points at and which wraps the parent's node) before its irreversible transfer.
