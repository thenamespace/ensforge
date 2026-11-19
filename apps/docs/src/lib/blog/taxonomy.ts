// Kept apart from the zod schema: route options and components import these, and zod would
// otherwise load on every page.

/** A closed list, so tag pages stay meaningful. Add a tag here before using it in a post. */
export const blogTags = [
  "release",
  "sdk",
  "contracts",
  "react",
  "hca",
  "ens",
  "effect",
  "guide",
  "engineering",
  "community",
] as const;

export const blogCategories = ["announcement", "release", "guide", "engineering"] as const;

export const blogPackages = ["sdk", "contracts", "react", "hca"] as const;

export type BlogTag = (typeof blogTags)[number];

export const isBlogTag = (tag: string): tag is BlogTag =>
  (blogTags as readonly string[]).includes(tag);
export type BlogCategory = (typeof blogCategories)[number];
export type BlogPackage = (typeof blogPackages)[number];
