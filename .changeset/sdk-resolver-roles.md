---
"@ensforge/sdk": minor
---

- PermissionedResolvers that ensforge deploys now give their writers every role (the full role mask), as the ENS app requires. Before, they got only the roles defined in 1.0, and that grant cannot be widened later. This applies to `resolver.create`, `registration.register`, `migration.migrate` and `subname.create`.
- Reusing a shared resolver created by ensforge 1.0 or 1.1 adds the plan warning `RESOLVER_ROLES_PARTIAL`: ensforge still writes its records, but the ENS app does not use it.
- `resolver.create` honours `via`: the route's account (an HCA) deploys the resolver, at the address it predicts, and it and the signer both get every role.
- Through an HCA, a resolver deployed for the signer's name gives the HCA every role too, so later writes through the HCA succeed.
- `resolver: "owned"` through an HCA uses the HCA's own shared resolver (the address the ENS app uses for it), deployed by the HCA in the register or migrate step, instead of a separate signer transaction.
