// Corpus entries are read when the test file loads, to define one test per entry, so they use
// synchronous file access rather than Effect's FileSystem and Schema.
/* oxlint-disable effecttsgo/node-builtin-import, effecttsgo/schema-sync */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { Formatter, Schema, String as Str, pipe, Array as Arr } from "effect";

import { keccak256, toHex } from "viem";

import { Command } from "../commands/index.ts";

/** A shrunk failing sequence, replayed by `corpus.test.ts` from then on. */
export const Entry = Schema.Struct({
  /** The seed of the run that found it. */
  seed: Schema.Union([Schema.String, Schema.Finite]),
  /** Why it failed when found. */
  failure: Schema.String,
  commands: Schema.Array(Command),
});
export type Entry = typeof Entry.Type;

const folder = new URL("../../corpus/", import.meta.url);

/** Saves `entry` under a name derived from its commands; returns the file name. */
export const save = (entry: Entry) => {
  const file = `${pipe(keccak256(toHex(Formatter.formatJson(entry.commands))), Str.slice(2, 14))}.json`;
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL(file, folder), `${Formatter.formatJson(entry, { space: 2 })}\n`);
  return file;
};

export const load = (): readonly (readonly [file: string, entry: Entry])[] =>
  Arr.map(
    Arr.filter(readdirSync(folder), (file) => pipe(file, Str.endsWith(".json"))),
    (file) => [
      file,
      Schema.decodeSync(Schema.fromJsonString(Entry))(readFileSync(new URL(file, folder), "utf8")),
    ],
  );
