import { Array as Arr, Formatter, Predicate, Record as Rec, String as Str } from "effect";

import { exportSection } from "./exportPages.ts";
import { code, firstSentence, type LinkResolver, meta, page, prose, table } from "./mdx.ts";
import type { ExportDoc } from "./model.ts";

/** A runtime value as a record, or an empty one. */
export const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) && !Arr.isArray(value) ? value : {};

/** A runtime value as the docs print it: bigints in hex, as the contracts compare them. */
const shown = (value: unknown): string =>
  Predicate.isBigInt(value)
    ? `0x${value.toString(16)}`
    : Predicate.isString(value)
      ? value
      : Formatter.formatJson(value);

const isAbi = (value: unknown): value is readonly { readonly type?: unknown }[] =>
  Arr.isArray(value) && Arr.every(value, (item) => Predicate.isObject(item) && "type" in item);

/** Leaves of a nested record of constants (arrays such as ABIs are leaves), as `[path, value]`. */
export const leaves = (prefix: string, value: unknown): readonly (readonly [string, unknown])[] =>
  Predicate.isObject(value) && !Arr.isArray(value)
    ? Arr.flatMap(Rec.toEntries(recordOf(value)), ([key, child]) =>
        leaves(prefix === "" ? key : `${prefix}.${key}`, child),
      )
    : [[prefix, value]];

const summaryOf = (
  docs: ReadonlyMap<string, ExportDoc>,
  path: string,
  resolve: LinkResolver,
): string => prose(firstSentence(docs.get(path)?.doc.summary ?? ""), resolve);

/** Every ABI in `Abis`, with what it holds. */
export const abisPage = (
  abis: unknown,
  docs: ReadonlyMap<string, ExportDoc>,
  resolve: LinkResolver,
): string => {
  const rows = Arr.filter(leaves("Abis", abis), ([, value]) => isAbi(value));
  const groups = Arr.groupBy(rows, ([path]) => Arr.join(Str.split(path, ".").slice(0, -1), "."));
  return page(
    {
      title: "ABIs",
      description:
        "Look up every ENS contract ABI in @ensforge/contracts, by protocol version, as typed const arrays you can pass straight to viem.",
      keywords: ["Abis", "ABI", "viem"],
    },
    [
      "`Abis` holds every ENS contract ABI as a `const` array, so viem infers function names, arguments and results. ENSv1 ABIs are in `Abis.v1`, ENSv2 ABIs in `Abis.v2`, and resolver profiles, token standards, errors and events shared by both in `Abis.shared`. See [Use ABIs with viem](/docs/contracts/use-abis-with-viem).",
      ...Arr.map(Rec.toEntries(groups), ([group, entries]) =>
        Arr.join(
          [
            `## ${code(group)}`,
            table(
              ["ABI", "Functions", "Events", "Errors", "Description"],
              Arr.map(entries, ([path, value]) => {
                const items = isAbi(value) ? value : [];
                const count = (type: string) =>
                  String(Arr.filter(items, (item) => item.type === type).length);
                return [
                  code(path),
                  count("function"),
                  count("event"),
                  count("error"),
                  summaryOf(docs, path, resolve),
                ];
              }),
            ),
          ],
          "\n\n",
        ),
      ),
    ],
  );
};

/** A page of constants (`InterfaceIds`, `Roles`): one table per group, with each value. */
export const constantsPage = (
  frontmatter: { readonly title: string; readonly description: string },
  intro: string,
  name: string,
  value: unknown,
  docs: ReadonlyMap<string, ExportDoc>,
  resolve: LinkResolver,
): string => {
  const groups = Arr.groupBy(leaves(name, value), ([path]) =>
    Arr.join(Str.split(path, ".").slice(0, 2), "."),
  );
  return page({ ...frontmatter, keywords: [name] }, [
    intro,
    ...Arr.map(Rec.toEntries(groups), ([group, entries]) =>
      Arr.join(
        Arr.filter(
          [
            `## ${code(group)}`,
            summaryOf(docs, group, resolve),
            table(
              ["Constant", "Value"],
              Arr.map(entries, ([path, constant]) => [code(path), code(shown(constant))]),
            ),
          ],
          (block) => block !== "",
        ),
        "\n\n",
      ),
    ),
  ]);
};

