---
"@ensforge/sdk": minor
---

ENSv1 subname writes pick a route the registry and NameWrapper accept, or refuse before signing.

- `subname.remove` from a wrapped parent removes an unwrapped child: it wraps the child to the signer first, as the NameWrapper only clears children it holds. Before, it sent the child holder's call and reverted.
- `subname.update` of a wrapped child from its unwrapped parent keeps the NameWrapper as the registry owner when only the resolver changes, so the child stays wrapped. Before, it wrote the token holder as registry owner, which left the token controlling nothing. Giving the child another owner from the parent still does that, and the plan now carries the warning `WRAPPER_TOKEN_STRANDED`; removing it from the parent does too.
- When the parent cannot make a change (an emancipated child, or an unwrapped child of a wrapped parent), the child's holder makes it: through the NameWrapper or the registry, resolver, expiry, then owner. A wrapped parent changing an unwrapped child fails with `NAME_NOT_WRAPPED`.
- The parent's reach follows the NameWrapper's own check: an expired, ownerless child is blocked by the parent's `cannotCreateSubdomain`, any other child by its own `parentCannotControl`.
- A child named by its labelhash (`[af2c…]`) is changed and removed through the NameWrapper with its real label, recovered from the NameWrapper; without one the write fails with `INVALID_NAME`. Before, the NameWrapper hashed the literal `[af2c…]` and wrote another child.
- When no route is allowed, the write fails before signing, naming the route the signer has authority on.
