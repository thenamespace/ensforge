---
"@ensforge/sdk": patch
---

`Ensforge.fromWagmi`: a write on a chain the wagmi config does not have (an L2 name, an L2 primary name) fails with `ConfigError` (`CHAIN_NOT_CONFIGURED`), naming the chain, before the wallet is asked to switch. It failed with wagmi's own untranslated error.
