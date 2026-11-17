import { layer } from "@effect/vitest";
import { Effect } from "effect";

import { Ensforge, ensActions, type Errors, type Plan } from "@ensforge/sdk";
import type { Indexer } from "@ensforge/sdk/indexer";
import type { DevnetInstance, ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { createPublicClient, createWalletClient, http, type Address } from "viem";

import type { TestWallet } from "./wallet.ts";

/**
 * A seeded profile for a test file: `Fixtures` and `Devnet`. Chain tests run on real time, so the
 * layer is built without Effect's test services.
 */
export const onProfile = (profile: ProfileName) =>
  layer(Fixtures.layer({ profile }), { excludeTestServices: true });

/** Client settings a test varies: the writing account, its wallet, and CCIP-Read. */
export type ClientOptions = {
  readonly account?: Address | undefined;
  /** The account's wallet; the devnet's unlocked account by default. */
  readonly wallet?: TestWallet | undefined;
  readonly ccipRead?: false | { readonly gatewayUrls?: readonly string[] } | undefined;
  /** Where plans are saved; shared between clients to resume across them. */
  readonly storage?: Plan.Storage | undefined;
  /** An indexer for the `indexer.*` actions (the services lane's bigname). */
  readonly indexer?: Indexer | undefined;
};

/** An ensforge client on the devnet. */
export const ensforge = (devnet: DevnetInstance, options: ClientOptions = {}) => {
  const transport = http(devnet.rpcUrl);
  // The devnet answers at once; short polling keeps receipt and chain-time waits short.
  const publicClient = createPublicClient({ chain: devnet.chain, transport, pollingInterval: 50 });
  return Ensforge.create({
    publicClient,
    deployment: devnet.deployments,
    ...(options.ccipRead === undefined ? {} : { ccipRead: options.ccipRead }),
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.indexer === undefined ? {} : { indexer: options.indexer }),
    ...(options.account === undefined
      ? {}
      : {
          walletClient: createWalletClient({
            chain: devnet.chain,
            pollingInterval: 50,
            transport: options.wallet?.transport ?? transport,
            account: options.account,
          }),
        }),
  }).extend(ensActions());
};

/** A `…Sync` write of the Effect actions, looked up by its path (`record.setSync`). */
export type SyncAction = (
  client: ReturnType<typeof ensforge>,
  options: unknown,
) => Effect.Effect<unknown, Errors.AnyError>;

/** Runs an ensforge Promise call, for the tests that compare the Promise API with the Effect API. */
export const call = <A>(promise: () => Promise<A>) => Effect.promise(promise);

/** Runs `effect` and then reverts the chain, so a test can write without changing the devnet. */
export const isolated = <A, E, R>(devnet: DevnetInstance, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => devnet.client.snapshot()),
    () => effect,
    (id) => Effect.promise(() => devnet.client.revert({ id })),
  );

/** Runs `effect` on a new block mined at `timestamp`, isolated like {@link isolated}. */
export const atTimestamp = <A, E, R>(
  devnet: DevnetInstance,
  timestamp: bigint,
  effect: Effect.Effect<A, E, R>,
) =>
  isolated(
    devnet,
    Effect.promise(async () => {
      await devnet.client.setNextBlockTimestamp({ timestamp });
      await devnet.client.mine({ blocks: 1 });
    }).pipe(Effect.andThen(effect)),
  );

/**
 * An `onStep` that moves the devnet's clock past each wait a plan asks for (e.g. a commitment's
 * minimum age); the devnet's time only moves with its blocks.
 */
export const passWaits = (devnet: DevnetInstance) => (event: Plan.Event) => {
  const seconds = event.step.waitFor?.seconds;
  if (event.status !== "waiting" || seconds === undefined) return;
  void devnet.client
    .increaseTime({ seconds: Number(seconds) })
    .then(() => devnet.client.mine({ blocks: 1 }));
};
