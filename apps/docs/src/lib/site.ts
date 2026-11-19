/**
 * Site-wide identity used by SEO tags, JSON-LD, OG images and the sitemap. Set `VITE_SITE_URL`
 * to override the origin, for example on preview deployments.
 */
export const site = {
  name: "ensforge",
  url: (import.meta.env.VITE_SITE_URL ?? "https://ensforge.com").replace(/\/$/, ""),
  /** Legal publisher and author of the site and the packages. */
  publisher: "Namespace Inc.",
  publisherUrl: "https://namespace.ninja",
  publisherGithub: "https://github.com/thenamespace",
  /** The publisher's X handle with the `@`: `twitter:site` while ensforge has none of its own. */
  publisherTwitter: "@namespace_eth",
  publisherDescription: "Namespace Inc. is an official ENS Service Provider.",
  tagline: "The toolkit for building on ENS",
  description:
    "Look up any ENS name, read and write records, and register and manage names with one typed TypeScript API that works for every name. Built on viem.",
  /** Default `keywords`, for pages that set none of their own. */
  keywords: [
    "ENS",
    "ENS SDK",
    "Ethereum Name Service",
    "ENSv2",
    "viem",
    "TypeScript",
    "React hooks",
    "open source",
  ],
  /** X handle with the `@`, for `twitter:site` and share text. Unset until the project has one. */
  twitter: undefined as string | undefined,
  github: "https://github.com/thenamespace/ensforge",
  npm: "https://www.npmjs.com/org/ensforge",
  /**
   * Set to `true` with the first post: shows the blog links and serves the blog routes. Also add
   * `/blog.md` and `/blog/rss.xml` back to the prerender `pages` in `vite.config.ts`.
   */
  blogEnabled: false as boolean,
  locale: "en_US",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  themeColor: "#09090b",
} as const;

/** Absolute URL for a path on this site. */
export const absolute = (path: string) => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
