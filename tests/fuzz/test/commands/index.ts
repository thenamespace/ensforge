import { Schema } from "effect";

import type { CommandSpec } from "../model/command.ts";
import { register, Register, renew, Renew, transfer, Transfer, wait, Wait } from "./names.ts";
import { SetText, setText } from "./records.ts";

/** Every command a sequence can contain, as JSON data. */
export const Command = Schema.Union([Register, Renew, Transfer, Wait, SetText]);
export type Command = typeof Command.Type;

const specs: { readonly [K in Command["kind"]]: CommandSpec<Extract<Command, { kind: K }>> } = {
  register,
  renew,
  transfer,
  wait,
  setText,
};

export const specOf = <C extends Command>(command: C) =>
  specs[command.kind] as unknown as CommandSpec<C>;
