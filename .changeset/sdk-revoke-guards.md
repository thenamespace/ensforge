---
"@ensforge/sdk": minor
---

- `role.revoke` refuses to revoke `canTransferAdmin` from a name's owner (`INVALID_ROLES`) unless `allowIrreversible: true`. The registry checks that role on the owner's token before every transfer, and admin roles can never be granted on a name again, so the name could not be transferred until it expires.
- Revoking an admin role from its last holder, with no holder at the root to grant it again, adds the plan warning `ROLE_ADMIN_LOCKOUT`.
