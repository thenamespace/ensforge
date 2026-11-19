---
"@ensforge/sdk": minor
"@ensforge/hca": minor
"@ensforge/react": minor
---

- Error translation (viem errors and reverts decoded against every ENS contract error) now loads on the first failure that needs it instead of with every action. One read (`Actions.record.getText`) is 20% smaller up front (42.5 → 34.1 kB gzip), the Effect API 23%, `@ensforge/hca` 22% and `@ensforge/react` 10%. Errors, their classes, codes and context are unchanged; `Errors.fromCause` and `Errors.describe` stay synchronous.
