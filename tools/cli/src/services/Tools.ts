import { Context, Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ToolFailed } from "../errors.ts";

/** Runs the command-line tools the checks need, capturing their output. */
export class Tools extends Context.Service<
  Tools,
  {
    /** Runs `command`, failing with its output when it exits non-zero. */
    readonly run: (
      command: string,
      args: readonly string[],
      options?: { readonly cwd?: string; readonly inherit?: boolean },
    ) => Effect.Effect<string, ToolFailed>;
  }
>()("@ensforge/tools/Tools") {
  static readonly layer = Layer.effect(
    Tools,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const run = Effect.fn("Tools.run")(function* (
        command: string,
        args: readonly string[],
        options: { readonly cwd?: string; readonly inherit?: boolean } = {},
      ) {
        const tool = [command, ...args.slice(0, 2)].join(" ");
        const failed = (output: string) => new ToolFailed({ tool, output });
        const handle = yield* spawner
          .spawn(
            ChildProcess.make(command, [...args], {
              ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
              ...(options.inherit === true ? { stdout: "inherit", stderr: "inherit" } : {}),
            }),
          )
          .pipe(Effect.mapError((cause) => failed(String(cause))));

        const output =
          options.inherit === true
            ? ""
            : yield* handle.all.pipe(
                Stream.decodeText(),
                Stream.mkString,
                Effect.mapError((cause) => failed(String(cause))),
              );
        const exitCode = yield* handle.exitCode.pipe(
          Effect.mapError((cause) => failed(String(cause))),
        );
        if (exitCode !== ChildProcessSpawner.ExitCode(0)) return yield* failed(output);
        return output;
      }, Effect.scoped);

      return Tools.of({ run });
    }),
  );
}
