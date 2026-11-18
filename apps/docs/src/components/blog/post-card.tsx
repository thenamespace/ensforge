import { Link } from "@tanstack/react-router";

import { track } from "@/lib/analytics/client";
import type { AnalyticsEvents } from "@/lib/analytics/events";
import { categoryLabels, formatShortDate, readingTime } from "@/lib/blog/format";
import type { PostSummary } from "@/lib/blog/posts";
import { cn } from "@/lib/cn";

import { AuthorNames } from "./authors";
import { PostCover } from "./post-cover";

type Surface = AnalyticsEvents["blog_post_clicked"]["surface"];

/** Category in the post's accent, then the date, as a mono eyebrow. */
export function PostEyebrow({
  post,
  className,
}: {
  readonly post: PostSummary;
  readonly className?: string;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-fd-muted-foreground",
        className,
      )}
    >
      <span className="text-ek-accent">{categoryLabels[post.category].one}</span>
      {post.release ? <span className="text-fd-foreground/80">v{post.release.version}</span> : null}
      <span aria-hidden="true" className="text-(--ek-line-strong)">
        /
      </span>
      <time dateTime={post.published}>{formatShortDate(post.published)}</time>
      {post.draft ? (
        <span className="rounded-sm border border-dashed border-ek-accent px-1.5 text-ek-accent">
          draft
        </span>
      ) : null}
    </p>
  );
}

/** A post in a grid: cover, eyebrow, title, summary and byline. The whole card is the link. */
export function PostCard({
  post,
  surface = "list",
}: {
  readonly post: PostSummary;
  readonly surface?: Surface;
}) {
  return (
    <article
      {...(post.package ? { "data-accent": post.package } : {})}
      className="ek-blog-card group relative flex flex-col overflow-hidden rounded-xl border border-(--ek-line) bg-fd-background transition-colors hover:border-(--ek-line-strong)"
    >
      <PostCover post={post} className="border-b border-(--ek-line)" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <PostEyebrow post={post} />
        <h3 className="text-lg leading-snug font-medium tracking-[-0.01em] text-balance">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            title={post.title}
            onClick={() => track("blog_post_clicked", { slug: post.slug, surface })}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {post.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-fd-muted-foreground">
          {post.description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-fd-muted-foreground">
          <AuthorNames authors={post.authors} />
          <span className="shrink-0 font-mono">{readingTime(post.readingMinutes)}</span>
        </div>
      </div>
      {/* Focus ring for the stretched link, drawn on the card. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl ring-fd-ring group-has-[:focus-visible]:ring-2"
      />
    </article>
  );
}

/** The newest featured post, wide: cover on the left, text on the right. */
export function FeaturedPost({ post }: { readonly post: PostSummary }) {
  return (
    <article
      {...(post.package ? { "data-accent": post.package } : {})}
      className="ek-blog-card group relative grid overflow-hidden rounded-2xl border border-(--ek-line) bg-fd-background transition-colors hover:border-(--ek-line-strong) lg:grid-cols-[1.35fr_1fr]"
    >
      <PostCover
        post={post}
        priority
        sizes="(min-width: 1024px) 720px, 100vw"
        className="border-b border-(--ek-line) lg:border-r lg:border-b-0"
      />
      <div className="flex flex-col gap-4 p-6 md:p-8 lg:justify-center">
        <p className="flex items-center gap-2 font-mono text-xs text-fd-muted-foreground">
          <span className="size-1.5 rounded-full bg-ek-accent" />
          Featured
        </p>
        <PostEyebrow post={post} />
        <h2 className="text-[28px] leading-[1.1] font-light tracking-[-0.03em] text-balance md:text-4xl">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            title={post.title}
            onClick={() => track("blog_post_clicked", { slug: post.slug, surface: "featured" })}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {post.title}
          </Link>
        </h2>
        <p className="text-[15px] leading-relaxed text-fd-muted-foreground md:text-base">
          {post.description}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-fd-muted-foreground">
          <AuthorNames authors={post.authors} />
          <span className="shrink-0 font-mono">{readingTime(post.readingMinutes)}</span>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl ring-fd-ring group-has-[:focus-visible]:ring-2"
      />
    </article>
  );
}
