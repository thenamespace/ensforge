# `@ensforge/react`

React hooks for ENS, built on [`@ensforge/sdk`](https://ensforge.com/docs/sdk).

## Installation

```sh
pnpm add @ensforge/react @ensforge/sdk effect@^4 viem react
```

Required peer dependencies: `react` (`^19.0.0`), `viem` (`^2.57.0`), `effect` (`^4.1.4`) and
`scheduler` (`>=0.25.0 <0.29.0`, which React DOM already depends on).

## Example

```tsx
import { EnsforgeProvider, useAddress } from "@ensforge/react";
import { Ensforge } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet });

function Address() {
  const { data: address, isLoading } = useAddress({ name: "nick.eth" });
  return isLoading ? "Loading..." : address;
}

export const App = () => (
  <EnsforgeProvider client={ens}>
    <Address />
  </EnsforgeProvider>
);
```

## Features

- Hooks for reads, writes and plans, such as `useAddress`, `useRecords` and `useSetRecords`.
- Reads are shared and cached, and refresh after your writes.
- Write progress for multi-step plans.
- Server rendering with `prefetch`, `dehydrate` and `HydrationBoundary`.
- Works with a wagmi config through `Ensforge.fromWagmi`.

## Documentation

- [Documentation](https://ensforge.com/docs/react)
- [Quick start](https://ensforge.com/docs/react)

## License

Apache-2.0
