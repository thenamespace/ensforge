import type { ReactNode } from "react";

import { site } from "@/lib/site";

import { KitStack, PlateStack } from "./art";
import { Description, EnsforgeMark, Frame, Title } from "./frame";
import { type Accent, accents, FAINT, LINE, MUTED } from "./primitives";

/**
 * Open Graph images, 1200 × 630: one per landing page, docs page and blog post. Everything is plain
 * elements and inline SVG (no React components inside SVG) so Takumi can lay them out.
 */

export { OG, accents, type Accent } from "./primitives";

export function SiteImage({ page }: { page: "home" | "blog" }) {
  if (page === "blog") {
    return (
      <Frame accent="kit" crumb="Blog" art={<KitStack />} wide={false}>
        <Title size={80}>{site.name} blog</Title>
        <Description>Release notes, guides and engineering notes from {site.name}.</Description>
      </Frame>
    );
  }

  return (
    <Frame accent="kit" art={<KitStack />} wide={false}>
      <Title size={72}>{site.tagline}.</Title>
      <Description>Placeholder: the landing page is not written yet.</Description>
    </Frame>
  );
}

export function DocsImage({
  accent,
  section,
  title,
  description,
}: {
  accent: Accent;
  section: string;
  title: string;
  description: string | undefined;
}) {
  const size = title.length > 46 ? 56 : title.length > 26 ? 66 : 80;

  return (
    <Frame accent={accent} crumb={section} art={<PlateStack accent={accent} />}>
      <Pill>
        <EnsforgeMark height={12} color={accents[accent]} />
        Documentation
      </Pill>
      <Title size={size}>{title}</Title>
      {description ? (
        <Description>
          {description.length > 140 ? `${description.slice(0, 137)}…` : description}
        </Description>
      ) : null}
    </Frame>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        borderRadius: 9999,
        border: `1px solid ${LINE}`,
        fontFamily: "JetBrains Mono",
        fontSize: 18,
        color: MUTED,
      }}
    >
      {children}
    </div>
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
  const size = title.length > 56 ? 54 : title.length > 32 ? 64 : 78;

  return (
    <Frame accent={accent} crumb="Blog" art={<PlateStack accent={accent} />}>
      <Pill>
        <span style={{ color: accents[accent] }}>{category}</span>
        <span style={{ color: FAINT }}>/</span>
        {date}
      </Pill>
      <Title size={size}>{title}</Title>
      <div style={{ fontSize: 24, color: MUTED }}>{byline}</div>
    </Frame>
  );
}
