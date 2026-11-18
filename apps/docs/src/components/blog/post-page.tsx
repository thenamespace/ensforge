import { Suspense, use, useRef } from "react";

import { Link } from "@tanstack/react-router";

import { ArrowLeft01Icon, ArrowRight01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DocsBody } from "fumadocs-ui/layouts/spacious/page";

import { Container } from "@/components/marketing/section";
import { useMDXComponents } from "@/components/mdx";
import { track } from "@/lib/analytics/client";
import { categoryLabels, formatDate, readingTime, tagLabels } from "@/lib/blog/format";
import type { BlogPostData } from "@/lib/blog/loaders";
import type { PostSummary } from "@/lib/blog/posts";
import { getPackage } from "@/lib/packages";
import { blog } from "@/lib/source";

import { BlogPostAnalytics } from "./analytics";
import { Byline } from "./authors";
import { PostGrid } from "./blog-index";
import { blogMdxComponents, PostEmbedsContext } from "./embeds";
import { PostCover } from "./post-cover";
import { ReadingProgress } from "./reading-progress";
import { ShareLinks } from "./share";
import { PostToc } from "./toc";

const sideLink =
  "flex items-center justify-between gap-2 rounded-sm py-1 text-[13px] text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring";

function useCompiledPost(path: string) {
  const page = blog.getPage(path);
  if (!page) throw new Error(`Unknown post: ${path}`);

  const { toc } = use(page.load());

  return { MDX: page.body, toc };
}

function Body({ path }: { readonly path: string }) {
  const { MDX } = useCompiledPost(path);

  return (
    <DocsBody className="ek-blog-prose">
      <MDX components={{ ...useMDXComponents(), ...blogMdxComponents }} />
    </DocsBody>
  );
}

function Toc({ path, slug }: { readonly path: string; readonly slug: string }) {
  const { toc } = useCompiledPost(path);

  return <PostToc toc={toc} slug={slug} />;
}

