---
"@ensforge/sdk": minor
---

`migration.migrate` no longer leaves records behind without saying so.

- A name on a custom resolver that gets a new resolver has its records copied too, read through
  resolution (warning `RECORDS_FROM_CUSTOM_RESOLVER`).
- ABI, interface, data and name records are copied, and the content hash is copied as its raw
  bytes, so a codec ensforge cannot decode is kept.
- Records that cannot be copied (a public key, an unknown key, or an incomplete list from the
  indexer) fail with `RECORDS_UNKNOWN` unless `allowIncompleteRecords`.
- A locked `cannotSetResolver` name migrated through an HCA approves the HCA as the node's
  delegate on PublicResolverV2, so its records are copied in the same execution. Migrating such a
  name with records to another `owner` fails with the `records-not-replayable` blocker unless
  `allowEmptyResolver`. A plan that writes records after the migration warns with
  `RECORDS_AFTER_MIGRATION`.
