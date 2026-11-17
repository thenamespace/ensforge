# `@ensforge/hca`

ENS Hosted Contract Accounts (HCA) for the ensforge 1.0 client: run any write through the user's
HCA as one atomic execution, gaslessly through a bundler, or without prompts through a session.

## Installation

```sh
pnpm add @ensforge/hca @ensforge/core effect@^4 viem
```

## Overview

```ts
import { Ensforge, ensActions } from "@ensforge/core";
import { hca, hcaActions } from "@ensforge/hca";

const ens = Ensforge.create({ publicClient, walletClient })
  .extend(ensActions())
  .extend(hcaActions());

// Migrate several names in one or two transactions (one bundle with an EIP-5792 wallet)
await ens.migration.migrateSync({ names: ["alice.eth", "bob.eth"], via: hca() });

const account = await ens.hca.get(); // address, owner, implementation, problems
```

Writes routed with `via: hca()` run from the HCA: the account deploys on first use, consecutive
steps run as one `executeByOwner` batch, and the approvals it needs to move your names are added as
one owner step. Never route through an HCA without the user's agreement.

## Executors

```ts
import { bundler, hca, owner, pimlico, rhinestone } from "@ensforge/hca";

hca(); // the owner's wallet sends executeByOwner (default)
hca({ executors: [pimlico({ apiKey, sponsor: true }), owner()] }); // gasless, owner-signed UserOperations
hca({ executors: [rhinestone({ sdk, sessionSigner })], session }); // prompt-free with a session
```

- `bundler()` / `pimlico()`: experimental. Owner operations only (sessions are intent-only),
  EntryPoint v0.7.
- `rhinestone()`: experimental. Needs a Rhinestone SDK with standalone HCA support; ensforge checks
  every session call against the HCA policy before signing.

## Sessions

```ts
const session = await ens.hca.authorizeSession({ sessionKey, resolver, validUntil });
await ens.hca.getSession({ session }); // valid until it expires or the owner revokes
await ens.hca.revokeSessionsSync({});
```

A session may register names to the owner, deploy and edit its one resolver, set the owner's primary
name and approve registration payments; nothing else.

The same actions run in Effect programs from `@ensforge/hca/effect`.

## License

Apache-2.0
