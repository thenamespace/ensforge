/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import type { DocsPage } from "./content.ts";

export const descriptionRange = { min: 120, max: 160 } as const;

/** Page descriptions plus titles stay under this, a proxy for the `llms.txt` budget. */
export const llmsBudget = 50_000;

/** Fumadocs' (github-slugger) anchor for a heading's text; `seen` numbers repeated headings. */
export const slugOf = (heading: string, seen: Map<string, number>): string => {
  const base = heading
    .replace(/\s*\{#[^}]+\}\s*$/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/ /g, "-");
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
};

/** Body lines outside fenced code, with their 1-based line numbers. */
const proseLines = (body: string): { text: string; line: number }[] => {
  let fenced = false;
  const lines: { text: string; line: number }[] = [];
  for (const [index, text] of body.split("\n").entries()) {
    if (/^\s*```/.test(text)) fenced = !fenced;
    else if (!fenced) lines.push({ text, line: index + 1 });
  }
  return lines;
};

/** Anchors a page offers: its headings, plus explicit `{#id}` headings and `id="…"` attributes. */
export const anchorsOf = (page: DocsPage): Set<string> => {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const { text: line } of proseLines(page.body)) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading !== null)
      anchors.add(explicitId(heading[1] ?? "") ?? slugOf(heading[1] ?? "", seen));
    for (const id of line.matchAll(/\bid="([^"]+)"/g)) anchors.add(id[1] ?? "");
  }
  return anchors;
};

const explicitId = (heading: string): string | undefined => /\{#([^}]+)\}\s*$/.exec(heading)?.[1];

/** `/docs/...` targets of Markdown links and `href`s in prose, with the line they appear on. */
export const linksOf = (page: DocsPage): { target: string; line: number }[] =>
  proseLines(page.body).flatMap(({ text, line }) =>
    [...text.matchAll(/\]\((\/docs[^)\s]*)[^)]*\)|href="(\/docs[^"]*)"/g)].map((match) => ({
      target: match[1] ?? match[2] ?? "",
      line,
    })),
  );

export type DocsProblems = {
  readonly descriptions: string[];
  readonly links: string[];
  readonly budget: { readonly characters: number; readonly problems: string[] };
};

export const lintPages = (pages: readonly DocsPage[]): DocsProblems => {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const anchors = new Map<string, Set<string>>();
  const descriptions: string[] = [];
  const links: string[] = [];
  let characters = 0;

  for (const page of pages) {
    const description = page.frontmatter["description"];
    const title = page.frontmatter["title"] ?? "";
    characters += (description?.length ?? 0) + title.length;

    if (description === undefined || description === "")
      descriptions.push(`${page.file}: no description`);
    else if (description.length < descriptionRange.min || description.length > descriptionRange.max)
      descriptions.push(
        `${page.file}: description is ${description.length} characters, want ${descriptionRange.min}-${descriptionRange.max}`,
      );

    for (const { target, line } of linksOf(page)) {
      const [pathname = "", anchor] = target.split("#");
      const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
      const destination = byUrl.get(normalized);
      if (destination === undefined) {
        links.push(`${page.file}:${line}: ${target} does not match a page`);
        continue;
      }
      if (anchor === undefined || anchor === "") continue;
      const available = anchors.get(destination.url) ?? anchorsOf(destination);
      anchors.set(destination.url, available);
      if (!available.has(anchor))
        links.push(`${page.file}:${line}: ${target} has no heading "${anchor}"`);
    }
  }

  return {
    descriptions,
    links,
    budget: {
      characters,
      problems:
        characters > llmsBudget
          ? [`descriptions and titles total ${characters} characters, over ${llmsBudget}`]
          : [],
    },
  };
};
