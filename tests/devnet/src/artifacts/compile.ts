import { createRequire } from "node:module";

import {
  Array as Arr,
  Effect,
  Formatter,
  Order,
  Predicate,
  Record as Rec,
  Schema,
  String as Str,
} from "effect";

import type { Abi, Hex } from "viem";

import { ArtifactError } from "../errors.ts";
import { AbiSchema } from "./json.ts";

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

const Output = Schema.fromJsonString(
  Schema.Struct({
    errors: Schema.optional(
      Schema.Array(Schema.Struct({ severity: Schema.String, formattedMessage: Schema.String })),
    ),
    contracts: Schema.optional(
      Schema.Record(
        Schema.String,
        Schema.Record(
          Schema.String,
          Schema.Struct({
            abi: AbiSchema,
            evm: Schema.Struct({ bytecode: Schema.Struct({ object: Schema.String }) }),
          }),
        ),
      ),
    ),
  }),
);

const require = createRequire(import.meta.url);

type Remapping = { readonly context: string; readonly prefix: string; readonly target: string };

// Resolves an import the way solc does: relative paths against the importing file, others through
// the longest matching remapping whose context contains the importing file.
const resolveImport = (from: string, path: string, remappings: readonly Remapping[]): string => {
  if (Str.startsWith("./")(path) || Str.startsWith("../")(path)) {
    const parts = Arr.dropRight(Str.split(from, "/"), 1);
    for (const segment of Str.split(path, "/")) {
      if (segment === "..") parts.pop();
      else if (segment !== ".") parts.push(segment);
    }
    return Arr.join(parts, "/");
  }
  const longestFirst = Order.combine(
    Order.flip(Order.mapInput(Order.Number, (remapping: Remapping) => remapping.context.length)),
    Order.flip(Order.mapInput(Order.Number, (remapping: Remapping) => remapping.prefix.length)),
  );
  const match = Arr.sort(
    Arr.filter(
      remappings,
      (remapping) =>
        Str.startsWith(remapping.context)(from) && Str.startsWith(remapping.prefix)(path),
    ),
    longestFirst,
  )[0];
  return match === undefined ? path : match.target + Str.slice(match.prefix.length)(path);
};

/**
 * The sources `roots` import, transitively. A contract's metadata hash covers only these, so
 * compiling them alone gives the same bytecode, and keeps solc-js within its memory.
 */
const importClosure = (input: StandardJsonInput, roots: readonly string[]): StandardJsonInput => {
  const configured = input.settings["remappings"];
  const remappings = Arr.map(
    Arr.filter(Arr.isArray(configured) ? configured : [], Predicate.isString),
    (remapping): Remapping => {
      const [left, target = ""] = Str.split(remapping, "=");
      const [context, prefix = ""] = Str.includes(":")(left) ? Str.split(left, ":") : ["", left];
      return { context, prefix, target };
    },
  );
  const included = new Map<string, { readonly content: string }>();
  const pending = [...roots];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (included.has(file)) continue;
    const source = input.sources[file];
    if (source === undefined) continue;
    included.set(file, source);
    for (const [, path = ""] of Str.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)(
      source.content,
    )) {
      pending.push(resolveImport(file, path, remappings));
    }
  }
  return { ...input, sources: Rec.fromEntries([...included]) };
};

/**
 * Compiles `contracts` (`sourceName:ContractName`) from a standard-JSON input. Only their bytecode
 * and ABI are generated; the metadata hash does not depend on the output selection, so the
 * bytecode matches the original build.
 */
export const compile = Effect.fnUntraced(function* (
  version: CompilerVersion,
  input: StandardJsonInput,
  contracts: readonly string[],
) {
  const artifact = Arr.join(contracts, ", ");
  // solc-js is an untyped CommonJS module.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const solc = require(compilers[version]) as Solc;
  if (!Str.startsWith(`${version}+`)(solc.version())) {
    return yield* ArtifactError.make({
      artifact,
      message: `expected solc ${version}, loaded ${solc.version()}`,
    });
  }

  const outputSelection: Record<string, Record<string, readonly string[]>> = {};
  for (const contract of contracts) {
    const [file, name = ""] = Str.split(contract, ":");
    (outputSelection[file] ??= {})[name] = ["abi", "evm.bytecode.object"];
  }
  const pruned = importClosure(input, Rec.keys(outputSelection));
  const standardInput = Formatter.formatJson({
    ...pruned,
    settings: { ...pruned.settings, outputSelection },
  });
  const output = yield* Schema.decodeEffect(Output)(solc.compile(standardInput)).pipe(
    Effect.mapError((cause) => ArtifactError.make({ artifact, message: String(cause) })),
  );

  const errors = Arr.filter(output.errors ?? [], (error) => error.severity === "error");
  if (errors.length > 0) {
    return yield* ArtifactError.make({
      artifact,
      message: Arr.join(
        Arr.map(errors, (error) => error.formattedMessage),
        "\n",
      ),
    });
  }

  const compiled: Record<string, Compiled> = {};
  for (const contract of contracts) {
    const [file, name = ""] = Str.split(contract, ":");
    const result = output.contracts?.[file]?.[name];
    if (result === undefined) {
      return yield* ArtifactError.make({ artifact, message: `${contract} is not in the output` });
    }
    compiled[contract] = { abi: result.abi, bytecode: `0x${result.evm.bytecode.object}` };
  }
  return compiled;
});
