import { Schema } from "effect";

import type { CommandSpec } from "../model/command.ts";
import { operator, Operator, role, Role } from "./access.ts";
import { subname, Subname } from "./hierarchy.ts";
import { migrate, Migrate } from "./migration.ts";
import { register, Register, renew, Renew, transfer, Transfer, wait, Wait } from "./names.ts";
import { primary, Primary } from "./primary.ts";
import { setResolver, SetResolver, SetText, setText } from "./records.ts";
import { wrapper, Wrapper } from "./wrapper.ts";

/** Every command a sequence can contain, as JSON data. */
export const Command = Schema.Union([
  Register,
  Renew,
  Transfer,
  Wait,
  SetText,
  SetResolver,
  Role,
  Operator,
  Subname,
  Wrapper,
  Primary,
  Migrate,
]);
export type Command = typeof Command.Type;

const specs: { readonly [K in Command["kind"]]: CommandSpec<Extract<Command, { kind: K }>> } = {
  register,
  renew,
  transfer,
  wait,
  setText,
  setResolver,
  role,
  operator,
  subname,
  wrapper,
  primary,
  migrate,
};

export const specOf = <C extends Command>(command: C) =>
  // `specs` is keyed by `kind`, so the spec found for `command` is the one for `C`; TypeScript
  // cannot correlate the two.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  specs[command.kind] as unknown as CommandSpec<C>;
