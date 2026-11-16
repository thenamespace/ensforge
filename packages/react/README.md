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
import { useRegistrationPrice } from "@ensforge/react";

const year = 365n * 24n * 60n * 60n;

function Price({ name }: { name: string }) {
  const price = useRegistrationPrice({
    name,
    duration: year,
    atom: { swr: { staleTime: "1 minute" } },
  });

  if (price.isInitial) return <span>Loading…</span>;
  if (price.isFailure) return <span>{price.error.message}</span>;
  if (price.data?.status !== "available") return <span>Not available</span>;

  return <p>{price.data.total.toString()} wei</p>;
}
```

Write hooks expose mutation state and Promise-based execution:

```tsx
import { useCommitName } from "@ensforge/react";

const commit = useCommitName();

// `commitment` comes from useRegistrationCommitment.
const start = () => commit.mutate({ commitment });
```

Hook inputs are inferred automatically. When an action parameter type is needed explicitly, import
it from the matching SDK group.

```ts
import type { GetRegistrationPriceParameters } from "@ensforge/sdk/registration";
```

An existing SDK instance can also be shared through the provider:

```tsx
<EnsforgeProvider sdk={sdk}>
  <App />
</EnsforgeProvider>
```

## License

Apache-2.0
