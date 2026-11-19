# ensforge

Type-safe, Effect-native TypeScript for the Ethereum Name Service: read and write names across
ENSv1 and ENSv2, with Promise and Effect APIs, React hooks, and Hosted Contract Accounts.

## Packages

| Package                                                 | Description                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@ensforge/sdk`](./packages/sdk/README.md)             | Actions, client, indexers and utilities; viem or wagmi               |
| [`@ensforge/react`](./packages/react/README.md)         | Hooks and Effect Atom atoms, with server rendering                   |
| [`@ensforge/hca`](./packages/hca/README.md)             | Hosted Contract Accounts: batched, gasless and session-signed writes |
| [`@ensforge/contracts`](./packages/contracts/README.md) | ABIs, deployment addresses and interfaces                            |

## Quick start

```sh
pnpm add @ensforge/sdk effect@^4 viem
```

```ts
import { Ensforge, ensActions } from "@ensforge/sdk";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({ chain: mainnet }).extend(ensActions());

const address = await ens.record.getAddress({ name: "nick.eth" });
const profile = await ens.record.get({ name: "nick.eth", texts: ["url", "avatar"] });
```

Pass `transports` for your own RPCs and a `wallet` (or use `Ensforge.fromWagmi` from
`@ensforge/sdk/wagmi`) to write, and
import the same actions from `@ensforge/sdk/effect` in Effect programs. Each package README covers
its API.

## Contributing

Requires Node.js 26 and pnpm 12.

```sh
pnpm install
pnpm build
pnpm check
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and [SECURITY.md](./SECURITY.md) to
report a vulnerability.

## License

[Apache-2.0](./LICENSE)
