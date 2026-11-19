import { createServerFn } from "@tanstack/react-start";

import type { KeyedTokensInfo } from "@shikijs/magic-move/types";

import { snippets, type SnippetId } from "@/content/snippets";

import { getHighlighter } from "./highlight";

export type KeyedSnippets = Partial<Record<SnippetId, KeyedTokensInfo>>;

/**
 * Tokenizes snippets for Shiki Magic Move on the server (dual themes, colours as CSS
 * variables), so code can animate between steps without a highlighter in the browser.
 */
export const keyedSnippets = createServerFn({ method: "GET" })
  .validator((ids: readonly SnippetId[]) => ids)
  .handler(async ({ data: ids }) => {
    const [shiki, { codeToKeyedTokens }] = await Promise.all([
      getHighlighter(),
      import("@shikijs/magic-move/core"),
    ]);
    const result: KeyedSnippets = {};

    for (const id of ids) {
      const snippet = snippets[id];
      result[id] = codeToKeyedTokens(shiki, snippet.code, {
        lang: snippet.lang,
        themes: { light: "ensforge-light", dark: "ensforge-dark" },
        defaultColor: false,
      });
    }

    return result;
  });
