import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { Schema } from "effect";

import { keccak256, toHex } from "viem";

import { Command } from "../commands/index.ts";

/** A shrunk failing sequence, replayed by `corpus.test.ts` from then on. */
export const Entry = Schema.Struct({
  /** The seed of the run that found it. */
  seed: Schema.Union([Schema.String, Schema.Number]),
  /** Why it failed when found. */
  failure: Schema.String,
  commands: Schema.Array(Command),
});
export type Entry = typeof Entry.Type;

const folder = new URL("../../corpus/", import.meta.url);

/** Saves `entry` under a name derived from its commands; returns the file name. */
export const save = (entry: Entry) => {
  const file = `${keccak256(toHex(JSON.stringify(entry.commands))).slice(2, 14)}.json`;
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL(file, folder), `${JSON.stringify(entry, null, 2)}\n`);
  return file;
};

export const load = (): readonly (readonly [file: string, entry: Entry])[] =>
  readdirSync(folder)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file,
      Schema.decodeUnknownSync(Entry)(JSON.parse(readFileSync(new URL(file, folder), "utf8"))),
    ]);
