// Reads the repository synchronously: it runs during test setup, outside any Effect runtime.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { readdirSync, readFileSync } from "node:fs";

import { Array as Arr, Option, String as Str } from "effect";

const repository = new URL("../../../", import.meta.url);

/** Packages whose actions declare an `ErrorType` (generated from `@throws` by codegen). */
const packages = ["sdk", "hca"];

const errorNames = (text: string): string[] =>
  Arr.map([...Str.matchAll(/\b(\w+Error)\b/g)(text)], ([, name]) => name ?? "");

/** The classes each union alias of the SDK's `errors/types.ts` stands for (`WriteError` → …). */
const unions = (): ReadonlyMap<string, readonly string[]> => {
  const source = readFileSync(new URL("packages/sdk/src/errors/types.ts", repository), "utf8");
  const aliases = new Map(
    Arr.map([...Str.matchAll(/export type (\w+Error) =([^;]*);/g)(source)], ([, name, union]) => [
      name ?? "",
      errorNames(union ?? ""),
    ]),
  );
  const expand = (name: string): string[] =>
    Option.fromNullishOr(aliases.get(name)).pipe(
      Option.map((members) =>
        Arr.flatMap(members, (member) => (member === name ? [] : expand(member))),
      ),
      Option.getOrElse(() => [name]),
    );
  return new Map(Arr.map([...aliases.keys()], (name) => [name, expand(name)]));
};

/**
 * The error classes (`_tag`s) each public action declares, by path (`record.set`,
 * `record.setSync`), read from the `ErrorType` alias of every action's `index.ts`. A write's
 * `.prepare`, `.simulate` and `.estimateGas` share its path's declaration.
 */
export const declaredErrors = (): ReadonlyMap<string, ReadonlySet<string>> => {
  const aliases = unions();
  const declared = new Map<string, ReadonlySet<string>>();

  for (const pkg of packages) {
    const actions = new URL(`packages/${pkg}/src/actions/`, repository);
    const files = Arr.filter(readdirSync(actions, { recursive: true, encoding: "utf8" }), (file) =>
      /^\w+\/\w+\/index\.ts$/.test(file),
    );
    for (const file of files) {
      const domain = Str.split(file, "/")[0];
      const source = readFileSync(new URL(file, actions), "utf8");
      for (const namespace of Str.matchAll(/export declare namespace (\w+) \{/g)(source)) {
        const alias = /type ErrorType\b[^=]*=([^;]*);/.exec(Str.slice(namespace.index)(source));
        const classes = Arr.flatMap(
          errorNames(alias?.[1] ?? ""),
          (name) => aliases.get(name) ?? [name],
        );
        declared.set(`${domain}.${namespace[1]}`, new Set(classes));
      }
    }
  }
  return declared;
};
