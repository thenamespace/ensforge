import { Command } from "effect/cli";

import { releaseCheckCommand } from "./releaseCheck.ts";
import { releaseSmokeCommand } from "./releaseSmoke.ts";

export const releaseCommand = Command.make("release").pipe(
  Command.withDescription("Check packed release tarballs and their published versions"),
  Command.withSubcommands([releaseCheckCommand, releaseSmokeCommand]),
);
