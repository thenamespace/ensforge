# `@ensforge/test-devnet`

ENS deployed by ensforge itself on a local anvil, for the chain test suites (not published).
Every contract is mainnet bytecode: ENSv1 at ens-contracts v1.7.0 with its older generations,
ENSv2 and HCA at contracts-v2 v1.0.1 (the UserRegistryImpl from its `post-audit-2` branch, as
redeployed on mainnet, with the v1.0.1 one also deployed for registries made before), plus
Multicall3, EntryPoint v0.7 and Permit2 at their canonical addresses and the ENS test suites'
behaviour mocks.

Requires Foundry at the version in [`foundry-version`](./foundry-version)
(`foundryup --install 1.9.0`).

## Profiles

| Profile            | Chain                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `v1-live`          | ENSv1 before the ENSv2 launch: its controllers register, the NameWrapper has an owner |
| `v1-v2-greenfield` | ENSv1 and ENSv2, roles granted at deploy time, ENSv1 still registering                |
| `mainnet-shaped`   | As mainnet today: after the launch and the registry hand-over                         |
| `sepolia-shaped`   | `mainnet-shaped` on Sepolia's builds and capabilities                                 |
| `v2-only`          | The `mainnet-shaped` chain with an ensforge profile that has no ENSv1                 |

A profile builds in under a second, deterministically, and is cached as anvil state in `.cache/`
(keyed by the deploy code, artifacts and anvil version); a devnet starts from it in under 100 ms.

## In tests

```ts
import { assert, layer } from "@effect/vitest";

import { Devnet } from "@ensforge/test-devnet";

layer(Devnet.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })("…", (it) => {
  it.effect("…", () =>
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      // devnet.deployments → Ensforge.create({ deployment }); devnet.contract("v1.registry")
    }),
  );
});
```

Chain tests run on real time, hence `excludeTestServices`. `Chain.layer` (provided on top of
`Devnet.layer`) gives reads, writes, time and snapshots as Effects. `pnpm test:chain` runs this lane; it
is not part of `pnpm test`.

## Commands

```sh
pnpm exec ensforge-devnet build [profile…]      # build (and cache) profiles
pnpm exec ensforge-devnet start mainnet-shaped --host 0.0.0.0 --manifest devnet.json
pnpm exec ensforge-devnet verify [profile…]     # check ownership, roles and wiring
pnpm exec ensforge-devnet profile mainnet-shaped # print the ensforge deployment profile
pnpm exec ensforge-devnet artifacts check       # committed artifacts match their sources
pnpm exec ensforge-devnet artifacts refresh     # re-derive them (needs ENSFORGE_MAINNET_RPC_URL)
pnpm exec ensforge-devnet artifacts watch       # newer releases and deployment records upstream
```

`start --manifest` writes the chain ID, RPC URL and every address, for services such as an indexer
or a bundler.

## Artifacts

`artifacts/` holds creation code and ABIs with their provenance (`src/artifacts/sources.ts`):
deployment records from the pinned ENS repositories, contracts compiled from the mainnet
build-infos with their exact solc (byte-identical to mainnet), mainnet runtime code for contracts
placed at their mainnet addresses, and our own contracts under `contracts/`. A `build` source can add
one of them to a pinned build-info (`local`), so `contracts/HCASessionHashes.sol` compiles against
contracts-v2's own sources to expose the HCA validator's internal session hashing as
`hca.sessionHashes`.

`artifacts watch` fails when ENS released a newer ens-contracts or contracts-v2, or when the
mainnet or Sepolia `addresses.md` of a newer release, the `deployment` branch or the latest
`post-audit-*` branch differs from the records at `deploymentRecords` (the pinned `post-audit-2`
commit). It makes one GitHub API call per release and per `post-audit-*` branch.

Known limits: ENSv1's 2023 PublicResolver (`0x231b…`) is not reproduced (its immutables bind
mainnet addresses), nor the 2019 BaseRegistrar, the auction registrar or the 2019 controllers,
whose names can no longer be registered or renewed.
