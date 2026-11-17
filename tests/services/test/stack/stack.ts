import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { Context, Duration, Effect, Layer, Schedule, Schema } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { Devnet, type DevnetInstance, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import getPort from "get-port";
import { parseEther, toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { bignameImage } from "./bigname.ts";
import { docker } from "./docker.ts";
import { images } from "./images.ts";

/** Sepolia's chain id: bigname indexes only chains it knows, so the devnet answers as Sepolia. */
export const sepoliaChainId = 11_155_111;

const composeFile = fileURLToPath(new URL("../../compose.yml", import.meta.url));

/** Which services a suite starts: bigname (`indexer`), or the bundler and paymaster (`aa`). */
export type ServiceSet = "indexer" | "aa";

/** The services stack on top of a devnet. */
export type ServicesApi = {
  /** bigname's base URL, for `bigname({ url })` (`indexer`). */
  readonly indexerUrl: string;
  /** Waits until bigname has indexed `block` (the devnet's latest block by default). */
  readonly waitForIndexed: (block?: bigint) => Effect.Effect<void, StackError>;
  /** alto's ERC-4337 RPC URL (`aa`). */
  readonly bundlerUrl: string;
  /** The ERC-7677 paymaster's URL, which sponsors every UserOperation (`aa`). */
  readonly paymasterUrl: string;
};

/** The stack could not start, or did not catch up in time. */
export class StackError extends Schema.TaggedError<StackError>()("StackError", {
  message: Schema.String,
}) {}

// anvil's test mnemonic: indexes 0–9 are the devnet's named accounts and 10 is the fixtures'
// EIP-7702 EOA (it refuses ETH, so it cannot be the bundler's beneficiary); the bundler gets its own.
const testMnemonic = "test test test test test test test test test test test junk";
const bundlerKey = (index: number) => {
  const account = mnemonicToAccount(testMnemonic, { addressIndex: index });
  return {
    address: account.address,
    key: toHex(account.getHdKey().privateKey ?? new Uint8Array()),
  };
};

type Status = {
  readonly data?: {
    readonly chains?: Readonly<Record<string, { readonly indexed_block?: number | null }>>;
  };
};

const indexedBlock = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(`${url}/v1/status`).then((response) => response.json() as Promise<Status>),
    catch: (cause) => new StackError({ message: `bigname status: ${String(cause)}` }),
  }).pipe(
    Effect.map((status) => status.data?.chains?.[String(sepoliaChainId)]?.indexed_block ?? null),
  );

/** Retries `check` every 250 ms for about five minutes (a cold start), then fails with logs. */
const until = <E>(check: Effect.Effect<void, E>, logs: Effect.Effect<string>) =>
  check.pipe(
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(250)), times: 1200 }),
    Effect.catch((error) =>
      Effect.flatMap(logs, (tail) =>
        Effect.fail(
          new StackError({
            message: `${String((error as { message?: unknown }).message ?? error)}\n${tail}`,
          }),
        ),
      ),
    ),
  );

const reachable = (url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: () => fetch(url, init),
    catch: (cause) => new StackError({ message: `${url}: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(new StackError({ message: `${url} answered ${response.status}` })),
    ),
  );

const startStack = Effect.fnUntraced(function* (
  devnet: DevnetInstance,
  services: readonly ServiceSet[],
) {
  const indexer = services.includes("indexer");
  const aa = services.includes("aa");
  const [bignamePort, altoPort, paymasterPort] = yield* Effect.promise(() =>
    Promise.all([getPort(), getPort(), getPort()]),
  );
  const [utility, executor] = [bundlerKey(20), bundlerKey(21)];
  if (aa) {
    yield* Effect.promise(() =>
      Promise.all(
        [utility, executor].map(({ address }) =>
          devnet.client.setBalance({ address, value: parseEther("1000") }),
        ),
      ),
    );
  }

  const project = `ensforge-${process.pid}-${bignamePort}`;
  const env = {
    // Every variable is set, also for the services a suite does not start.
    BIGNAME_IMAGE: indexer ? yield* bignameImage(devnet) : "unused",
    POSTGRES_IMAGE: images.postgres,
    ALTO_IMAGE: images.alto,
    BIGNAME_PORT: String(bignamePort),
    ALTO_PORT: String(altoPort),
    PAYMASTER_PORT: String(paymasterPort),
    ALTO_UTILITY_KEY: utility.key,
    ALTO_EXECUTOR_KEY: executor.key,
    DEVNET_RPC_URL: devnet.rpcUrl.replace("127.0.0.1", "host.docker.internal"),
  };
  const compose = (args: readonly string[]) =>
    docker(
      [
        "compose",
        "--file",
        composeFile,
        "--project-name",
        project,
        ...services.flatMap((set) => ["--profile", set]),
        ...args,
      ],
      env,
    );

  yield* Effect.acquireRelease(compose(["up", "--detach", "--build"]), () =>
    Effect.ignore(compose(["down", "--volumes", "--remove-orphans"])),
  );

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const logs = compose(["logs", "--no-color", "--tail", "40"]).pipe(
    Effect.orElseSucceed(() => "(no logs)"),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );

  const indexerUrl = `http://127.0.0.1:${bignamePort}`;
  const waitForIndexed = (block?: bigint) =>
    Effect.gen(function* () {
      const target = block ?? (yield* Effect.promise(() => devnet.client.getBlockNumber()));
      yield* until(
        indexedBlock(indexerUrl).pipe(
          Effect.flatMap((indexed) =>
            indexed !== null && BigInt(indexed) >= target
              ? Effect.void
              : Effect.fail(
                  new StackError({ message: `indexed ${indexed}, waiting for ${target}` }),
                ),
          ),
        ),
        logs,
      );
    });

  const bundlerUrl = `http://127.0.0.1:${altoPort}`;
  const paymasterUrl = `http://127.0.0.1:${paymasterPort}`;
  if (indexer) yield* waitForIndexed();
  if (aa) {
    const entryPoints = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_supportedEntryPoints",
        params: [],
      }),
    };
    yield* until(reachable(bundlerUrl, entryPoints), logs);
    yield* until(reachable(`${paymasterUrl}/ping`), logs);
  }
  return { indexerUrl, waitForIndexed, bundlerUrl, paymasterUrl } satisfies ServicesApi;
});

/**
 * The services stack for a suite: the profile's seeded devnet, answering as Sepolia and
 * reachable from containers, with the requested services running against it. Provides
 * `Services`, `Fixtures` and `Devnet`; everything stops when the suite's layer closes.
 */
export class Services extends Context.Service<Services, ServicesApi>()(
  "@ensforge/test-services/Services",
) {
  static readonly layer = (options: {
    readonly profile: ProfileName;
    readonly services?: readonly ServiceSet[];
  }) =>
    Layer.effect(
      Services,
      Effect.flatMap(Effect.service(Devnet), (devnet) =>
        startStack(devnet, options.services ?? ["indexer"]),
      ),
    ).pipe(
      Layer.provideMerge(
        Fixtures.layer({ profile: options.profile, chainId: sepoliaChainId, host: "0.0.0.0" }),
      ),
      Layer.provide(NodeServices.layer),
    );
}
