import { createRequire } from "node:module";

import { Effect } from "effect";

import type { Abi, Hex } from "viem";

import { ArtifactError } from "../errors.ts";

type Solc = { readonly compile: (input: string) => string; readonly version: () => string };

/** The solc-js builds the devnet compiles with, matching the ENS releases byte for byte. */
const compilers = {
  "0.8.25": "solc-0.8.25",
  "0.8.27": "solc-0.8.27",
} as const;

export type CompilerVersion = keyof typeof compilers;

export type StandardJsonInput = {
  readonly language: "Solidity";
  readonly sources: Readonly<Record<string, { readonly content: string }>>;
  readonly settings: Readonly<Record<string, unknown>>;
};

export type Compiled = { readonly abi: Abi; readonly bytecode: Hex };

type Output = {
  readonly errors?: readonly { readonly severity: string; readonly formattedMessage: string }[];
  readonly contracts?: Readonly<
    Record<
      string,
      Readonly<
        Record<string, { readonly abi: Abi; readonly evm: { bytecode: { object: string } } }>
      >
    >
  >;
};

const require = createRequire(import.meta.url);

type Remapping = { readonly context: string; readonly prefix: string; readonly target: string };

const parseRemapping = (remapping: string): Remapping => {
  const [left = "", target = ""] = remapping.split("=");
  const [context, prefix] = left.includes(":") ? left.split(":") : ["", left];
  return { context: context ?? "", prefix: prefix ?? "", target };
};

const dirname = (file: string) => file.slice(0, file.lastIndexOf("/"));

// Resolves an import the way solc does: relative paths against the importing file, others through
// the longest matching remapping whose context contains the importing file.
const resolveImport = (from: string, path: string, remappings: readonly Remapping[]): string => {
  if (path.startsWith("./") || path.startsWith("../")) {
    const parts = dirname(from).split("/");
    for (const segment of path.split("/")) {
      if (segment === "..") parts.pop();
      else if (segment !== ".") parts.push(segment);
    }
    return parts.join("/");
  }
  const match = remappings
    .filter((remapping) => from.startsWith(remapping.context) && path.startsWith(remapping.prefix))
    .toSorted(
      (a, b) => b.context.length - a.context.length || b.prefix.length - a.prefix.length,
    )[0];
  return match === undefined ? path : match.target + path.slice(match.prefix.length);
};

/**
 * The sources `roots` import, transitively. A contract's metadata hash covers only these, so
 * compiling them alone gives the same bytecode, and keeps solc-js within its memory.
 */
const importClosure = (input: StandardJsonInput, roots: readonly string[]): StandardJsonInput => {
  const remappings = ((input.settings["remappings"] ?? []) as string[]).map(parseRemapping);
  const included = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (included.has(file)) continue;
    const content = input.sources[file]?.content;
    if (content === undefined) continue;
    included.add(file);
    for (const [, path] of content.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)) {
      pending.push(resolveImport(file, path as string, remappings));
    }
  }
  return {
    ...input,
    sources: Object.fromEntries(
      [...included].map((file) => [file, input.sources[file] as { content: string }]),
    ),
  };
};

/**
 * Compiles `contracts` (`sourceName:ContractName`) from a standard-JSON input. Only their bytecode
 * and ABI are generated; the metadata hash does not depend on the output selection, so the
 * bytecode matches the original build.
 */
export const compile = (
  version: CompilerVersion,
  input: StandardJsonInput,
  contracts: readonly string[],
): Effect.Effect<Readonly<Record<string, Compiled>>, ArtifactError> => {
  const fail = (message: string) => new ArtifactError({ artifact: contracts.join(", "), message });
  return Effect.gen(function* () {
    const solc = require(compilers[version]) as Solc;
    if (!solc.version().startsWith(`${version}+`)) {
      return yield* fail(`expected solc ${version}, loaded ${solc.version()}`);
    }

    const outputSelection: Record<string, Record<string, string[]>> = {};
    for (const contract of contracts) {
      const [file = "", name = ""] = contract.split(":");
      (outputSelection[file] ??= {})[name] = ["abi", "evm.bytecode.object"];
    }
    const pruned = importClosure(input, Object.keys(outputSelection));
    const output = JSON.parse(
      solc.compile(
        JSON.stringify({ ...pruned, settings: { ...pruned.settings, outputSelection } }),
      ),
    ) as Output;

    const errors = (output.errors ?? []).filter((error) => error.severity === "error");
    if (errors.length > 0) {
      return yield* fail(errors.map((error) => error.formattedMessage).join("\n"));
    }

    const compiled: Record<string, Compiled> = {};
    for (const contract of contracts) {
      const [file = "", name = ""] = contract.split(":");
      const result = output.contracts?.[file]?.[name];
      if (result === undefined) return yield* fail(`${contract} is not in the output`);
      compiled[contract] = { abi: result.abi, bytecode: `0x${result.evm.bytecode.object}` };
    }
    return compiled;
  });
};
