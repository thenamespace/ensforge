import { organizationRef, websiteRef } from "@/lib/seo";
import { absolute, site } from "@/lib/site";

import { blogDescription, isoDate } from "./format";
import type { PostImage, PostSummary } from "./posts";

/* JSON-LD for the blog. The publisher and website references come from `seo.ts`. */

const blogRef = {
  "@type": "Blog",
  "@id": `${site.url}/blog#blog`,
  name: `${site.name} blog`,
  url: absolute("/blog"),
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
    publisher: organizationRef,
    isPartOf: blogRef,
    articleSection: post.category,
    keywords: keywords.join(", "),
    inLanguage: "en",
    timeRequired: `PT${post.readingMinutes}M`,
  };
}

export function blogLd(posts: readonly PostSummary[]) {
  return {
    "@context": "https://schema.org",
    ...blogRef,
    description: blogDescription,
    inLanguage: "en",
    publisher: organizationRef,
    isPartOf: websiteRef,
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      "@id": `${absolute(post.url)}#article`,
      headline: post.title,
      url: absolute(post.url),
      datePublished: isoDate(post.published),
    })),
  };
}
