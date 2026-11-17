import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";
import { apiReport } from "./apiReport.ts";
import { codegen } from "./codegen.ts";
import { distTypes } from "./distTypes.ts";
import { examples } from "./examples.ts";
import { lintJsdoc } from "./lintJsdoc.ts";
import { openapi } from "./openapi.ts";

/**
 * Every check that applies to the package, from its `"ensforge"` settings and fixtures: codegen,
 * JSDoc, API reports, built declarations, OpenAPI snapshots and examples. All of them run; their
 * problems are reported together.
 */
export const verify = Effect.fn("verify")(function* () {
  const workspace = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { config } = workspace;
  const fixture = (name: string) => fs.exists(path.join(workspace.packageDir, "verify", name));

  const checks = [
    ...(config.codegen === undefined ? [] : [codegen(true)]),
    ...(config.api === undefined ? [] : [lintJsdoc(), apiReport(true)]),
    ...(config.effectFree !== undefined || (yield* fixture("consumer.ts")) ? [distTypes()] : []),
    ...(config.openapi === true ? [openapi("check")] : []),
    ...((yield* fixture("example-globals.ts")) ? [examples()] : []),
  ];

  const problems: string[] = [];
  const collect = <E, R>(check: Effect.Effect<void, E | CheckFailed, R>) =>
    check.pipe(
      Effect.catch((error) =>
        error instanceof CheckFailed
          ? Effect.sync(() => {
              problems.push(`[${error.check}]`, ...error.problems);
            })
          : Effect.fail(error as E),
      ),
    );
  for (const check of checks) yield* collect(check);
  if (problems.length > 0) return yield* new CheckFailed({ check: "verify", problems });
  yield* Console.log(`verify: ok (${workspace.name})`);
});

export const verifyCommand = Command.make("verify", {}, () => verify()).pipe(
  Command.withDescription("Run every check that applies to the package"),
);
