# `@ensforge/react`

Reactive React hooks for building ENS applications.

## Features

- Effect Atom reads and mutations for the full ensforge action surface
- Shared execution, typed retry schedules, SWR, and idle lifecycle controls
- Refresh and Suspense variants for read hooks
- Native `AsyncResult` state with convenient React projections
- Provider setup from an ensforge config or existing SDK instance
- Shared cache primitives for prefetching and advanced composition

## Installation

```sh
pnpm add @ensforge/react react effect@^4 viem wagmi
```

## Overview

Add `EnsforgeProvider` near the root of your application. It accepts the same viem or Wagmi
configuration as `Ensforge`:

```tsx
import { EnsforgeProvider } from "@ensforge/react";

<EnsforgeProvider
  config={{
    network: "mainnet",
    wagmiConfig,
  }}
>
  <App />
</EnsforgeProvider>;
```

Use read hooks anywhere below the provider:

```tsx
import { useHcaOwner } from "@ensforge/react";

function HcaOwner({ hca }: { hca: `0x${string}` }) {
  const owner = useHcaOwner({ hca, atom: { swr: { staleTime: "1 minute" } } });

  if (owner.isInitial) return <span>Loading…</span>;
  if (owner.isFailure) return <span>{owner.error.message}</span>;

  return <p>Owned by {owner.data}</p>;
}
```

Write hooks expose mutation state and Promise-based execution:

```tsx
import { useDeployHca } from "@ensforge/react";

const deployHca = useDeployHca();

const deploy = (owner: `0x${string}`) => deployHca.mutate({ owner });
```

Hook inputs are inferred automatically. When an action parameter type is needed explicitly, import
it from the matching SDK group.

```ts
import type { HcaReadParameters } from "@ensforge/sdk/hca";
```

An existing SDK instance can also be shared through the provider:

```tsx
<EnsforgeProvider sdk={sdk}>
  <App />
</EnsforgeProvider>
```

## License

Apache-2.0
