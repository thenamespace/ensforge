import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Formatter,
  Option,
  Record as Rec,
  String as Str,
} from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { build, isL2Profile } from "../build.ts";
import { Devnet, startDevnet, startL2 } from "../Devnet.ts";
import { VerifyFailed } from "../errors.ts";
import { chainId, profiles } from "../profiles/profiles.ts";
import { verify, verifyL2 } from "../verify.ts";
import { buildNames, profileArgument } from "./build.ts";

export const startCommand = Command.make(
  "start",
  {
    profile: profileArgument,
    port: Flag.Int("port").pipe(Flag.withDefault(8545), Flag.withDescription("RPC port")),
    host: Flag.String("host").pipe(
      Flag.withDefault("127.0.0.1"),
      Flag.withDescription("Interface; 0.0.0.0 lets containers reach the chain"),
    ),
    manifest: Flag.String("manifest").pipe(
      Flag.optional,
      Flag.withDescription("Write chain ID, RPC URL and every address to this JSON file"),
    ),
  },
  ({ profile, port, host, manifest }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const devnet = yield* startDevnet({ profile, port, host });

      if (Option.isSome(manifest)) {
        yield* fs.writeFileString(
          manifest.value,
          `${Formatter.formatJson(
            {
              profile,
              chainId,
              rpcUrl: devnet.rpcUrl,
              // Everything was deployed from block 1; indexers start there.
              startBlock: 0,
              contracts: devnet.contracts,
              deployments: devnet.deployments,
            },
            { space: 2 },
          )}\n`,
        );
      }
      yield* Console.log(
        Arr.join(
          [
            `${profile}: ${profiles[profile].description}`,
            `RPC       ${devnet.rpcUrl} (chain ${chainId})`,
            ...Arr.map(
              Rec.toEntries(devnet.accounts),
              ([name, address]) => `${Str.padEnd(9)(name)} ${address}`,
            ),
            "Stop with Ctrl-C.",
          ],
          "\n",
        ),
      );
      return yield* Effect.never;
    }).pipe(Effect.scoped),
).pipe(Command.withDescription("Run a devnet for a profile until interrupted"));

export const profileCommand = Command.make("profile", { profile: profileArgument }, ({ profile }) =>
  build(profile).pipe(
    Effect.flatMap((built) =>
      Console.log(Formatter.formatJson(profiles[profile].deployments(built.ledger), { space: 2 })),
    ),
  ),
).pipe(Command.withDescription("Print the ensforge deployment profile of a profile"));

export const verifyCommand = Command.make(
  "verify",
  {
    profiles: Argument.Literals("profile", buildNames).pipe(
      Argument.withDescription("Devnet or L2 profile"),
      Argument.variadic(),
    ),
  },
  ({ profiles: selected }) =>
    Effect.forEach(
      selected.length > 0 ? selected : buildNames,
      (profile) =>
        Effect.gen(function* () {
          const problems = isL2Profile(profile)
            ? yield* startL2({ profile }).pipe(Effect.flatMap(verifyL2))
            : yield* verify().pipe(Effect.provideServiceEffect(Devnet, startDevnet({ profile })));
          if (problems.length > 0) return yield* VerifyFailed.make({ profile, problems });
          return yield* Console.log(`${profile}: ok`);
        }).pipe(Effect.scoped),
      { concurrency: 1 },
    ),
).pipe(
  Command.withDescription("Check that profiles (all when none is named) are wired as intended"),
);
