import { type RefObject, useEffect, useRef } from "react";

import { track } from "@/lib/analytics/client";
import type { PostSummary } from "@/lib/blog/posts";

const DEPTHS = [25, 50, 75, 100] as const;

/** Time on the post before reaching three quarters of it counts as reading it. */
const READ_AFTER_MS = 30_000;

/**
 * The view of one post, how far it was read, and whether it was read at all: three quarters of
 * the article after at least 30 seconds. Depth comes from the article element, so the related
 * posts and footer below it never count as reading.
 */
export function BlogPostAnalytics({
  post,
  article,
}: {
  readonly post: PostSummary;
  readonly article: RefObject<HTMLElement | null>;
}) {
  const { slug, category, readingMinutes, featured } = post;
  const pkg = post.package ?? "site";
  const tags = post.tags.join(",");
  const viewed = useRef<string>(undefined);

  useEffect(() => {
    if (viewed.current === slug) return;
    viewed.current = slug;

    track("blog_post_viewed", {
      slug,
      category,
      package: pkg,
      tags,
      reading_minutes: readingMinutes,
      featured,
    });
  }, [slug, category, pkg, tags, readingMinutes, featured]);

  useEffect(() => {
    const reached = new Set<number>();
    const opened = performance.now();
    let read = false;
    let frame = 0;

    const measure = () => {
      frame = 0;

      const element = article.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      if (rect.height === 0) return;

      const percent = ((window.innerHeight - rect.top) / rect.height) * 100;

      for (const depth of DEPTHS) {
        if (percent >= depth && !reached.has(depth)) {
          reached.add(depth);
          track("blog_read_depth_reached", { percent: depth, slug });
        }
      }

      const elapsed = performance.now() - opened;
      if (!read && reached.has(75) && elapsed >= READ_AFTER_MS) {
        read = true;
        track("blog_post_read", { slug, seconds: Math.round(elapsed / 1000) });
      }
    };

    // Only scrolling counts, so a short post does not report full depth on load.
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [slug, article]);

  return null;
}
