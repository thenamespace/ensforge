import { absolute, site } from "./site";

export interface SeoImage {
  readonly url: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface SeoInput {
  /** Page title without the site name. Omit on the home page. */
  readonly title?: string;
  readonly description: string;
  /** Path on this site, e.g. `/blog`. Used for the canonical URL and `og:url`. */
  readonly path: string;
  readonly image: SeoImage;
  readonly type?: "website" | "article";
  readonly keywords?: readonly string[];
  /** ISO dates, for articles. */
  readonly publishedTime?: string;
  readonly modifiedTime?: string;
  /** Article section, e.g. the package a docs page belongs to. */
  readonly section?: string;
  readonly jsonLd?: readonly Record<string, unknown>[];
  readonly noindex?: boolean;
  /** Author profile URLs; the first is `article:author`. Defaults to the publisher. */
  readonly authors?: readonly string[];
  /** X handle with the `@` for `twitter:creator`; defaults to the site's. */
  readonly twitterCreator?: string;
  /** Absolute canonical URL, for pages first published elsewhere. */
  readonly canonical?: string;
}

export const SEPARATOR = " | ";

const imageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

/** Generated images are PNGs; CDN overrides can be any web format. */
const imageType = (url: string) =>
  imageTypes[url.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";

export function pageTitle(title?: string) {
  return title ? `${title}${SEPARATOR}${site.name}` : `${site.name}${SEPARATOR}${site.tagline}`;
}

/** `<Page title> | ensforge Docs`, whether the caller passed `Page | SDK Docs` or the bare title. */
function docsTitle(title?: string) {
  return title ? `${title.split(SEPARATOR)[0]}${SEPARATOR}${site.name} Docs` : `${site.name} Docs`;
}

/**
 * Head tags for a page: title, description, canonical, Open Graph, Twitter and JSON-LD.
 * Returns the `{ meta, links, scripts }` shape TanStack Router's `head` expects. The root route sets the
 * site-wide tags (author, publisher, icons, default keywords) that every page shares.
 *
 * TanStack keeps one tag per `name` or `property` (the deepest route's), so a property such as
 * `article:tag` cannot repeat.
 */
export function seo(input: SeoInput) {
  const isDocs = input.path === "/docs" || input.path.startsWith("/docs/");
  const title = isDocs ? docsTitle(input.title) : pageTitle(input.title);
  const url = absolute(input.path);
  const canonical = input.canonical ?? url;
  const type = input.type ?? "website";
  const width = String(input.image.width ?? 1200);
  const height = String(input.image.height ?? 630);

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: input.description },
    {
      name: "robots",
      content: input.noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },
    { property: "og:type", content: type },
    { property: "og:site_name", content: site.name },
    { property: "og:locale", content: site.locale },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:image", content: input.image.url },
    { property: "og:image:secure_url", content: input.image.url },
    { property: "og:image:type", content: imageType(input.image.url) },
    { property: "og:image:width", content: width },
    { property: "og:image:height", content: height },
    { property: "og:image:alt", content: input.image.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: input.image.url },
    { name: "twitter:image:alt", content: input.image.alt },
  ];

  const twitterSite = site.twitter ?? site.publisherTwitter;
  const twitterCreator = input.twitterCreator ?? twitterSite;
  meta.push({ name: "twitter:site", content: twitterSite });
  if (twitterCreator) meta.push({ name: "twitter:creator", content: twitterCreator });

  if (input.keywords?.length) meta.push({ name: "keywords", content: input.keywords.join(", ") });

  if (type === "article") {
    if (input.publishedTime)
      meta.push({ property: "article:published_time", content: input.publishedTime });

    if (input.modifiedTime) {
      meta.push({ property: "article:modified_time", content: input.modifiedTime });
      meta.push({ property: "og:updated_time", content: input.modifiedTime });
    }

    if (input.section) meta.push({ property: "article:section", content: input.section });

    meta.push({ property: "article:author", content: input.authors?.[0] ?? site.publisherUrl });
  }

  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
    scripts: (input.jsonLd ?? []).map((data) => ({
      type: "application/ld+json",
      children: jsonForScript(data),
    })),
  };
}

