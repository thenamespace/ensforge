/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import { Array as Arr, Effect, FileSystem, Path, String as Str } from "effect";

/** One `.mdx` page under `apps/docs/content/docs`. */
export type DocsPage = {
  /** Path relative to the content folder, e.g. `sdk/(upgrading)/move-a-name-to-ensv2.mdx`. */
  readonly file: string;
  /** Site URL, with route groups removed: `/docs/sdk/move-a-name-to-ensv2`. */
  readonly url: string;
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly generated: boolean;
  readonly body: string;
};

/** `key: value` lines of a frontmatter block; quoted values are unquoted, the rest kept verbatim. */
export const parseFrontmatter = (
  text: string,
): { frontmatter: Record<string, string>; body: string } => {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (match === null) return { frontmatter: {}, body: text };

  const frontmatter: Record<string, string> = {};
  for (const line of Str.split(match[1] ?? "", "\n")) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair === null) continue;
    const raw = (pair[2] ?? "").trim();
    frontmatter[pair[1] ?? ""] = /^"(?:[^"\\]|\\.)*"$/.test(raw)
      ? raw.slice(1, -1).replace(/\\(.)/g, "$1")
      : /^'.*'$/.test(raw)
        ? raw.slice(1, -1).replaceAll("''", "'")
        : raw;
  }
  return { frontmatter, body: text.slice(match[0].length) };
};

/** The URL Fumadocs serves a page at: `(group)` folders vanish and `index` is its folder. */
export const urlOf = (file: string): string => {
  const segments = Arr.filter(
    Str.split(Str.replace(/\.mdx$/, "")(file), "/"),
    (segment) => !/^\(.*\)$/.test(segment),
  );
  if (segments.at(-1) === "index") segments.pop();
  return Arr.join(["/docs", ...segments], "/");
};

export const readPages = Effect.fn("docs.readPages")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const content = path.join(root, "apps/docs/content/docs");
  const pages: DocsPage[] = [];

  for (const file of yield* fs.readDirectory(content, { recursive: true })) {
    if (!Str.endsWith(".mdx")(file)) continue;
    const text = yield* fs.readFileString(path.join(content, file));
    const { frontmatter, body } = parseFrontmatter(text);
    pages.push({
      file,
      url: urlOf(file),
      frontmatter,
      generated: frontmatter["generated"] === "true",
      body,
    });
  }
  return pages.toSorted((a, b) => a.file.localeCompare(b.file));
});
