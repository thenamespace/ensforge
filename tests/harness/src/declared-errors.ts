import { readdirSync, readFileSync } from "node:fs";

const repository = new URL("../../../", import.meta.url);

/** Packages whose actions declare an `ErrorType` (generated from `@throws` by codegen). */
const packages = ["sdk", "hca"];

const errorNames = (text: string): string[] =>
  [...text.matchAll(/\b(\w+Error)\b/g)].map(([, name]) => name ?? "");

/** The classes each union alias of the SDK's `errors/types.ts` stands for (`WriteError` → …). */
const unions = (): ReadonlyMap<string, readonly string[]> => {
  const source = readFileSync(new URL("packages/sdk/src/errors/types.ts", repository), "utf8");
  const aliases = new Map(
    [...source.matchAll(/export type (\w+Error) =([^;]*);/g)].map(([, name, union]) => [
      name ?? "",
      errorNames(union ?? ""),
    ]),
  );
  const expand = (name: string): string[] =>
    aliases.get(name)?.flatMap((member) => (member === name ? [] : expand(member))) ?? [name];
  return new Map([...aliases.keys()].map((name) => [name, expand(name)]));
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
    const files = readdirSync(actions, { recursive: true, encoding: "utf8" }).filter((file) =>
      /^\w+\/\w+\/index\.ts$/.test(file),
    );
    for (const file of files) {
      const domain = file.split("/")[0];
      const source = readFileSync(new URL(file, actions), "utf8");
      for (const namespace of source.matchAll(/export declare namespace (\w+) \{/g)) {
        const alias = /type ErrorType\b[^=]*=([^;]*);/.exec(source.slice(namespace.index));
        const classes = errorNames(alias?.[1] ?? "").flatMap((name) => aliases.get(name) ?? name);
        declared.set(`${domain}.${namespace[1]}`, new Set(classes));
      }
    }
  }
  return declared;
};
