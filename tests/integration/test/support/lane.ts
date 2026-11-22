import { layer } from "@effect/vitest";
import { Layer } from "effect";

import { Chain, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { Clients } from "./clients.ts";
import { Gateways } from "./gateways.ts";
import { Rhinestone } from "./rhinestone.ts";
import { Wallets } from "./wallets.ts";

/**
 * The chain lane's services on a running devnet: `Chain`, `Clients`, `Wallets`, `Gateways`,
 * `Rhinestone`.
 */
export const chainServices = Layer.mergeAll(
  Clients.layer,
  Wallets.layer,
  Gateways.layer,
  Rhinestone.layer,
).pipe(Layer.provideMerge(Chain.layer));

/**
 * A seeded profile for a test file, with `Fixtures`, `Devnet` and the chain services. Chain tests
 * run on real time, so the layer is built without Effect's test services.
 */
export const onProfile = (profile: ProfileName) =>
  layer(chainServices.pipe(Layer.provideMerge(Fixtures.layer({ profile }))), {
    excludeTestServices: true,
  });
