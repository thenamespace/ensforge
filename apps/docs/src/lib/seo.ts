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
  /** Author profile URLs for `article:author`; defaults to the organisation. */
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

/**
 * Head tags for a page: title, description, canonical, Open Graph, Twitter and JSON-LD.
 * Returns the `{ meta, links, scripts }` shape TanStack Router's `head` expects.
 */
export function seo(input: SeoInput) {
  const title = pageTitle(input.title);
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

  const twitterCreator = input.twitterCreator ?? site.twitter;
  if (site.twitter) meta.push({ name: "twitter:site", content: site.twitter });
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

    for (const author of input.authors ?? [site.github])
      meta.push({ property: "article:author", content: author });
    for (const tag of input.keywords ?? []) meta.push({ property: "article:tag", content: tag });
  }

  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
    scripts: (input.jsonLd ?? []).map((data) => ({
      type: "application/ld+json",
      children: JSON.stringify(data),
    })),
  };
}

/* ------------------------------------------------------------------ JSON-LD */

const ids = {
  organization: `${site.url}/#organization`,
  website: `${site.url}/#website`,
};

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ids.organization,
  name: site.name,
  url: site.url,
  logo: { "@type": "ImageObject", url: absolute("/logo.svg") },
  sameAs: [
    site.github,
    site.npm,
    ...(site.twitter ? [`https://x.com/${site.twitter.slice(1)}`] : []),
  ],
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": ids.website,
  name: site.name,
  alternateName: site.tagline,
  url: site.url,
  description: site.description,
  inLanguage: "en",
  publisher: { "@id": ids.organization },
};

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
    isPartOf: { "@id": ids.website },
    publisher: { "@id": ids.organization },
    primaryImageOfPage: { "@type": "ImageObject", url: input.image, width: 1200, height: 630 },
  };
}

/** A package as software: what search engines show for libraries. */
export function packageLd(input: {
  name: string;
  npm: string;
  description: string;
  path: string;
  repository: string;
  image: string;
  keywords: readonly string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareSourceCode", "SoftwareApplication"],
    "@id": `${absolute(input.path)}#software`,
    name: input.name,
    alternateName: input.npm,
    description: input.description,
    url: absolute(input.path),
    image: input.image,
    codeRepository: input.repository,
    programmingLanguage: { "@type": "ComputerLanguage", name: "TypeScript" },
    runtimePlatform: "Node.js",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    license: site.license,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    keywords: input.keywords.join(", "),
    author: { "@id": ids.organization },
    publisher: { "@id": ids.organization },
    sameAs: [input.repository, `https://www.npmjs.com/package/${input.npm}`],
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
    proficiencyLevel: "Beginner",
    ...(input.publishedTime ? { datePublished: input.publishedTime } : {}),
    ...(input.modifiedTime ? { dateModified: input.modifiedTime } : {}),
    ...(input.keywords?.length ? { keywords: input.keywords.join(", ") } : {}),
    author: { "@id": ids.organization },
    publisher: { "@id": ids.organization },
    isPartOf: { "@id": ids.website },
  };
}
