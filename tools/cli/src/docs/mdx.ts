import { Array as Arr, Formatter, String as Str } from "effect";

/** `getAddress` → `get-address`, `primaryName` → `primary-name`: the URL segment of a name. */
export const kebab = (name: string): string =>
  Str.toLowerCase(Str.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")(name));

/** Resolves a `{@link Target}` to a docs URL, or `undefined` to print it as code only. */
export type LinkResolver = (target: string) => string | undefined;

const linkPattern = /\{@link\s+([^}|\s]+)\s*(?:\|\s*([^}]+))?\}/g;

// An error code in a code span (`` `NOT_OWNER` ``) links to its page when the resolver knows it.
const linkCode = (segment: string, resolve: LinkResolver): string => {
  const name = /^`([A-Z][A-Z0-9_]+)`$/.exec(segment)?.[1];
  const url = name === undefined ? undefined : resolve(name);
  return url === undefined ? segment : `[${segment}](${url})`;
};

/**
 * Escapes what MDX would read as JSX or expressions (`<`, `>`, `{`, `}`) outside code spans and
 * fenced blocks, and turns `{@link Target}` / `{@link Target | text}` into links.
 */
export const prose = (text: string, resolve: LinkResolver = () => undefined): string => {
  // oxlint-disable-next-line effecttsgo/prefer-effect-string -- effect/String.replace takes no replacer callback
  const linked = text.replace(
    linkPattern,
    (_match: string, target: string, label: string | undefined) => {
      const shown =
        label === undefined ? `\`${Str.replace(/^Actions\./, "")(target)}\`` : Str.trim(label);
      const url = resolve(target);
      return url === undefined ? shown : `[${shown}](${url})`;
    },
  );

  const out: string[] = [];
  let fenced = false;
  for (const line of Str.split(linked, "\n")) {
    if (Str.startsWith("```")(Str.trim(line))) {
      fenced = !fenced;
      out.push(line);
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    // Odd segments of a split on backtick runs are code spans; links' URLs need no escaping.
    const segments = Str.split(line, /(`+[^`]*`+)/);
    out.push(
      Arr.join(
        Arr.map(segments, (segment) =>
          Str.startsWith("`")(segment)
            ? linkCode(segment, resolve)
            : Str.replaceAll(/(?<!\\)([<>{}])/g, "\\$1")(segment),
        ),
        "",
      ),
    );
  }
  return Arr.join(out, "\n");
};

/** Inline code for any text, using a longer fence when it contains backticks. */
export const code = (text: string): string => {
  const flat = Str.trim(Str.replaceAll(/\s+/g, " ")(text));
  return Str.includes("`")(flat) ? `\`\` ${flat} \`\`` : `\`${flat}\``;
};

/** One table cell: a single line, with `|` escaped (also inside code spans, as GFM requires). */
const cell = (text: string): string =>
  Str.replaceAll("|", "\\|")(Str.trim(Str.replaceAll(/\s*\n\s*/g, " ")(text)));

/** A Markdown table; an empty string when there are no rows. */
export const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
  rows.length === 0
    ? ""
    : Arr.join(
        [
          `| ${Arr.join(headers, " | ")} |`,
          `| ${Arr.join(
            Arr.map(headers, () => "---"),
            " | ",
          )} |`,
          ...Arr.map(rows, (row) => `| ${Arr.join(Arr.map(row, cell), " | ")} |`),
        ],
        "\n",
      );

/** A fenced block with an optional title. */
export const fence = (language: string, body: string, title?: string): string =>
  `\`\`\`${language}${title === undefined ? "" : ` title=${Formatter.formatJson(title)}`}\n${body}\n\`\`\``;

/** Examples as plain titled blocks (they are type-checked by `ensforge-dev examples`). */
export const examplesBlock = (
  examples: readonly { readonly title: string; readonly language: string; readonly code: string }[],
): string =>
  Arr.join(
    Arr.map(examples, (example) => fence(example.language, example.code, example.title)),
    "\n\n",
  );

