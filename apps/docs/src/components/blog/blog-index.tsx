import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import { RssIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Container } from "@/components/marketing/section";
import { track } from "@/lib/analytics/client";
import { blogDescription, categoryLabels } from "@/lib/blog/format";
import type { PostSummary } from "@/lib/blog/posts";
import { type BlogCategory, blogCategories } from "@/lib/blog/taxonomy";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

import { FeaturedPost, PostCard } from "./post-card";

/**
 * Page header shared by the blog index and tag pages: a plain title and one line of context on
 * the left, the feed link on the right, closed by the page's hairline.
 */
export function BlogHeader({
  crumb,
  title,
  lede,
}: {
  /** Small trail above the title, for pages below the index. */
  readonly crumb?: ReactNode;
  readonly title: ReactNode;
  readonly lede: ReactNode;
}) {
  return (
    <header className="border-b border-(--ek-line)">
      <Container className="flex flex-col gap-6 pt-14 pb-10 md:flex-row md:items-end md:justify-between md:pt-20 md:pb-12">
        <div className="flex max-w-2xl flex-col gap-3">
          {crumb ? <div className="font-mono text-xs text-fd-muted-foreground">{crumb}</div> : null}
          <h1 className="text-4xl leading-tight font-light tracking-[-0.03em] md:text-5xl">
            {title}
          </h1>
          <p className="text-base leading-relaxed text-pretty text-fd-muted-foreground md:text-lg">
            {lede}
          </p>
        </div>
        <a
          href="/blog/rss.xml"
          title={`${site.name} blog RSS feed`}
          onClick={() => track("blog_rss_clicked", { location: "blog" })}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
        >
          <HugeiconsIcon icon={RssIcon} size={15} strokeWidth={1.8} aria-hidden="true" />
          RSS feed
        </a>
      </Container>
    </header>
  );
}

const chip =
  "inline-flex h-8 items-center gap-2 rounded-full border px-3.5 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-fd-ring";

function Filters({
  active,
  counts,
}: {
  readonly active: BlogCategory | undefined;
  readonly counts: ReadonlyMap<BlogCategory | "all", number>;
}) {
  const options = [
    { value: undefined, label: "All", count: counts.get("all") ?? 0 },
    ...blogCategories.map((category) => ({
      value: category,
      label: categoryLabels[category].many,
      count: counts.get(category) ?? 0,
    })),
  ].filter((option) => option.count > 0 || option.value === active);

  return (
    <nav aria-label="Filter posts" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {options.map((option) => {
          const selected = option.value === active;

          return (
            <li key={option.label}>
              <Link
                to="/blog"
                search={option.value ? { category: option.value } : {}}
                replace
                resetScroll={false}
                title={`${option.label} posts`}
                aria-current={selected ? "page" : undefined}
                onClick={() =>
                  track("blog_filter_changed", {
                    category: option.value ?? "all",
                    previous: active ?? "all",
                  })
                }
                className={cn(
                  chip,
                  selected
                    ? "border-fd-foreground/80 bg-fd-foreground text-fd-background"
                    : "border-(--ek-line-strong) text-fd-muted-foreground hover:border-fd-foreground/30 hover:text-fd-foreground",
                )}
              >
                {option.label}
                <span className={cn("tabular-nums", selected ? "opacity-60" : "opacity-50")}>
                  {option.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Responsive grid of post cards. */
export function PostGrid({
  posts,
  surface = "list",
}: {
  readonly posts: readonly PostSummary[];
  readonly surface?: "list" | "related";
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post, index) => (
        <li
          key={post.slug}
          className="flex animate-ek-rise"
          style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
        >
          <PostCard post={post} surface={surface} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The blog index: the newest featured post wide at the top, then every other post in a grid
 * that the category chips filter. Filtering is a search param, so a filtered view is a link.
 */
export function BlogIndex({
  posts,
  category,
}: {
  readonly posts: readonly PostSummary[];
  readonly category: BlogCategory | undefined;
}) {
  const counts = new Map<BlogCategory | "all", number>([["all", posts.length]]);
  for (const post of posts) counts.set(post.category, (counts.get(post.category) ?? 0) + 1);

  const featured = category ? undefined : posts.find((post) => post.featured);
  const listed = posts.filter(
    (post) => post !== featured && (!category || post.category === category),
  );

  return (
    <>
      <BlogHeader title="Blog" lede={blogDescription} />
      <Container className="flex flex-col gap-10 pt-10 pb-24 md:pt-12">
        {featured ? <FeaturedPost post={featured} /> : null}
        {/* With every post featured above, a list would only repeat it. */}
        {listed.length > 0 || category || posts.length === 0 ? (
          <div className="flex flex-col gap-6">
            <div
              className={cn(
                "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                featured && "border-t border-(--ek-line) pt-8",
              )}
            >
              <h2 className="font-mono text-xs text-fd-muted-foreground">
                <span className="text-ek-accent">{"// "}</span>
                {category ? categoryLabels[category].many : "All posts"}
              </h2>
              <Filters active={category} counts={counts} />
            </div>
            {listed.length > 0 ? (
              <PostGrid posts={listed} />
            ) : (
              <p className="rounded-xl border border-dashed border-(--ek-line-strong) px-6 py-12 text-center text-sm text-fd-muted-foreground">
                {posts.length === 0
                  ? "The first post is on its way."
                  : category
                    ? `No ${categoryLabels[category].many.toLowerCase()} yet.`
                    : ""}
              </p>
            )}
          </div>
        ) : null}
      </Container>
    </>
  );
}
