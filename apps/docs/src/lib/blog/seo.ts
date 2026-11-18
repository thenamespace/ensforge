import { absolute, site } from "@/lib/site";

import { blogDescription, isoDate } from "./format";
import type { PostImage, PostSummary } from "./posts";

/*
 * JSON-LD for the blog. The organisation and website nodes come from `seo.ts` by `@id`, so a
 * post names its publisher without repeating it.
 */

const ids = {
  organization: `${site.url}/#organization`,
  website: `${site.url}/#website`,
  blog: `${site.url}/blog#blog`,
};

const person = (author: PostSummary["authors"][number]) => ({
  "@type": "Person",
  name: author.name,
  url: author.url,
  ...(author.avatar ? { image: author.avatar } : {}),
  ...(author.x ? { sameAs: [`https://x.com/${author.x}`] } : {}),
});

export function blogPostingLd(post: PostSummary, image: PostImage, keywords: readonly string[]) {
  const url = absolute(post.url);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    image: { "@type": "ImageObject", url: image.url, width: image.width, height: image.height },
    datePublished: isoDate(post.published),
    dateModified: isoDate(post.updated ?? post.published),
    author: post.authors.map(person),
    publisher: { "@id": ids.organization },
    isPartOf: { "@id": ids.blog },
    articleSection: post.category,
    keywords: keywords.join(", "),
    inLanguage: "en",
    timeRequired: `PT${post.readingMinutes}M`,
  };
}

export function blogLd(posts: readonly PostSummary[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": ids.blog,
    name: `${site.name} blog`,
    url: absolute("/blog"),
    description: blogDescription,
    inLanguage: "en",
    publisher: { "@id": ids.organization },
    isPartOf: { "@id": ids.website },
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      "@id": `${absolute(post.url)}#article`,
      headline: post.title,
      url: absolute(post.url),
      datePublished: isoDate(post.published),
    })),
  };
}
