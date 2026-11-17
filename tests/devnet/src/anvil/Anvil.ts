import { Context, Effect, FileSystem, Layer, Stream, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import getPort from "get-port";
import { Instance } from "prool";

import { AnvilError } from "../errors.ts";
import { packageDir } from "../package.ts";

export type AnvilOptions = {
  /** Fixed port; a free one is picked when omitted. */
  readonly port?: number;
  /** Interface to listen on; `0.0.0.0` makes the chain reachable from containers. */
  readonly host?: string;
  /** Off while building profiles: the deployer mines one block per transaction itself. */
  readonly mining?: boolean;
  /** Genesis timestamp (seconds). */
  readonly timestamp?: bigint;
  /** Saved chain state to start from (`anvil --load-state`). */
  readonly loadState?: string;
  /** EIP-155 chain id; anvil's 31337 when omitted. */
  readonly chainId?: number;
};

export type AnvilInstance = { readonly rpcUrl: string; readonly port: number };

// Mainnet's current hardfork; it also provides the P-256 precompile ENS DNSSEC uses. prool's
// hardfork type predates Osaka (anvil accepts it, and rejects prool's `Latest`).
const hardfork = "Osaka" as "Prague";

/** Runs anvil processes through prool, each stopped when its scope closes. */
export class Anvil extends Context.Service<
  Anvil,
  {
    readonly start: (
      options?: AnvilOptions,
    ) => Effect.Effect<AnvilInstance, AnvilError, Scope.Scope>;
  }
>()("@ensforge/test-devnet/Anvil") {
  static readonly layer = Layer.effect(
    Anvil,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;

      // Checked on the first start, so commands that never run anvil do not need it.
      const checkVersion = yield* Effect.cached(
        Effect.gen(function* () {
          const pinned = (yield* fs
            .readFileString(`${packageDir}foundry-version`)
            .pipe(Effect.mapError((cause) => new AnvilError({ message: String(cause) })))).trim();
          const installHint = `install it with \`foundryup --install ${pinned}\``;

          const version = yield* spawner.spawn(ChildProcess.make("anvil", ["--version"])).pipe(
            Effect.flatMap((handle) => handle.stdout.pipe(Stream.decodeText(), Stream.mkString)),
            Effect.scoped,
            Effect.mapError(
              () => new AnvilError({ message: `anvil is not on PATH; ${installHint}` }),
            ),
          );
          const found = /Version: (\S+)/.exec(version)?.[1];
          if (found !== pinned) {
            return yield* new AnvilError({
              message: `found anvil ${found}, need ${pinned}; ${installHint}`,
            });
          }
        }),
      );

      const start = Effect.fn("Anvil.start")(function* (options: AnvilOptions = {}) {
        yield* checkVersion;
        const port = options.port ?? (yield* Effect.promise(() => getPort()));
        const instance = Instance.anvil({
          port,
          host: options.host ?? "127.0.0.1",
          hardfork,
          noMining: options.mining === false ? true : undefined,
          timestamp: options.timestamp,
          loadState: options.loadState,
          chainId: options.chainId,
        });
        yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => instance.start(),
            catch: (cause) => new AnvilError({ message: `anvil did not start: ${String(cause)}` }),
          }),
          () => Effect.promise(() => instance.stop()),
        );
        return { rpcUrl: `http://127.0.0.1:${port}`, port };
      });

      return Anvil.of({ start });
    }),
  );
}
