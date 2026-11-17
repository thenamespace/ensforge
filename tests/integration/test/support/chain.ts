import { layer } from "@effect/vitest";
import { Effect } from "effect";

import { Ensforge, ensActions } from "@ensforge/sdk";
import type { DevnetInstance, ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { createPublicClient, createWalletClient, http, type Address } from "viem";

/**
 * A seeded profile for a test file: `Fixtures` and `Devnet`. Chain tests run on real time, so the
 * layer is built without Effect's test services.
 */
export const onProfile = (profile: ProfileName) =>
  layer(Fixtures.layer({ profile }), { excludeTestServices: true });

/** An ensforge client on the devnet, writing as `account` when given. */
export const ensforge = (devnet: DevnetInstance, account?: Address) => {
  const transport = http(devnet.rpcUrl);
  const publicClient = createPublicClient({ chain: devnet.chain, transport });
  return Ensforge.create({
    publicClient,
    deployment: devnet.deployments,
    ...(account === undefined
      ? {}
      : { walletClient: createWalletClient({ chain: devnet.chain, transport, account }) }),
  }).extend(ensActions());
};

/** Runs an ensforge Promise call inside a test. */
export const call = <A>(promise: () => Promise<A>) => Effect.promise(promise);