/** Addresses per chain and protocol, the capability flags, and the `Deployments` API. */
export const deploymentsPage = (
  deployments: readonly unknown[],
  l2ReverseRegistrars: Readonly<Record<string, unknown>>,
  docs: ReadonlyMap<string, ExportDoc>,
  resolve: LinkResolver,
): string => {
  const profiles = Arr.map(deployments, recordOf);
  const capabilities = docs.get("Deployments.Capabilities")?.members ?? [];

  const chainSections = Arr.map(profiles, (deployment) =>
    Arr.join(
      [
        `## ${shown(deployment["name"])} (chain ${shown(deployment["chainId"])})`,
        ...Arr.flatMap(["v2", "v1"], (protocol) => {
          const profile = recordOf(deployment[protocol]);
          const provenance = recordOf(profile["provenance"]);
          const groups = Arr.filter(
            Rec.toEntries(profile),
            ([key, value]) =>
              key !== "capabilities" && key !== "provenance" && Predicate.isObject(value),
          );
          return [
            `### ${protocol === "v2" ? "ENSv2" : "ENSv1"} (${code(shown(profile["id"]))}, ${shown(profile["status"])})`,
            ...(provenance["repository"] === undefined
              ? []
              : [`From ${shown(provenance["repository"])} ${code(shown(provenance["release"]))}.`]),
            table(
              ["Group", "Contract", "Address"],
              Arr.flatMap(groups, ([group, contracts]) =>
                Arr.map(leaves("", contracts), ([contract, address]) => [
                  code(group),
                  code(contract),
                  code(shown(address)),
                ]),
              ),
            ),
          ];
        }),
      ],
      "\n\n",
    ),
  );

  const flags = table(
    ["Capability", ...Arr.map(profiles, (deployment) => shown(deployment["name"])), "Description"],
    Arr.map(capabilities, (member) => [
      code(member.name),
      ...Arr.map(profiles, (deployment) =>
        code(shown(recordOf(recordOf(deployment["v2"])["capabilities"])[member.name])),
      ),
      prose(member.description, resolve),
    ]),
  );

  const api = Arr.filter(
    [...docs.values()],
    (entry) =>
      Str.startsWith("Deployments.")(entry.path) && entry.path !== "Deployments.Capabilities",
  );

  return page(
    {
      title: "Deployments",
      description:
        "Look up ENS contract addresses per chain, the capability flags of each deployment and the Deployments helpers in @ensforge/contracts.",
      keywords: ["Deployments", "addresses", "mainnet", "sepolia", "Capabilities"],
    },
    [
      "`Deployments` holds the address of every ENS contract per chain, for ENSv1 and ENSv2. ensforge picks the deployment from the client's chain. See [Addresses and chains](/docs/contracts/addresses-and-chains).",
      ...chainSections,
      `## Capabilities\n\nDeployments differ in some behaviours; ensforge reads these flags instead of the chain ID.\n\n${flags}`,
      `## L2 reverse registrars\n\n${table(
        ["Chain ID", "Address"],
        Arr.map(Rec.toEntries(l2ReverseRegistrars), ([chainId, address]) => [
          chainId,
          code(shown(address)),
        ]),
      )}`,
      `## API\n\n${Arr.join(
        Arr.map(api, (entry) => exportSection(entry, resolve)),
        "\n\n",
      )}`,
    ],
  );
};

/** The exports of one import path, by top-level name. */
export type EntryPoint = { readonly subpath: string; readonly names: readonly string[] };

const entryPointsPage = (entryPoints: readonly EntryPoint[]): string =>
  page(
    {
      title: "Entry points",
      description:
        "Look up what each import path of @ensforge/contracts exports, so you can import single constants from a subpath and keep bundles small.",
      keywords: Arr.map(entryPoints, (entry) => entry.subpath),
    },
    [
      "Import the namespaces from `@ensforge/contracts`, or single constants from a subpath to keep bundles small.",
      ...Arr.map(
        entryPoints,
        ({ subpath, names }) =>
          `## ${code(`@ensforge/contracts${Str.slice(1)(subpath)}`)}\n\n${
            Str.includes("/experimental/")(subpath)
              ? "Experimental: can change in a minor release.\n\n"
              : ""
          }${Arr.join(Arr.map(names, code), ", ")}`,
      ),
    ],
  );

/**
 * Every contracts reference page, keyed by its path under `content/docs`, from the built
 * package (`runtime`) and the documented exports of its main entry.
 */
export const contractsReference = (
  runtime: Readonly<Record<string, unknown>>,
  exports: readonly ExportDoc[],
  entryPoints: readonly EntryPoint[],
  resolve: LinkResolver,
): readonly (readonly [string, string])[] => {
  const docs = new Map(Arr.map(exports, (entry) => [entry.path, entry] as const));
  const deployments = recordOf(runtime["Deployments"]);
  const list = deployments["list"];
  const listed: unknown = Predicate.isFunction(list) ? list() : [];
  const guide = "See [Interface IDs and roles](/docs/contracts/interface-ids-and-roles).";

  return [
    [
      "reference/contracts/meta.json",
      meta({
        title: "Contracts",
        icon: "package-contracts",
        pages: ["abis", "deployments", "interface-ids", "roles", "entry-points"],
      }),
    ],
    ["reference/contracts/abis.mdx", abisPage(runtime["Abis"], docs, resolve)],
    [
      "reference/contracts/deployments.mdx",
      deploymentsPage(
        Arr.isArray(listed) ? listed : [],
        recordOf(deployments["l2ReverseRegistrars"]),
        docs,
        resolve,
      ),
    ],
    [
      "reference/contracts/interface-ids.mdx",
      constantsPage(
        {
          title: "Interface IDs",
          description:
            "Look up the ERC-165 interface IDs of ENS registries, resolvers and resolver profiles that ensforge checks before it reads or writes.",
        },
        `\`InterfaceIds\` holds the ERC-165 interface IDs ensforge checks before it reads or writes. ${guide}`,
        "InterfaceIds",
        runtime["InterfaceIds"],
        docs,
        resolve,
      ),
    ],
    [
      "reference/contracts/roles.mdx",
      constantsPage(
        {
          title: "Roles",
          description:
            "Look up the ENSv2 role bitmaps of registries and resolvers, with the admin role that may grant and revoke each one and how to combine them.",
        },
        `\`Roles\` holds the ENSv2 role bitmaps. Each role has an admin role that may grant and revoke it. ${guide}`,
        "Roles",
        runtime["Roles"],
        docs,
        resolve,
      ),
    ],
    ["reference/contracts/entry-points.mdx", entryPointsPage(entryPoints)],
  ];
};