function Tags({ post }: { readonly post: PostSummary }) {
  if (post.tags.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {post.tags.map((tag) => (
        <li key={tag}>
          <Link
            to="/blog/tags/$tag"
            params={{ tag }}
            title={`Posts tagged ${tagLabels[tag]}`}
            onClick={() => track("blog_tag_clicked", { slug: post.slug, tag })}
            className="inline-flex h-7 items-center rounded-full border border-(--ek-line-strong) px-3 font-mono text-[11px] text-fd-muted-foreground transition-colors hover:border-fd-foreground/30 hover:text-fd-foreground"
          >
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Release, docs and Markdown links in the side column. */
function Resources({ post }: { readonly post: PostSummary }) {
  const pkg = getPackage(post.package);
  const icon = <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} strokeWidth={1.8} />;

  return (
    <div className="flex flex-col gap-1">
      {post.release?.url ? (
        <a
          href={post.release.url}
          title="Release on GitHub"
          target="_blank"
          rel="noreferrer"
          className={sideLink}
        >
          Release v{post.release.version} on GitHub
          {icon}
        </a>
      ) : null}
      {pkg?.hasDocs ? (
        <Link
          to="/docs/$"
          params={{ _splat: pkg.slug }}
          title={`${pkg.name} documentation`}
          className={sideLink}
        >
          {pkg.name} docs
          <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} />
        </Link>
      ) : null}
      <a href={`/blog/${post.slug}.md`} title="This post as Markdown" className={sideLink}>
        View as Markdown
        {icon}
      </a>
    </div>
  );
}

function SeriesBox({ data }: { readonly data: NonNullable<BlogPostData["series"]> }) {
  return (
    <nav
      aria-label="Series"
      className="mb-10 flex flex-col gap-3 rounded-xl border border-(--ek-line) bg-fd-card/60 p-5"
    >
      <p className="font-mono text-xs text-fd-muted-foreground">
        <span className="text-ek-accent">{"// "}</span>
        Part {data.order} of {data.posts.length}
      </p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {data.posts.map((item, index) => (
          <li key={item.slug} className="flex gap-3">
            <span className="w-4 shrink-0 font-mono text-xs leading-6 text-fd-muted-foreground tabular-nums">
              {index + 1}
            </span>
            {index + 1 === data.order ? (
              <span className="text-fd-foreground">{item.title}</span>
            ) : (
              <Link
                to="/blog/$slug"
                params={{ slug: item.slug }}
                title={item.title}
                onClick={() => track("blog_post_clicked", { slug: item.slug, surface: "series" })}
                className="text-fd-muted-foreground hover:text-fd-foreground"
              >
                {item.title}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Adjacent({
  post,
  direction,
}: {
  readonly post: PostSummary | undefined;
  readonly direction: "newer" | "older";
}) {
  if (!post) return <span className="hidden sm:block" />;

  const newer = direction === "newer";

  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      title={post.title}
      onClick={() => track("blog_post_clicked", { slug: post.slug, surface: "adjacent" })}
      className={`group flex flex-col gap-2 rounded-xl border border-(--ek-line) p-5 transition-colors hover:border-(--ek-line-strong) hover:bg-fd-card/50 focus-visible:outline-2 focus-visible:outline-fd-ring ${newer ? "sm:items-end sm:text-right" : ""}`}
    >
      <span className="flex items-center gap-1.5 font-mono text-xs text-fd-muted-foreground">
        {newer ? null : <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />}
        {newer ? "Newer post" : "Older post"}
        {newer ? <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} /> : null}
      </span>
      <span className="text-[15px] leading-snug font-medium text-balance group-hover:text-fd-foreground">
        {post.title}
      </span>
    </Link>
  );
}

/**
 * A blog post: header with byline, the cover, then the body beside a sticky column with the
 * table of contents, sharing and links. Older and newer posts and related reading follow.
 */
export function PostPage({ data }: { readonly data: BlogPostData }) {
  const { post, path, newer, older, related, series } = data;
  const article = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);

  return (
    <>
      <article ref={article} {...(post.package ? { "data-accent": post.package } : {})}>
        <ReadingProgress target={article} />
        <BlogPostAnalytics post={post} article={body} />

        <header>
          <Container className="flex max-w-[1120px] flex-col gap-6 pt-12 pb-10 md:pt-20 md:pb-12">
            <nav
              aria-label="Breadcrumb"
              className="animate-ek-rise font-mono text-xs text-fd-muted-foreground"
            >
              <ol className="flex items-center gap-2">
                <li>
                  <Link to="/blog" title="All posts" className="hover:text-fd-foreground">
                    Blog
                  </Link>
                </li>
                <li aria-hidden="true" className="text-(--ek-line-strong)">
                  /
                </li>
                <li>
                  <Link
                    to="/blog"
                    search={{ category: post.category }}
                    title={`${categoryLabels[post.category].many} posts`}
                    className="text-ek-accent hover:underline hover:underline-offset-4"
                  >
                    {categoryLabels[post.category].many}
                  </Link>
                </li>
              </ol>
            </nav>

            <h1 className="max-w-4xl animate-ek-rise text-[38px] leading-[1.05] font-light tracking-[-0.035em] text-balance [animation-delay:40ms] sm:text-5xl md:text-[60px]">
              {post.title}
            </h1>
            <p className="max-w-[62ch] animate-ek-rise text-lg leading-relaxed font-light text-pretty text-fd-muted-foreground [animation-delay:80ms] md:text-xl">
              {post.description}
            </p>

            <div className="flex animate-ek-rise flex-col gap-5 border-t border-(--ek-line) pt-6 [animation-delay:120ms] sm:flex-row sm:items-center sm:justify-between">
              <Byline authors={post.authors} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-fd-muted-foreground">
                <time dateTime={post.published}>{formatDate(post.published)}</time>
                <span aria-hidden="true" className="text-(--ek-line-strong)">
                  /
                </span>
                <span>{readingTime(post.readingMinutes)}</span>
                {post.updated ? (
                  <>
                    <span aria-hidden="true" className="text-(--ek-line-strong)">
                      /
                    </span>
                    <span>
                      Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </Container>

          <Container className="max-w-[1120px]">
            <PostCover
              post={post}
              priority
              sizes="(min-width: 1120px) 1056px, 100vw"
              className="animate-ek-rise rounded-2xl border border-(--ek-line) [animation-delay:160ms]"
            />
          </Container>
        </header>

        <Container className="grid max-w-[1120px] gap-12 pt-12 pb-16 md:pt-16 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-16">
          <div ref={body} className="min-w-0">
            {series ? <SeriesBox data={series} /> : null}
            <PostEmbedsContext value={{ slug: post.slug }}>
              <Suspense>
                <Body path={path} />
              </Suspense>
            </PostEmbedsContext>

            <footer className="mt-14 flex flex-col gap-6 border-t border-(--ek-line) pt-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <Tags post={post} />
                <ShareLinks slug={post.slug} title={post.title} path={post.url} />
              </div>
            </footer>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 flex flex-col gap-8">
              <Suspense>
                <Toc path={path} slug={post.slug} />
              </Suspense>
              <div className="flex flex-col gap-3">
                <p className="font-mono text-xs text-fd-muted-foreground">Share</p>
                <ShareLinks slug={post.slug} title={post.title} path={post.url} />
              </div>
              <Resources post={post} />
            </div>
          </aside>
        </Container>
      </article>

      {newer || older ? (
        <Container className="max-w-[1120px] pb-16">
          <nav aria-label="More posts" className="grid gap-4 sm:grid-cols-2">
            <Adjacent post={older} direction="older" />
            <Adjacent post={newer} direction="newer" />
          </nav>
        </Container>
      ) : null}

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="border-t border-(--ek-line)">
          <Container className="flex flex-col gap-8 py-16 md:py-20">
            <div className="flex items-end justify-between gap-4">
              <h2
                id="related-title"
                className="text-[28px] leading-tight font-light tracking-[-0.03em] md:text-4xl"
              >
                Keep reading
              </h2>
              <Link
                to="/blog"
                title="All posts"
                className="flex items-center gap-1.5 font-mono text-xs text-fd-muted-foreground hover:text-fd-foreground"
              >
                All posts
                <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} />
              </Link>
            </div>
            <PostGrid posts={related} surface="related" />
          </Container>
        </section>
      ) : null}
    </>
  );
}
