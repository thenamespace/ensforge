import { Effect, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** A Docker command that failed, with its output. */
export class DockerError extends Schema.TaggedError<
  DockerError,
  { readonly brand: unique symbol }
>()("DockerError", {
  message: Schema.String,
}) {}

/** Runs `docker …args` and returns its output; a non-zero exit fails with stdout and stderr. */
export const docker = Effect.fnUntraced(function* (
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make("docker", args, { env, extendEnv: true });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
          handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      if (exitCode !== 0) {
        return yield* new DockerError({
          message: `docker ${args.join(" ")} exited ${exitCode}:\n${stdout}${stderr}`,
        });
      }
      return stdout;
    }),
  ).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(new DockerError({ message: `docker ${args[0] ?? ""} failed: ${String(cause)}` })),
    ),
  );
});
