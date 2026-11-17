# `@ensforge/react`

React hooks and Effect Atom atoms for ENS, built on [`@ensforge/sdk`](../sdk/README.md).

## Features

- Hooks for any sdk action (`useRead`, `useWrite`, …) and named presets (`useAddress`,
  `useSetRecords`, …), typed from the actions themselves
- Shared, cached reads that cancel on unmount and refresh after writes: chain reads once the
  transaction is mined, indexer reads once the indexer has caught up
- Write progress (`steps`) for multi-step plans, and `usePrepare` for review screens
- Effect Atom atoms (`ensAtom`, `ensWriteAtom`, `ensPagesAtom`) to compose ENS data with your own
- Server rendering: `prefetch`, `dehydrate` (with streaming) and `HydrationBoundary`, for the
  Next.js App and Pages routers, React Router/Remix, TanStack Start and static export

## Installation

```sh
pnpm add @ensforge/react @ensforge/sdk @effect/atom-react effect viem react
```

React 19 is required (`@effect/atom-react`).

## Setup

With wagmi (RainbowKit, ConnectKit, Dynamic, Privy, Reown AppKit), create the client from the
wagmi config and render the provider inside the wagmi providers:

```tsx
import { EnsforgeProvider } from "@ensforge/react";
import { Ensforge } from "@ensforge/sdk/wagmi";

const ens = Ensforge.fromWagmi(wagmiConfig);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <EnsforgeProvider client={ens}>{children}</EnsforgeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Without wagmi, pass any client: `Ensforge.create({ publicClient, walletClient })`.

`EnsforgeProvider` renders an atom registry for its subtree. Apps that already render a
`RegistryProvider` pass `registry={false}` to share it.

## Reads

```tsx
import { useAddress, useRead, useRecords } from "@ensforge/react";
import { Actions } from "@ensforge/sdk";

const { data: address, isLoading } = useAddress({ name: "nick.eth" });
const { data: profile } = useRecords({ name: "nick.eth", texts: ["url", "avatar"] });
const { data: role } = useRead(Actions.role.get, { name, account, target: "registry" });
```

- Pass `undefined` options to wait, e.g. until a name is typed.
- Freshness per hook or for all hooks (`<EnsforgeProvider defaults={…}>`): `staleTime`,
  `idleTTL`, `refetchInterval`, `refreshOnWindowFocus`.
- `useSuspenseRead` suspends; `useReads` runs a list of reads; `useInfiniteRead` and the
  `useSubnames`/`useNamesForAddress`/`useNameHistory` presets page through indexer lists.

## Writes

```tsx
import { useSetRecords } from "@ensforge/react";

const { mutate, status, steps, error } = useSetRecords();
mutate({ name: "alice.eth", texts: { url: "https://alice.xyz" } });
```

`steps` lists plan events (`waiting`, `submitted`, `confirmed`, `failed`) as they happen.
`usePrepare(Actions.record.set, options)` plans a write without sending it.

## Atoms

Every hook reads the same atoms you can compose:

```ts
import { Atom } from "effect/reactivity";

import { ensAtom } from "@ensforge/react/atoms";

const profile = Atom.make((get) => ({
  address: get(ensAtom(ens, Actions.record.getAddress, { name: "nick.eth" })),
  avatar: get(ensAtom(ens, Actions.record.getAvatar, { name: "nick.eth" })),
}));
```

## Server rendering

Prefetch the reads a page renders first, then hand the state to `HydrationBoundary`. Reads that
were not prefetched render as loading on the server and run in the browser, so a server render
never fans out RPC calls. Use a new registry per request.

Next.js App Router (server component):

```tsx
import { AtomRegistry } from "effect/reactivity";

import { HydrationBoundary } from "@ensforge/react";
import { dehydrate, prefetch } from "@ensforge/react/server";

export default async function Page({ params }: { params: { name: string } }) {
  const registry = AtomRegistry.make();
  await prefetch(registry, ens, Actions.name.get, { name: params.name });
  return (
    <HydrationBoundary state={dehydrate(registry)}>
      <Profile name={params.name} />
    </HydrationBoundary>
  );
}
```

- **Streaming**: start `prefetch` without awaiting and call `dehydrate(registry, { streaming: true })`;
  reads still loading stream to the browser as they resolve.
- **Pages Router, static export, React Router/Remix and TanStack Start loaders**: the same
  `prefetch` + `dehydrate` in `getServerSideProps`/`getStaticProps` or the loader; the state is
  plain JSON (bigints and bytes are tagged), so it serializes anywhere. Render
  `<HydrationBoundary state={state}>` in the page.

## License

Apache-2.0
