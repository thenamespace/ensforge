import { createServerFn } from "@tanstack/react-start";

import type { Highlighter } from "shiki";

import { snippets, type SnippetId } from "@/content/snippets";

export type HighlightedSnippets = Partial<Record<SnippetId, string>>;

let highlighter: Promise<Highlighter> | undefined;

/** One shared Shiki instance per server; loaded lazily so it stays out of the client bundle. */
export function getHighlighter() {
  highlighter ??= Promise.all([import("shiki"), import("@/themes/code")]).then(
    ([{ createHighlighter }, { ensforgeDark, ensforgeLight }]) =>
      createHighlighter({
        themes: [ensforgeDark, ensforgeLight],
        langs: ["ts", "tsx", "bash"],
      }),
  );

  return highlighter;
}

/**
 * Highlights snippets on the server with the site's code themes, so pages ship plain HTML
 * and no highlighter runs in the browser. Lines carry `data-line` for step highlighting.
 */
export const highlightSnippets = createServerFn({ method: "GET" })
  .validator((ids: readonly SnippetId[]) => ids)
  .handler(async ({ data: ids }) => {
    const shiki = await getHighlighter();
    const result: HighlightedSnippets = {};

    for (const id of ids) {
      const snippet = snippets[id];
      result[id] = shiki.codeToHtml(snippet.code, {
        lang: snippet.lang,
        themes: { light: "ensforge-light", dark: "ensforge-dark" },
        defaultColor: false,
        transformers: [
          {
            line(node, line) {
              node.properties["data-line"] = line;
            },
          },
        ],
      });
    }

    return result;
  });
