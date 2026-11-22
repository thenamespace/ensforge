---
"@ensforge/sdk": minor
"@ensforge/hca": minor
---

Registration follows the ENS app: one resolver per wallet, and a routed reveal in one execution.

- **Default resolver.** A name the signer owns now goes on the signer's shared PermissionedResolver
  (`resolver: "owned"`, one per wallet at the ENS app's address), deployed with the first
  registration and reused. Its records are written in the `register` step, after `register`. A
  name registered for another owner keeps its own resolver. The new `resolver: "new"` deploys one
  per name as before. A commitment made by ensforge 1.1 with the default resolver is revealed
  with `resolver: "new"`; without it, `register` commits again.
- **Routed registration.** Through `via: hca()`, the commit is one HCA execution and the reveal is
  another: the payment approval (no longer in the commit step), the HCA's shared resolver
  (deployed by the HCA, every role to the HCA and the owner), the registrations, their records,
  the primary name and the approval reset to zero. Records and the primary name are no longer
  separate wallet steps.
- **Primary name.** `register({ primaryName: true })` writes the owner's default name
  (`default.reverse`) and clears an `addr.reverse` entry with another name, as the ENS app does.
  Through the signer's HCA, also one that is deployed in the same plan, it uses the adapters' HCA
  entry points.
- `@ensforge/hca`: `hca.authorizeSession`'s `resolver` defaults to the HCA's shared resolver, and
  `checkSessionCalls` checks a session resolver's deployment exactly as the validator does (every
  role to the HCA, then the owner, record writes only, canonical encoding).
