# `@ensforge/sdk`

The SDK for ENS. Look up names, read and write records, register and manage names, and let ensforge
handle which ENS version a name lives on.

## Installation

```sh
pnpm add @ensforge/sdk viem effect@^4
```

`viem` (`^2.57.0`) and `effect` (`^4.1.4`) are required peer dependencies. `wagmi` (`>=2.14.0 <4`) is
an optional peer, needed only for `Ensforge.fromWagmi`.

## Example

```ts
import { Ensforge, ensActions } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet }).extend(ensActions());

const address = await ens.record.getAddress({ name: "nick.eth" });
```

## Features

- Viem-style Promise API: pass your own viem clients, or a wagmi config.
- Names, records, resolvers, registration, renewal, subnames, primary names, roles and migration.
- Batched reads with off-chain (CCIP-Read) names resolved for you.
- Writes are plans you can inspect, simulate, send and resume.
- Typed errors, and pluggable indexers for lists, history and search.
- An optional Effect API from `@ensforge/sdk/effect`.

## Documentation

- [Documentation](https://ensforge.com/docs/sdk)
- [Quick start](https://ensforge.com/docs/sdk)

## License

Apache-2.0
