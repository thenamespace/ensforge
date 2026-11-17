import { Console, Effect, FileSystem, Option } from "effect";
import { Command, Flag } from "effect/cli";

import { build } from "../build.ts";
import { startDevnet } from "../Devnet.ts";
import { chainId, profiles } from "../profiles/profiles.ts";
import { profileArgument } from "./build.ts";

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
          `${JSON.stringify(
            {
              profile,
              chainId,
              rpcUrl: devnet.rpcUrl,
              // Everything was deployed from block 1; indexers start there.
              startBlock: 0,
              contracts: devnet.contracts,
              deployments: devnet.deployments,
            },
            null,
            2,
          )}\n`,
        );
      }
      yield* Console.log(
        [
          `${profile}: ${profiles[profile].description}`,
          `RPC       ${devnet.rpcUrl} (chain ${chainId})`,
          ...Object.entries(devnet.accounts).map(
            ([name, address]) => `${name.padEnd(9)} ${address}`,
          ),
          "Stop with Ctrl-C.",
        ].join("\n"),
      );
      return yield* Effect.never;
    }).pipe(Effect.scoped),
).pipe(Command.withDescription("Run a devnet for a profile until interrupted"));

export const profileCommand = Command.make("profile", { profile: profileArgument }, ({ profile }) =>
  build(profile).pipe(
    Effect.flatMap((built) =>
      Console.log(JSON.stringify(profiles[profile].deployments(built.ledger), null, 2)),
    ),
  ),
).pipe(Command.withDescription("Print the ensforge deployment profile of a profile"));
