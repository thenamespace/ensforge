# `@ensforge/contracts`

ENS contract ABIs, deployment addresses and protocol constants for viem. No runtime dependencies
beyond the `viem` peer.

- ENSv2 ABIs at [contracts-v2 v1.0.1](https://github.com/ensdomains/contracts-v2/tree/v1.0.1),
  each the superset of the mainnet and Sepolia deployments.
- ENSv1 ABIs at ens-contracts v1.7.0.
- Mainnet and Sepolia profiles with every address, per-deployment behaviour flags and provenance.
- Registry and resolver role bitmaps and ERC-165 interface IDs, verified against v1.0.1 source.

## Installation

```sh
pnpm add @ensforge/contracts viem
```

## Usage

```ts
import { Abis, Deployments, InterfaceIds, Roles } from "@ensforge/contracts";

const { v2 } = Deployments.mainnet;

const roles = await publicClient.readContract({
  address: v2.contracts.ethRegistry,
  abi: Abis.v2.permissionedRegistry,
  functionName: "roles",
  args: [resource, account],
});
const canRenew = (roles & Roles.registry.renew) !== 0n;
```

- `Abis.v1`, `Abis.v2` and `Abis.shared` are keyed by contract; interface ABIs live under
  `Abis.v1.interfaces` and `Abis.v2.interfaces`.
- `Deployments.mainnet` and `Deployments.sepolia` hold `{ v1, v2 }`. Use `Deployments.get({ chainId })`
  to look a chain up and `Deployments.define(profile)` to validate a devnet or custom profile.
- `v2.capabilities` records behaviour that differs between deployments of the same release, such
  as `wrapperRegistryInitializer` (`"explicit"` on Sepolia, `"fuse-derived"` on mainnet).
- `Roles` holds the registry and resolver role bits plus the `unemancipated` and `regeneration`
  registry bitmaps. `InterfaceIds` holds registry, resolver and resolver-profile interface IDs.

The same ABIs and constants are available as flat named exports from `@ensforge/contracts/v1`,
`@ensforge/contracts/v2` and `@ensforge/contracts/shared` (e.g. `permissionedRegistryV2Abi`).
`@ensforge/contracts/v2/experimental/hca` exports the hosted contract account ABIs.

`@ensforge/contracts/internal` holds minimal ABI fragments and HCA manifests used by other ensforge
packages. It is not a public API and changes without notice.

## License

Apache-2.0
