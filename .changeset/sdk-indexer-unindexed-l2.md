---
"@ensforge/sdk": minor
---

`indexer.getName`, `indexer.getRecords`, `indexer.getHistory` and `indexer.getSubnames` fail with `IndexerError` (`INDEXER_UNSUPPORTED`) for names in Linea Names and Celonames, which no indexer serves, instead of asking ENS's index, which answered as if they did not exist. `getSubnames` does the same for `linea.eth` and `celo.eth`, whose children live on their L2. An explicit `namespace` is still taken as given. Read these names on-chain with `name.get` and `record.get`.
