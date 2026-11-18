# `@ensforge/contracts`

ENS contract ABIs, deployment addresses and protocol constants for viem.

## Installation

```sh
pnpm add @ensforge/contracts viem
```

`viem` (`^2.57.0`) is the only peer dependency.

## Example

```ts
import { Abis, Deployments } from "@ensforge/contracts";

const { v2 } = Deployments.mainnet;

const roles = await publicClient.readContract({
  address: v2.contracts.ethRegistry,
  abi: Abis.v2.permissionedRegistry,
  functionName: "roles",
  args: [resource, account],
});
```

## Features

- ABIs for ENSv1 (ens-contracts v1.7.0) and ENSv2 (contracts-v2 v1.0.1).
- Mainnet and Sepolia deployment profiles with every address.
- Registry and resolver role bitmaps and ERC-165 interface IDs.
- Flat named exports from `/v1`, `/v2` and `/shared`.

## Documentation

- [Documentation](https://ensforge.com/docs/contracts)
- [Quick start](https://ensforge.com/docs/sdk)

## License

Apache-2.0
