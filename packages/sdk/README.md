# `@ensforge/sdk`

A type-safe client for building ENS applications.

## Features

- Config-bound actions with no repeated client arguments
- Unified behavior across supported ENS deployments
- Grouped APIs for resolution, registration, migration, wrapping, DNS, and reverse records

Name and record actions live in `@ensforge/core` (`ens.name.*`, `ens.record.*`).

- Batched reads and wallet-aware write workflows
- Compatible with viem clients and Wagmi configs

## Installation

```sh
pnpm add @ensforge/sdk effect@^4 viem
```

## Overview

```ts
import { Ensforge } from "@ensforge/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const sdk = new Ensforge({
  network: "mainnet",
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
});

const resolver = await sdk.resolution.getResolver({ name: "ens.eth" });
```

Actions are grouped by ENS capability:

```ts
const duration = 365n * 24n * 60n * 60n;

const resolver = await sdk.resolution.getResolver({ name: "ens.eth" });
const price = await sdk.registration.getRegistrationPrice({ name: "example.eth", duration });
```

Import action-specific types from the corresponding group entrypoint. This keeps editor type
loading focused while method calls remain fully inferred.

```ts
import type { GetResolverParameters } from "@ensforge/sdk/resolution";
```

Compatible reads can be executed together:

```ts
const profile = await sdk.batch.readBatch({
  ens: sdk.resolution.getResolver.request({ name: "ens.eth" }),
  nick: sdk.resolution.getResolver.request({ name: "nick.eth" }),
});
```

Use an existing Wagmi config instead of supplying viem clients:

```ts
import { createEnsforge } from "@ensforge/sdk/wagmi";

const sdk = createEnsforge({
  network: "mainnet",
  wagmiConfig,
});
```

Add a wallet client—or use a Wagmi config with an active connection—to execute write actions.

## License

Apache-2.0
