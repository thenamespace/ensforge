# `@ensforge/hca`

Hosted Contract Accounts (HCA) for ENS: run writes from the user's account as one execution, without
gas through a bundler, or without prompts through a session.

> **Experimental.** `@ensforge/hca` is experimental for 1.0. Its API can change in a minor release.

## Installation

```sh
pnpm add @ensforge/hca @ensforge/sdk viem effect@^4
```

Required peer dependencies: `viem` (`^2.57.0`) and `effect` (`^4.1.4`).

## Example

```ts
import { hca, hcaActions } from "@ensforge/hca";
import { Ensforge, ensActions } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet, wallet: walletClient })
  .extend(ensActions())
  .extend(hcaActions());

await ens.migration.migrateSync({ names: ["alice.eth", "bob.eth"], via: hca() });

const account = await ens.hca.get();
```

## Features

- Route any sdk write through the account with `via: hca()`.
- Consecutive steps run as one batch; the account deploys on first use.
- Executors: the owner's wallet, plus experimental bundler, Pimlico and Rhinestone executors.
- Sessions that act without a prompt, limited to a short list of ENS calls.
- An optional Effect API from `@ensforge/hca/effect`.

## Documentation

- [Documentation](https://ensforge.com/docs/hca)
- [Quick start](https://ensforge.com/docs/hca)

## License

Apache-2.0
