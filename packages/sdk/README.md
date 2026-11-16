# `@ensforge/sdk`

A type-safe client for building ENS applications.

## Features

- Config-bound actions with no repeated client arguments
- Unified behavior across supported ENS deployments
- Grouped APIs for migration, wrapping, and DNS

Name, record, resolver, primary-name and registration actions live in `@ensforge/core`
(`ens.name.*`, `ens.record.*`, `ens.resolver.*`, `ens.primaryName.*`, `ens.registration.*`,
`ens.subname.*`, `ens.registry.*`, `ens.permission.*`, `ens.role.*`, `ens.approval.*`).

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

const fuses = await sdk.wrapping.getFuses({ name: "ens.eth" });
```

Actions are grouped by ENS capability:

```ts
const fuses = await sdk.wrapping.getFuses({ name: "ens.eth" });
const expiry = await sdk.wrapping.getWrapperExpiry({ name: "ens.eth" });
```

Import action-specific types from the corresponding group entrypoint. This keeps editor type
loading focused while method calls remain fully inferred.

```ts
import type { GetFusesParameters } from "@ensforge/sdk/wrapping";
```

Compatible reads can be executed together:

```ts
const profile = await sdk.batch.readBatch({
  ens: sdk.wrapping.getFuses.request({ name: "ens.eth" }),
  wallet: sdk.wrapping.getFuses.request({ name: "wallet.eth" }),
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
