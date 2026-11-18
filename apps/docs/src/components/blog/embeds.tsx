import { createContext, type ReactNode, use } from "react";

import { cdn } from "@/lib/cdn";
import { cn } from "@/lib/cn";

/*
 * Components a post can use in its MDX beyond the docs set: numbered images from the CDN, in a
 * full-width block with a caption. Interactive figures join here once the site has them.
 */

interface PostEmbeds {
  readonly slug: string;
}

export const PostEmbedsContext = createContext<PostEmbeds | undefined>(undefined);

function usePostEmbeds(component: string): PostEmbeds {
  const value = use(PostEmbedsContext);
  if (!value) throw new Error(`<${component}> can only be used in a blog post.`);

  return value;
}

/** A full-width block in the post with an optional caption under it. */
function Embed({
  caption,
  className,
  children,
}: {
  readonly caption?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <figure className={cn("not-prose my-10 flex flex-col gap-3", className)}>
      {children}
      {caption ? (
        <figcaption className="font-mono text-xs leading-relaxed text-fd-muted-foreground">
          <span aria-hidden="true" className="text-ek-accent">
            {"// "}
          </span>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * An image from the post's CDN folder: `<PostImage n={1} … />` is `blog/<slug>/1.webp`. Sizes
 * are required so the image reserves its space while it loads.
 */
export function PostImage({
  n,
  alt,
  width,
  height,
  caption,
  ext = "webp",
}: {
  readonly n: number;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly caption?: ReactNode;
  readonly ext?: "webp" | "png" | "jpg" | "gif" | "svg";
}) {
  const { slug } = usePostEmbeds("PostImage");

  return (
    <Embed caption={caption}>
      <img
        src={cdn(`blog/${slug}/${n}.${ext}`)}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl border border-(--ek-line)"
      />
    </Embed>
  );
}

export const blogMdxComponents = {
  PostImage,
};
