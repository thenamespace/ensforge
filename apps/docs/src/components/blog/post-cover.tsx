import { useEffect, useRef, useState } from "react";

import type { PostSummary } from "@/lib/blog/posts";
import { cn } from "@/lib/cn";

import { CoverArt } from "./cover-art";

/**
 * A post's cover at the OG ratio: its image from the CDN, or the drawn cover when it has none.
 * A missing or broken image also falls back to the drawing, so an asset that has not been
 * uploaded yet never shows as a broken image.
 */
export function PostCover({
  post,
  priority = false,
  sizes = "(min-width: 1024px) 400px, 100vw",
  className,
}: {
  readonly post: PostSummary;
  /** Load eagerly, for the cover at the top of the page. */
  readonly priority?: boolean;
  readonly sizes?: string;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  // A server-rendered image can fail before hydration attaches `onError`.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  const art = (
    <CoverArt
      category={post.category}
      pkg={post.package}
      version={post.release?.version}
      className="size-full"
    />
  );

  return (
    <div
      className={cn(
        "ek-blog-cover relative aspect-[1200/630] overflow-hidden bg-fd-card",
        className,
      )}
    >
      {post.cover && !failed ? (
        <img
          ref={image}
          src={post.cover.url}
          alt={post.cover.alt}
          width={post.cover.width}
          height={post.cover.height}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          {...(priority ? { fetchPriority: "high" as const } : {})}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        art
      )}
    </div>
  );
}
