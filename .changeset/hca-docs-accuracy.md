---
"@ensforge/hca": patch
"@ensforge/react": patch
---

The docs now say that `hca()` uses one executor and never falls back, that an upgrade needs the DAO's upgrade set plus the new implementation's `canUpgradeFrom` check, what a session's resolver may be, and how to pass `dehydrate` output to Next.js `getServerSideProps`.
