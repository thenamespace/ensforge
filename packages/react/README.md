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
import { useResolver } from "@ensforge/react";

function ResolverAddress({ name }: { name: string }) {
  const resolver = useResolver({ name, atom: { swr: { staleTime: "1 minute" } } });

  if (resolver.isInitial) return <span>Loading…</span>;
  if (resolver.isFailure) return <span>{resolver.error.message}</span>;

  return <p>{resolver.data ?? "No resolver"}</p>;
}
```

Write hooks expose mutation state and Promise-based execution:

```tsx
import { useSetResolver } from "@ensforge/react";

const setResolver = useSetResolver();

const update = () =>
  setResolver.mutate({
    name: "ens.eth",
    resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  });
```

Hook inputs are inferred automatically. When an action parameter type is needed explicitly, import
it from the matching SDK group.

```ts
import type { SetResolverParameters } from "@ensforge/sdk/resolution";
```

An existing SDK instance can also be shared through the provider:

```tsx
<EnsforgeProvider sdk={sdk}>
  <App />
</EnsforgeProvider>
```

## License

Apache-2.0
