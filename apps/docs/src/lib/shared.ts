export const appName = "ensforge";
export const docsRoute = "/docs";

export const gitConfig = {
  user: "thenamespace",
  repo: "ensforge",
  branch: "main",
} as const;

/** Markdown version of a docs page: `/docs/sdk` is served as `/docs/sdk.md`. */
export function getPageMarkdownUrl(page: { slugs: readonly string[] }) {
  const segments = page.slugs.length > 0 ? [...page.slugs] : ["index"];

  return `${docsRoute}/${segments.join("/")}.md`;
}
