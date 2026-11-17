import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer, Schedule, Schema } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { Actions } from "@ensforge/sdk/effect";
import { bigname, type Indexer } from "@ensforge/sdk/indexer";
import { Chain, Devnet, type ChainError, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { Clients } from "@ensforge/test-integration/support/clients";
import { chainServices } from "@ensforge/test-integration/support/lane";
import getPort from "get-port";
import { parseEther, toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { bignameImage } from "./bigname.ts";
import { docker } from "./docker.ts";
import { images } from "./images.ts";

const composeFile = fileURLToPath(new URL("../../compose.yml", import.meta.url));

/** Which services a suite starts: bigname (`indexer`), or the bundler and paymaster (`aa`). */
export type ServiceSet = "indexer" | "aa";

/** The stack could not start, or did not catch up in time. */
export class StackError extends Schema.TaggedError<StackError, { readonly brand: unique symbol }>()(
  "StackError",
  {
    message: Schema.String,
  },
) {}

/** Retries `check` every 250 ms for about five minutes (a cold start), then fails with logs. */
const until = <E extends { readonly message: string }>(
  check: Effect.Effect<void, E>,
  logs: Effect.Effect<string>,
) =>
  check.pipe(
    Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 1200 }),
    Effect.catch((error) =>
      Effect.flatMap(logs, (tail) =>
        Effect.fail(new StackError({ message: `${error.message}\n${tail}` })),
      ),
    ),
  );

const reachable = (url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: () => fetch(url, init),
    catch: (cause) => new StackError({ message: `${url}: ${String(cause)}` }),
  }).pipe(
    Effect.filterOrFail(
      (response) => response.ok,
      (response) => new StackError({ message: `${url} answered ${response.status}` }),
    ),
  );

// In anvil's test mnemonic, indexes 0–9 are the devnet's named accounts and 10 is the fixtures'
// EIP-7702 EOA (it refuses ETH, so it cannot be the bundler's beneficiary): alto gets its own.
const altoAccount = (addressIndex: number) => {
  const account = mnemonicToAccount("test test test test test test test test test test test junk", {
    addressIndex,
  });
  return {
    address: account.address,
    key: toHex(account.getHdKey().privateKey ?? new Uint8Array()),
  };
};

const startStack = Effect.fnUntraced(function* (services: readonly ServiceSet[]) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const clients = yield* Clients;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const indexer = services.includes("indexer");
  const aa = services.includes("aa");
  const port = Effect.promise(() => getPort());
  const [bignamePort, altoPort, paymasterPort] = yield* Effect.all([port, port, port]);

  const utility = altoAccount(20);
  const executor = altoAccount(21);
  if (aa) {
    yield* chain.setBalance(utility.address, parseEther("1000"));
    yield* chain.setBalance(executor.address, parseEther("1000"));
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
    ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));

  yield* Effect.acquireRelease(compose(["up", "--detach", "--build"]), () =>
    Effect.ignore(compose(["down", "--volumes", "--remove-orphans"])),
  );

  const logs = compose(["logs", "--no-color", "--tail", "40"]).pipe(
    Effect.orElseSucceed(() => "(no logs)"),
  );
  const indexerUrl = `http://127.0.0.1:${bignamePort}`;
  const bignameIndexer = bigname({ url: indexerUrl });
  const reader = clients.make({ indexer: bignameIndexer });
  const waitForIndexed = Effect.fnUntraced(function* (block?: bigint) {
    const target = block ?? (yield* chain.blockNumber);
    yield* until(
      Actions.indexer.getStatus(reader).pipe(
        Effect.map((status) => status.chains[sepolia.id]?.indexed ?? null),
        Effect.filterOrFail(
          (indexed) => indexed !== null && indexed >= target,
          (indexed) => new StackError({ message: `indexed ${indexed}, waiting for ${target}` }),
        ),
      ),
      logs,
    );
  });

  const bundlerUrl = `http://127.0.0.1:${altoPort}`;
  const paymasterUrl = `http://127.0.0.1:${paymasterPort}`;
  if (indexer) yield* waitForIndexed();
  if (aa) {
    const supportedEntryPoints = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_supportedEntryPoints",
        params: [],
      }),
    };
    yield* until(reachable(bundlerUrl, supportedEntryPoints), logs);
    yield* until(reachable(`${paymasterUrl}/ping`), logs);
  }

  return Services.of({
    indexerUrl,
    indexer: bignameIndexer,
    waitForIndexed,
    bundlerUrl,
    paymasterUrl,
  });
});

/**
 * The services stack for a suite: the profile's seeded devnet, answering as Sepolia (the only
 * test chain bigname indexes) and reachable from containers, with the requested services running
 * against it. Provides `Services`, `Fixtures`, `Devnet` and the chain services (`Chain`, `Clients`,
 * `Wallets`, `Gateways`); everything stops when the suite's layer closes.
 */
export class Services extends Context.Service<
  Services,
  {
    /** bigname's base URL (`indexer`). */
    readonly indexerUrl: string;
    /** ensforge's bigname adapter on that URL, for `Clients.make({ indexer })`. */
    readonly indexer: Indexer;
    /** Waits until bigname has indexed `block` (the devnet's latest block by default). */
    readonly waitForIndexed: (block?: bigint) => Effect.Effect<void, StackError | ChainError>;
    /** alto's ERC-4337 RPC URL (`aa`). */
    readonly bundlerUrl: string;
    /** The ERC-7677 paymaster's URL, which sponsors every UserOperation (`aa`). */
    readonly paymasterUrl: string;
  }
>()("@ensforge/test-services/Services") {
  static readonly layer = (options: {
    readonly profile: ProfileName;
    readonly services?: readonly ServiceSet[];
  }) =>
    Layer.effect(Services, startStack(options.services ?? ["indexer"])).pipe(
      Layer.provideMerge(chainServices),
      Layer.provideMerge(
        Fixtures.layer({ profile: options.profile, chainId: sepolia.id, host: "0.0.0.0" }),
      ),
      Layer.provide(NodeServices.layer),
    );
}
