# `@ensforge/sdk`

Type-safe, Effect-native actions and utilities for ENS applications, across ENSv1 and ENSv2.

## Features

- Names, records, resolvers, registration, renewal, subnames, registries, permissions, roles,
  approvals, primary names, NameWrapper, DNS and ENSv1 → ENSv2 migration
- Batched reads (Multicall3) with CCIP-Read for off-chain names
- Writes as plans: simulated first, bundled for EIP-5792 wallets, resumable after failures
- ENS events normalized across ENSv1 and ENSv2
- Pluggable indexers (bigname, Goldsky, your own) for lists, history and search, ENS and Basenames
- Name normalization, hashing, DNS encoding and record codecs
- Promise and Effect APIs; bring your own viem clients, or a wagmi 2 or 3 config

## Installation

```sh
pnpm add @ensforge/sdk effect@^4 viem
```

## Overview

```ts
import { Actions, Ensforge, ensActions } from "@ensforge/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
}).extend(ensActions());

const name = await ens.name.get({ name: "ens.eth" });
const address = await ens.record.getAddress({ name: "ens.eth" });
```

Run several reads together. A record of requests returns a record of results; a list returns a
tuple:

```ts
const { results } = await ens.batch({
  requests: {
    name: Actions.name.get.request({ name: "ens.eth" }),
    avatar: Actions.record.getText.request({ name: "ens.eth", key: "avatar" }),
  },
});
```

Writes need a wallet client. Each write is a plan you can inspect, simulate or send, and resume:

```ts
const plan = await ens.record.set.prepare({
  name: "alice.eth",
  texts: { url: "https://alice.dev" },
});
const { hash } = await ens.record.set({ name: "alice.eth", texts: { url: "https://alice.dev" } });

// After a failure, continue where it stopped:
await ens.plan.resume({ id: planId });
```

The same actions run in Effect programs from `@ensforge/sdk/effect`.

## wagmi

Apps with a wagmi config (RainbowKit, ConnectKit, Dynamic, Privy, Reown AppKit) create the client
from it. Reads use wagmi's transports; writes use whichever wallet is connected, switching it to
the ENS chain when needed. Works with wagmi 2 and 3:

```ts
import { ensActions } from "@ensforge/sdk";
import { Ensforge } from "@ensforge/sdk/wagmi";

const ens = Ensforge.fromWagmi(wagmiConfig).extend(ensActions());
```

## Indexer

Lists, history and search come from an indexer. `bigname()` (mainnet, Sepolia) and `goldsky()`
(mainnet ENS and Basenames) are built in; `fallback` asks each in turn, and `defineIndexer` adapts
any other source:

```ts
import { bigname, fallback, goldsky, indexerActions, paginate } from "@ensforge/sdk/indexer";

const ens = Ensforge.create({ publicClient, indexer: fallback([bigname(), goldsky()]) })
  .extend(ensActions())
  .extend(indexerActions());

const names = await ens.indexer.getNamesForAddress({ address: "0xb8c2…" });
const basename = await ens.indexer.getName({ name: "jesse.base.eth" }); // answered by Goldsky

for await (const page of paginate(ens.indexer.getSubnames, { name: "ens.eth" })) {
  console.log(page.items.map((subname) => subname.name));
}
```

With an indexer, `migration.migrate` also copies every record a name has set and recreates its
subnames without listing them.

## License

Apache-2.0
