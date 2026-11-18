/**
 * Site-wide identity used by SEO tags, JSON-LD, OG images and the sitemap. Set `VITE_SITE_URL`
 * to override the origin, for example on preview deployments.
 */
export const site = {
  name: "ensforge",
  url: (import.meta.env.VITE_SITE_URL ?? "https://ensforge.com").replace(/\/$/, ""),
  tagline: "Effect-native ENS packages",
  description:
    "Type-safe, Effect-native packages for Ethereum Name Service applications, across ENSv1 and ENSv2. Placeholder description: the site copy is not written yet.",
  /** X handle with the `@`, for `twitter:site` and share text. Unset until the project has one. */
  twitter: undefined as string | undefined,
  github: "https://github.com/thenamespace/ensforge",
  npm: "https://www.npmjs.com/org/ensforge",
  locale: "en_US",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  themeColor: "#09090b",
} as const;

/** Absolute URL for a path on this site. */
export const absolute = (path: string) => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