/** `<Tabs>` with a shared `groupId`; tabs without content are left out. */
export const tabs = (
  groupId: string,
  entries: readonly { readonly label: string; readonly body: string }[],
): string => {
  const present = Arr.filter(entries, (entry) => entry.body !== "");
  if (present.length === 0) return "";
  return Arr.join(
    [
      `<Tabs groupId="${groupId}" items={${Formatter.formatJson(Arr.map(present, (entry) => entry.label))}} persist>`,
      ...Arr.map(present, (entry) => `<Tab>\n\n${entry.body}\n\n</Tab>`),
      "</Tabs>",
    ],
    "\n\n",
  );
};

/** A titled `<Callout>`. */
export const callout = (type: "info" | "warn", title: string, body: string): string =>
  `<Callout type="${type}" title="${title}">\n\n${body}\n\n</Callout>`;

/** Frontmatter and the generated-file notice every generated page starts with. */
export const page = (
  frontmatter: {
    readonly title: string;
    readonly description: string;
    readonly keywords?: readonly string[] | undefined;
  },
  body: readonly string[],
): string => {
  const yaml = [
    "---",
    `title: ${Formatter.formatJson(frontmatter.title)}`,
    `description: ${Formatter.formatJson(frontmatter.description)}`,
    ...(frontmatter.keywords === undefined || frontmatter.keywords.length === 0
      ? []
      : [`keywords: ${Formatter.formatJson(frontmatter.keywords.slice(0, 20))}`]),
    "generated: true",
    "---",
  ];
  return `${Arr.join(
    [
      Arr.join(yaml, "\n"),
      "{/* Generated by ensforge-dev docs generate; edit the JSDoc instead. */}",
      ...Arr.filter(body, (block) => Str.trim(block) !== ""),
    ],
    "\n\n",
  )}\n`;
};

/** A `meta.json` for a folder of pages. */
export const meta = (entry: {
  readonly title: string;
  readonly pages: readonly string[];
  readonly description?: string;
  readonly defaultOpen?: boolean;
  /** Makes the folder a sidebar of its own; a string groups it apart from `root: true` folders. */
  readonly root?: boolean | string;
  readonly icon?: string;
  /** A page of the folder that serves as its index instead of `index.mdx`. */
  readonly pagesIndex?: string;
}): string => `${Formatter.formatJson(entry, { space: 2 })}\n`;

/** The first sentence of a summary, as a one-line description. */
export const firstSentence = (text: string): string => {
  const flat = Str.trim(Str.replaceAll(/\s+/g, " ")(text));
  const end = /\.(\s|$)/.exec(flat);
  return end === null ? flat : Str.slice(0, end.index + 1)(flat);
};

/** Plain text for frontmatter: code spans and links reduced to their text. */
export const plain = (text: string): string => {
  const unlinked = Str.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")(Str.replaceAll("`", "")(text));
  // oxlint-disable-next-line effecttsgo/prefer-effect-string -- effect/String.replace takes no replacer callback
  return unlinked.replace(
    linkPattern,
    (_match: string, target: string, label: string | undefined) =>
      label === undefined ? Str.replace(/^Actions\./, "")(target) : Str.trim(label),
  );
};

/** A `source` attribute: a repository path, with `#L<line>` for a declaration. */
export const sourceAttribute = (source: { readonly file: string; readonly line: number }): string =>
  `${source.file}#L${source.line}`;

/**
 * The meta strip under a reference page's title (`<ApiMeta>` on the docs site): kind and
 * stability badges, a count summary, the version it appeared in and a link to its source.
 */
export const apiMeta = (props: {
  readonly kind?: string;
  readonly batchable?: boolean;
  readonly stability?: string;
  readonly summary?: string;
  readonly since?: string;
  readonly source?: string;
}): string =>
  `<ApiMeta${Arr.join(
    Arr.map(
      Arr.filter(
        [
          ["kind", props.kind],
          ["stability", props.stability],
          ["summary", props.summary],
          ["since", props.since],
          ["source", props.source],
        ] satisfies readonly (readonly [string, string | undefined])[],
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
      ([name, value]) => ` ${name}={${Formatter.formatJson(value)}}`,
    ),
    "",
  )}${props.batchable === true ? " batchable" : ""} />`;