/**
 * JSON safe inside an inline `<script>`: escaping `<`, `>` and `&` stops page data from closing
 * the tag, and U+2028/U+2029 are line breaks in older JavaScript parsers. The result still parses
 * as the same JSON.
 */
function jsonForScript(data: unknown) {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/* ------------------------------------------------------------------ JSON-LD */

const ids = {
  organization: `${site.url}/#organization`,
  website: `${site.url}/#website`,
  software: `${site.url}/#software`,
};

/**
 * The publisher and the website as other nodes reference them. Each carries its type, name and
 * URL, so a page that does not include the full node still resolves the reference.
 */
export const organizationRef = {
  "@type": "Organization",
  "@id": ids.organization,
  name: site.publisher,
  url: site.publisherUrl,
};

export const websiteRef = {
  "@type": "WebSite",
  "@id": ids.website,
  name: site.name,
  url: absolute("/"),
};

export const organizationLd = {
  "@context": "https://schema.org",
  ...organizationRef,
  legalName: site.publisher,
  description: site.publisherDescription,
  logo: { "@type": "ImageObject", url: absolute("/icon-512.png"), width: 512, height: 512 },
  sameAs: [site.publisherGithub, `https://x.com/${site.publisherTwitter.slice(1)}`],
};

export const websiteLd = {
  "@context": "https://schema.org",
  ...websiteRef,
  alternateName: site.tagline,
  description: site.description,
  inLanguage: "en",
  publisher: organizationRef,
};

/** ensforge itself, as software: what search engines show for libraries. */
export const softwareLd = {
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "SoftwareSourceCode"],
  "@id": ids.software,
  name: site.name,
  description: site.description,
  url: absolute("/"),
  image: absolute("/icon-512.png"),
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cross-platform",
  runtimePlatform: "Node.js",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  codeRepository: site.github,
  programmingLanguage: { "@type": "ComputerLanguage", name: "TypeScript" },
  license: site.license,
  keywords: site.keywords.join(", "),
  author: organizationRef,
  publisher: organizationRef,
  sameAs: [
    site.github,
    site.npm,
    ...(site.twitter ? [`https://x.com/${site.twitter.slice(1)}`] : []),
  ],
};

/** Each item but the last needs a `path`; Google rejects a trail with unlinked middle items. */
export function breadcrumbLd(items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

export function webPageLd(input: {
  name: string;
  description: string;
  path: string;
  image: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absolute(input.path)}#webpage`,
    url: absolute(input.path),
    name: input.name,
    description: input.description,
    inLanguage: "en",
    isPartOf: websiteRef,
    publisher: organizationRef,
    primaryImageOfPage: { "@type": "ImageObject", url: input.image, width: 1200, height: 630 },
  };
}

export function techArticleLd(input: {
  title: string;
  description: string;
  path: string;
  image: string;
  section: string;
  modifiedTime?: string;
  publishedTime?: string;
  keywords?: readonly string[];
  /** What the page documents, e.g. the package a reference page belongs to. */
  about?: Record<string, unknown>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${absolute(input.path)}#article`,
    headline: input.title,
    description: input.description,
    url: absolute(input.path),
    mainEntityOfPage: absolute(input.path),
    image: { "@type": "ImageObject", url: input.image, width: 1200, height: 630 },
    articleSection: input.section,
    inLanguage: "en",
    ...(input.publishedTime ? { datePublished: input.publishedTime } : {}),
    ...(input.modifiedTime ? { dateModified: input.modifiedTime } : {}),
    ...(input.keywords?.length ? { keywords: input.keywords.join(", ") } : {}),
    ...(input.about ? { about: input.about } : {}),
    author: organizationRef,
    publisher: organizationRef,
    isPartOf: websiteRef,
  };
}
