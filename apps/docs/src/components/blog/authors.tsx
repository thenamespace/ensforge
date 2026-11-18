import { useEffect, useRef, useState } from "react";

import type { PostAuthor } from "@/lib/blog/posts";
import { cn } from "@/lib/cn";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Round avatar from the CDN, with initials until it loads or if it is missing. */
export function Avatar({
  author,
  size = 32,
  className,
}: {
  readonly author: PostAuthor;
  readonly size?: number;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-(--ek-line-strong) bg-fd-muted font-mono text-[10px] text-fd-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials(author.name)}
      {author.avatar && !failed ? (
        <img
          ref={image}
          src={author.avatar}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}

/** Overlapping avatars and the names, for cards. */
export function AuthorNames({ authors }: { readonly authors: readonly PostAuthor[] }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex -space-x-2">
        {authors.map((author) => (
          <Avatar key={author.id} author={author} size={22} className="ring-2 ring-fd-background" />
        ))}
      </span>
      <span className="truncate">{authors.map((author) => author.name).join(", ")}</span>
    </span>
  );
}

/** Byline under a post title: avatar, name linking to the author, and role. */
export function Byline({ authors }: { readonly authors: readonly PostAuthor[] }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-3">
      {authors.map((author) => (
        <li key={author.id} className="flex items-center gap-3">
          <Avatar author={author} size={36} />
          <span className="flex flex-col leading-tight">
            <a
              href={author.url}
              title={`${author.name}'s website`}
              target="_blank"
              rel="noreferrer author"
              className="text-sm font-medium text-fd-foreground hover:underline hover:underline-offset-4"
            >
              {author.name}
            </a>
            <span className="text-xs text-fd-muted-foreground">{author.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
