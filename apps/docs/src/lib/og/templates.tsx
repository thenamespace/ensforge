import { site } from "@/lib/site";

import { PackageTiles, PlateStack } from "./art";
import { Description, Frame, Slash, Title } from "./frame";
import { HomeImage } from "./home";
import { type Accent, accents } from "./primitives";

/**
 * Open Graph images, 1200 × 630: one per landing page, docs page and blog post. Everything is plain
 * elements and inline SVG (no React components inside SVG) so Takumi can lay them out.
 */

export { OG, accents, type Accent } from "./primitives";

export function SiteImage({ page }: { page: "home" | "blog" }) {
  if (page === "home") return <HomeImage />;

  return (
    <Frame eyebrow={<span style={{ color: accents.kit }}>Blog</span>} art={<PackageTiles />}>
      <Title text={`${site.name} blog`} />
      <Description>Release notes, guides and engineering notes from {site.name}.</Description>
    </Frame>
  );
}

export interface DocsCard {
  readonly accent: Accent;
  /** Package or area, e.g. "SDK" or "Errors". */
  readonly section: string;
  /** What kind of page this is, e.g. "Guide" or "API reference". */
  readonly kind: string;
  readonly title: string;
  /** Set the title in mono: API names and error codes. */
  readonly code: boolean;
}

export function DocsImage({
  card,
  description,
}: {
  card: DocsCard;
  description: string | undefined;
}) {
  return (
    <Frame
      eyebrow={
        <>
          <span style={{ color: accents[card.accent] }}>{card.section}</span>
          <Slash />
          {card.kind}
        </>
      }
      art={<PlateStack accent={card.accent} />}
    >
      <Title text={card.title} code={card.code} />
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
}: {
  accent: Accent;
  category: string;
  date: string;
  title: string;
  byline: string;
}) {
  return (
    <Frame
      eyebrow={
        <>
          <span style={{ color: accents[accent] }}>{category}</span>
          <Slash />
          {date}
        </>
      }
      art={<PlateStack accent={accent} />}
    >
      <Title text={title} />
      <Description>{byline}</Description>
    </Frame>
  );
}
