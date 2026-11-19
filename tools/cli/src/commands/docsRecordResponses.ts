/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/prefer-effect-record -- small synchronous scripting over loosely typed dynamic imports */
import { Console, DateTime, Effect, FileSystem, Formatter, Path, Result } from "effect";
import { Command, Flag } from "effect/cli";

import { callLine } from "../docs/literal.ts";
import { recordedCalls, skippedReads } from "../docs/responseCalls.ts";
import { type ExampleResponse, readable } from "../docs/responses.ts";
import { SetupError } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";

/** Calls `target[name](...args)` on a dynamically imported value, whose types are not known here. */
const invoke = (target: unknown, name: string, ...args: readonly unknown[]): unknown => {
  const fn: unknown = Reflect.get(Object(target), name);
  if (typeof fn !== "function") throw new Error(`${name} is not a function`);
  return Reflect.apply(fn, target, args);
};

const load = (file: string) =>
  Effect.tryPromise({
    try: (): Promise<unknown> => import(new URL(`file://${file}`).href),
    catch: (cause) =>
      SetupError.make({ message: `${file}: ${String(cause)}. Build the SDK first.` }),
  });

const throttleMillis = 250;

/**
 * Calls each read action of `recordedCalls` once through the built SDK against a public mainnet
 * endpoint (read-only; never the `.env` RPC) and writes `apps/docs/src/content/example-responses.json`,
 * which the generator renders as "Example response" sections. Build the SDK first. Actions that
 * fail are left out and reported; re-run to refresh the recordings.
 */
export const docsRecordResponses = Effect.fn("docs.recordResponses")(function* (endpoint: string) {
  const workspace = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sdkDir = path.join(workspace.root, "packages/sdk");
  const sdk = yield* load(path.join(sdkDir, "dist/index.js"));
  const indexer = yield* load(path.join(sdkDir, "dist/indexer/index.js"));
  const viem = yield* load(path.join(sdkDir, "node_modules/viem/_esm/index.js"));
  const chains = yield* load(path.join(sdkDir, "node_modules/viem/_esm/chains/index.js"));

  const mainnet = Reflect.get(Object(chains), "mainnet");
  const transport = invoke(viem, "http", endpoint);
  const publicClient = invoke(viem, "createPublicClient", { chain: mainnet, transport });
  const ens = invoke(
    invoke(
      invoke(Reflect.get(Object(sdk), "Ensforge"), "create", {
        chain: mainnet,
        transports: { [Number(Reflect.get(Object(mainnet), "id"))]: transport },
        indexer: invoke(indexer, "bigname"),
      }),
      "extend",
      invoke(sdk, "ensActions"),
    ),
    "extend",
    invoke(indexer, "indexerActions"),
  );

  const recordings: Record<string, ExampleResponse> = {};
  const startBlock = yield* Effect.tryPromise({
    try: () => Promise.resolve(invoke(publicClient, "getBlockNumber")),
    catch: (cause) => SetupError.make({ message: `${endpoint}: ${String(cause)}` }),
  });
  const now = yield* DateTime.now;
  const recordedAt = DateTime.formatIso(now);
  const failed: string[] = [];
  for (const entry of recordedCalls) {
    yield* Effect.sleep(throttleMillis);
    const [domain = "", action = ""] = entry.path.split(".");
    const result = yield* Effect.tryPromise({
      try: () => Promise.resolve(invoke(Reflect.get(Object(ens), domain), action, entry.options)),
      catch: (cause) => String(cause).split("\n")[0] ?? "failed",
    }).pipe(Effect.result);
    if (Result.isFailure(result)) {
      failed.push(`${entry.path} (${result.failure})`);
      continue;
    }
    recordings[entry.path] = {
      call: callLine(entry.path, entry.options),
      response: readable(result.success),
      recordedAt,
      block: Number(startBlock),
    };
  }

  const file = path.join(workspace.root, "apps/docs/src/content/example-responses.json");
  yield* fs.writeFileString(
    file,
    `${Formatter.formatJson(
      Object.fromEntries(Object.entries(recordings).toSorted(([a], [b]) => a.localeCompare(b))),
      { space: 2 },
    )}\n`,
  );

  yield* Console.log(`docs record-responses: recorded ${Object.keys(recordings).length} responses`);
  if (failed.length > 0) yield* Console.warn(`failed (left out): ${failed.join(", ")}`);
  for (const [skipped, reason] of Object.entries(skippedReads))
    yield* Console.log(`skipped ${skipped}: ${reason}`);
});

export const docsRecordResponsesCommand = Command.make(
  "record-responses",
  {
    endpoint: Flag.String("endpoint").pipe(
      Flag.withDefault("https://eth.drpc.org"),
      Flag.withDescription("Public Ethereum mainnet RPC to read from"),
    ),
  },
  ({ endpoint }) => docsRecordResponses(endpoint),
).pipe(
  Command.withDescription("Record example responses of the SDK read actions from Ethereum mainnet"),
);
