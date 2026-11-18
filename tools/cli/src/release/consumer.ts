import { Array as Arr, String as Str, Record as Rec } from "effect";

import type { PackedRelease } from "./packDir.ts";

/**
 * The manifests of a throwaway app that installs the packed tarballs: each release as a `file:`
 * dependency, overridden everywhere so the packages' dependencies on each other resolve to the
 * tarballs too (the new versions are not on npm yet), and every peer the packages declare,
 * optional ones included, so each entry can be imported. JSON is valid YAML, so the pnpm
 * workspace file needs no YAML writer.
 */
export const consumerManifests = (
  releases: readonly PackedRelease[],
  tarballOf: (release: PackedRelease) => string,
  peers: Readonly<Record<string, string>>,
) => {
  const tarballs = Rec.fromEntries(
    Arr.map(releases, (release) => [release.name, `file:${tarballOf(release)}`]),
  );
  const dependencies: Record<string, string> = Rec.fromEntries(
    Arr.filter(Rec.toEntries(peers), ([name]) => !(name in tarballs)),
  );
  // React's types ship separately; the react package's declarations need them.
  if (peers.react !== undefined) dependencies["@types/react"] = peers.react;
  return {
    packageJson: {
      name: "ensforge-release-consumer",
      private: true,
      type: "module",
      dependencies: { ...dependencies, ...tarballs },
    },
    workspace: { overrides: tarballs },
  };
};

/** Import specifiers of a package's published exports, without `./package.json` and patterns. */
export const publicEntries = (name: string, exports: Readonly<Record<string, unknown>>) =>
  Arr.map(
    Arr.filter(
      Rec.keys(exports),
      (subpath) => subpath !== "./package.json" && !Str.includes("*")(subpath),
    ),
    (subpath) => (subpath === "." ? name : `${name}/${Str.slice(2)(subpath)}`),
  );

/**
 * A module importing every entry: run by Node as `.mjs`, compiled by tsc as `.ts`. An entry that
 * exports nothing is reported by the `.mjs` run.
 */
export const entriesModule = (specifiers: readonly string[]) =>
  Arr.join(
    [
      ...Arr.map(
        specifiers,
        (specifier, index) => `import * as entry${index} from "${specifier}";`,
      ),
      "",
      `const entries = { ${Arr.join(
        Arr.map(specifiers, (specifier, index) => `"${specifier}": entry${index}`),
        ", ",
      )} };`,
      "const empty = Object.entries(entries).filter(([, entry]) => Object.keys(entry).length === 0);",
      'if (empty.length > 0) throw new Error("no exports: " + empty.map(([name]) => name).join(", "));',
      "",
    ],
    "\n",
  );
