# ensforge

Type-safe tools for reading, writing, and building applications on ENS.

## Features

- Unified ENS actions across supported deployments and migration states
- Names, resolver records, registration, renewals, migration, wrapping, DNS, and reverse resolution
- Automatic contract routing with typed results and errors
- Batched reads and wallet-aware write workflows
- Bring your own viem clients or Wagmi config
- Framework-independent actions, a typed client, and Effect Atom hooks for React

## Packages

| Package                                                 | Description                                                |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| [`@ensforge/contracts`](./packages/contracts/README.md) | Contract ABIs, deployment addresses, and shared interfaces |
| [`@ensforge/sdk`](./packages/sdk/README.md)             | Framework-independent ENS actions and utilities            |
| [`@ensforge/react`](./packages/react/README.md)         | Hooks and Effect Atom atoms, with server rendering         |

## Quick start

```sh
pnpm add @ensforge/sdk effect@^4 viem
```

Create a client, then call actions grouped by domain:

```ts
import { Ensforge, ensActions } from "@ensforge/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
}).extend(ensActions());

const name = await ens.name.get({ name: "nick.eth" });
const profile = await ens.record.get({ name: "nick.eth", texts: ["url"], addresses: ["eth"] });
```

Add a `walletClient` to write:

```ts
await ens.record.set({ name: "alice.eth", texts: { url: "https://alice.dev" } });
```

Effect programs import the same actions from `@ensforge/sdk/effect`.

## Repository

The monorepo also contains private test packages:

```text
tests/
  harness/     Shared test harness (setup, matchers, transports, arbitraries, fake indexer)
```

## Development

Requires Node.js 26 (see `.node-version`) and pnpm 12 (see `packageManager`).

```sh
pnpm install
pnpm build
pnpm check
```

`pnpm check` runs formatting, linting, type checking, builds, the fast tests and each package's
`verify` (API reports, JSDoc, published types and examples).

Package boundaries resolve through generated declarations during editor and type-checking sessions.
Run `pnpm build` after cloning, or keep `pnpm dev` running while changing multiple packages, so
downstream packages see current declarations without loading every dependency's source graph.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the complete development, testing, documentation, and
changeset workflow.

## License

Apache-2.0
