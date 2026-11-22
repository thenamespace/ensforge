---
"@ensforge/sdk": minor
---

- `subname.create({ upsert: true })` changes only what it is given on an existing child. An ENSv1 child keeps its owner (before, the owner defaulted to the signer, so the parent took the child) and goes through the same routes as `subname.update`. An existing ENSv2 child refuses `owner`, `roles` and `emancipate` (`UNSUPPORTED_PROTOCOL`), renews for `expiry`, and skips an unchanged resolver.
- A child created for another `owner` with records on an existing resolver is created for the signer, given its records, then handed over, with wrapped fuses burned last. Before, the records were written after the child belonged to `owner`, which the resolver refused.
- A wrapped parent creating a child that an emancipated holder unwrapped, and which therefore looks available, fails with `FUSE_BURNED` before signing: the NameWrapper protects it until its old expiry.
- On a deployment without ENSv2, ENSv1 children default to the public resolver instead of failing with `UNSUPPORTED_ON_DEPLOYMENT`.
- `subname.remove` refuses an ENSv1 child with subnames of its own, expired ones included, with the new `NAME_HAS_SUBNAMES` code, unless `allowOrphanedSubnames: true`: they would keep resolving. The check uses the client's indexer; without one the plan carries the warning `SUBNAMES_UNCHECKED`.
