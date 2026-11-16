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
import { useFuses } from "@ensforge/react";

function Fuses({ name }: { name: string }) {
  const fuses = useFuses({ name, atom: { swr: { staleTime: "1 minute" } } });

  if (fuses.isInitial) return <span>Loading…</span>;
  if (fuses.isFailure) return <span>{fuses.error.message}</span>;
  if (fuses.data?.supported !== true) return <span>Not wrapped</span>;

  return <p>{fuses.data.active.join(", ")}</p>;
}
```

Write hooks expose mutation state and Promise-based execution:

```tsx
import { useSetFuses } from "@ensforge/react";

const setFuses = useSetFuses();

const lock = () => setFuses.mutate({ name: "alice.eth", fuses: ["cannotUnwrap"] });
```

Hook inputs are inferred automatically. When an action parameter type is needed explicitly, import
it from the matching SDK group.

```ts
import type { SetFusesParameters } from "@ensforge/sdk/wrapping";
```

An existing SDK instance can also be shared through the provider:

```tsx
<EnsforgeProvider sdk={sdk}>
  <App />
</EnsforgeProvider>
```

## License

Apache-2.0
