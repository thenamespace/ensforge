import { Array as Arr, String as Str } from "effect";

import { fieldsTable, optionsTable } from "./actionPages.ts";
import { code, examplesBlock, fence, type LinkResolver, page, prose } from "./mdx.ts";
import type { ExportDoc } from "./model.ts";
import { tagValues, throwsOf } from "./sections.ts";

/** The anchor Fumadocs gives a heading such as `` ### `Name.normalize` ``. */
export const anchorOf = (heading: string): string =>
  Str.replaceAll(
    /\s+/g,
    "-",
  )(Str.replaceAll(/[^a-z0-9 _-]/g, "")(Str.toLowerCase(Str.trim(heading))));

const capitalize = (text: string): string =>
  Str.toUpperCase(Str.slice(0, 1)(text)) + Str.slice(1)(text);

/** One export as an `###` section: stability, summary, signature, members, examples, errors. */
export const exportSection = (entry: ExportDoc, resolve: LinkResolver, level = 3): string => {
  const throws = Arr.map(tagValues(entry.doc, "throws"), (value) => {
    const thrown = throwsOf(value);
    const codes = Arr.join(
      Arr.map(thrown.codes, (errorCode) => `[${code(errorCode)}](/docs/sdk/errors/${errorCode})`),
      ", ",
    );
    return `- ${code(thrown.errorClass)}${codes === "" ? "" : ` (${codes})`} ${prose(thrown.when, resolve)}`;
  });
  return Arr.join(
    Arr.filter(
      [
        `${Str.repeat(level)("#")} ${code(entry.path)}`,
        entry.stability === "stable" ? "" : `**${capitalize(entry.stability)}**`,
        prose(entry.doc.summary, resolve),
        entry.signature === "" ? "" : fence("ts", entry.signature),
        /(Options|Props|Config)$/.test(entry.path)
          ? optionsTable(entry.members, resolve)
          : fieldsTable(entry.members, resolve),
        prose(entry.doc.whenToUse, resolve),
        prose(entry.doc.details, resolve),
        prose(entry.doc.gotchas, resolve),
        examplesBlock(entry.doc.examples),
        throws.length === 0 ? "" : `Errors:\n\n${Arr.join(throws, "\n")}`,
      ],
      (block) => Str.trim(block) !== "",
    ),
    "\n\n",
  );
};

/** A page of export sections grouped under `##` headings. */
export const exportsPage = (
  frontmatter: {
    readonly title: string;
    readonly description: string;
    readonly keywords?: readonly string[];
  },
  intro: string,
  groups: readonly {
    readonly heading: string;
    readonly intro?: string;
    readonly entries: readonly ExportDoc[];
  }[],
  resolve: LinkResolver,
): string =>
  page(
    {
      ...frontmatter,
      keywords:
        frontmatter.keywords ??
        Arr.flatMap(groups, (group) => Arr.map(group.entries, (entry) => entry.path)),
    },
    [
      intro,
      ...Arr.map(
        Arr.filter(groups, (group) => group.entries.length > 0),
        (group) =>
          Arr.join(
            Arr.filter(
              [
                `## ${group.heading}`,
                group.intro ?? "",
                ...Arr.map(valuesFirst(group.entries), (entry) => exportSection(entry, resolve)),
              ],
              (block) => block !== "",
            ),
            "\n\n",
          ),
      ),
    ],
  );

/** Functions and constants before types, each in path order. */
const valuesFirst = (entries: readonly ExportDoc[]): readonly ExportDoc[] => [
  ...Arr.filter(entries, (entry) => entry.kind === "function" || entry.kind === "const"),
  ...Arr.filter(entries, (entry) => entry.kind !== "function" && entry.kind !== "const"),
];
