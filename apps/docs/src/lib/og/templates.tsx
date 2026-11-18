import { site } from "@/lib/site";

import { PackageTiles, PlateStack } from "./art";
import { Description, Frame, Slash, Title } from "./frame";
import { type Accent, accents } from "./primitives";

/**
 * Open Graph images, 1200 × 630: one per landing page, docs page and blog post. Everything is plain
 * elements and inline SVG (no React components inside SVG) so Takumi can lay them out.
 */

export { OG, accents, type Accent } from "./primitives";

const host = new URL(site.url).host;

/** The page's address for the footer; middle segments give way to "…" when it would not fit. */
function address(path: string) {
  const segments = path.split("/").filter(Boolean);
  let shown = [host, ...segments].join("/");

  for (let keep = segments.length - 2; shown.length > 72 && keep >= 1; keep--)
    shown = [host, segments[0], "…", ...segments.slice(-keep)].join("/");

  return shown;
}

const install = "npm i @ensforge/sdk";

export function SiteImage({ page }: { page: "home" | "blog" }) {
  if (page === "blog") {
    return (
      <Frame
        label={{ accent: "kit", text: "blog" }}
        eyebrow={<span style={{ color: accents.kit }}>Blog</span>}
        path={address("/blog")}
        note={install}
        art={<PackageTiles />}
      >
        <Title text={`${site.name} blog`} />
        <Description>Release notes, guides and engineering notes from {site.name}.</Description>
      </Frame>
    );
  }

  return (
    <Frame
      label={{ accent: "sdk", text: "@ensforge/sdk" }}
      eyebrow={
        <>
          <span style={{ color: accents.kit }}>TypeScript</span>
          <Slash />
          Built on viem
        </>
      }
      path={host}
      note={install}
      art={<PackageTiles />}
    >
      <Title text={`${site.tagline}.`} size={88} />
      <Description>{site.description}</Description>
    </Frame>
  );
}

export interface DocsCard {
  readonly accent: Accent;
  /** Package or area, e.g. "SDK" or "Errors". */
  readonly section: string;
  /** What kind of page this is, e.g. "Guide" or "API reference". */
  readonly kind: string;
  /** Header label: the package's npm name, or "docs". */
  readonly label: string;
  /** Set the title in mono: API names and error codes. */
  readonly code: boolean;
}

export function DocsImage({
  card,
  title,
  description,
  path,
}: {
  card: DocsCard;
  title: string;
  description: string | undefined;
  path: string;
}) {
  return (
    <Frame
      label={{ accent: card.accent, text: card.label }}
      eyebrow={
        <>
          <span style={{ color: accents[card.accent] }}>{card.section}</span>
          <Slash />
          {card.kind}
        </>
      }
      path={address(path)}
      note="Documentation"
      art={<PlateStack accent={card.accent} />}
    >
      <Title text={title} code={card.code} />
      {description ? <Description>{description}</Description> : null}
    </Frame>
  );
}

export function BlogImage({
  accent,
  category,
  date,
  title,
  byline,
  path,
}: {
  accent: Accent;
  category: string;
  date: string;
  title: string;
  byline: string;
  path: string;
}) {
  return (
    <Frame
      label={{ accent: "kit", text: "blog" }}
      eyebrow={
        <>
          <span style={{ color: accents[accent] }}>{category}</span>
          <Slash />
          {date}
        </>
      }
      path={address(path)}
      note="Blog"
      art={<PlateStack accent={accent} />}
    >
      <Title text={title} />
      <Description>{byline}</Description>
    </Frame>
  );
}
