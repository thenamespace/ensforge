import type { BlogCategory, BlogTag } from "./schema";

/** One line on what the blog is, for its header, feed, Markdown and JSON-LD. */
export const blogDescription = "Release notes, guides and engineering notes from ensforge.";

/** Display names, singular for a post's label and plural for the filters. */
export const categoryLabels: Record<BlogCategory, { one: string; many: string }> = {
  announcement: { one: "Announcement", many: "Announcements" },
  release: { one: "Release", many: "Releases" },
  guide: { one: "Guide", many: "Guides" },
  engineering: { one: "Engineering", many: "Engineering" },
};

export const tagLabels: Record<BlogTag, string> = {
  release: "Releases",
  sdk: "SDK",
  contracts: "Contracts",
  react: "React",
  hca: "HCA",
  ens: "ENS",
  effect: "Effect",
  guide: "Guides",
  engineering: "Engineering",
  community: "Community",
};

const longDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Frontmatter dates are calendar dates; read them as UTC so no time zone shifts the day. */
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

export const formatDate = (value: string) => longDate.format(asDate(value));
export const formatShortDate = (value: string) => shortDate.format(asDate(value));
export const isoDate = (value: string) => asDate(value).toISOString();

export const readingTime = (minutes: number) => `${minutes} min read`;
