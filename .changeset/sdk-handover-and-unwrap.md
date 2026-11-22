---
"@ensforge/sdk": minor
---

- `name.transfer({ records: "handover" })` hands over a PermissionedResolver only when it provably serves the name alone. Its roles cover every name on it, so before, handing over a resolver shared with other names gave the recipient their records and took them from the sender. It is now refused (`INVALID_RECORD_VALUE`) when the resolver is the sender's or owner's shared `"owned"` resolver, holds a record of another name, or, with an indexer, has other names pointing at it. An indexer that cannot answer adds the warning `RESOLVER_SHARING_UNCHECKED`.
