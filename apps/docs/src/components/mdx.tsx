import { type ComponentProps, isValidElement, type ReactNode, useMemo } from "react";

import { useLocation } from "@tanstack/react-router";

import { Link } from "fumadocs-core/link";
import type * as PageTree from "fumadocs-core/page-tree";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Card, Cards } from "fumadocs-ui/components/card";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { useTreeContext } from "fumadocs-ui/contexts/tree";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { track } from "@/lib/analytics/client";
import { Icon } from "@/lib/docs-icons";

import { useDocsSlug } from "./docs/analytics";
import { DocsHome } from "./docs/docs-home";
import { Mermaid } from "./mermaid";

/**
 * Docs pages and blog posts share these components; events go to the section they were read
 * in, so a copy in a post is not counted as a docs copy.
 */
function useContentScope() {
  const docsSlug = useDocsSlug();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isBlog = pathname.startsWith("/blog/");

  return {
    isBlog,
    slug: isBlog ? pathname.slice("/blog/".length).replace(/\/$/, "") : docsSlug,
  };
}

/** Code block with Fumadocs' markup, reporting clicks on its copy button. */
function TrackedPre(props: ComponentProps<typeof CodeBlock>) {
  const { isBlog, slug } = useContentScope();

  return (
    <CodeBlock
      {...props}
      onClick={(event) => {
        props.onClick?.(event);

        const button = event.target instanceof Element ? event.target.closest("button") : null;
        if (!button || !button.textContent?.startsWith("Cop")) return;

        const figure = event.currentTarget;
        // The block markup carries no language, so it comes from the file name when there is one.
        const title = typeof props.title === "string" ? props.title : "";
        const language = title.includes(".") ? (title.split(".").pop() ?? "") : "";

        track(isBlog ? "blog_code_copied" : "docs_code_copied", {
          slug,
          language: language || "unknown",
          lines: figure.querySelectorAll("pre .line").length,
        });
      }}
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  );
}

/** Link text as a plain string, the fallback title when the target page is unknown. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);

  return "";
}

const pageTitles = new WeakMap<object, Map<string, string>>();

/** Page titles by URL, from the page tree the docs layout provides. */
function titlesOf(root: PageTree.Root) {
  const cached = pageTitles.get(root);
  if (cached) return cached;

  const titles = new Map<string, string>();
  const visit = (nodes: readonly PageTree.Node[]) => {
    for (const node of nodes) {
      if (node.type === "page" && typeof node.name === "string") titles.set(node.url, node.name);
      if (node.type === "folder") {
        if (node.index && typeof node.index.name === "string")
          titles.set(node.index.url, node.index.name);
        visit(node.children);
      }
    }
  };

  visit(root.children);
  pageTitles.set(root, titles);

  return titles;
}

function isExternal(href: string) {
  return /^https?:\/\//.test(href);
}

/** Every link carries a `title`: the target page's title inside the docs, the host outside. */
function linkTitle(href: string | undefined, text: string, titles?: Map<string, string>) {
  if (!href) return text || undefined;
  if (isExternal(href)) {
    try {
      return new URL(href).host;
    } catch {
      return href;
    }
  }

  const path = href.split(/[#?]/)[0] ?? "";
  return titles?.get(path.replace(/\/$/, "")) ?? (text || undefined);
}

/** External links report a click; every link gets a `title`. */
function TrackedLink(props: ComponentProps<typeof Link>) {
  const { isBlog, slug } = useContentScope();
  const pathname = useLocation({ select: (location) => location.pathname });

  return pathname.startsWith("/docs/") ? (
    <DocsTitledLink {...props} isBlog={isBlog} slug={slug} />
  ) : (
    <ReportingLink
      {...props}
      title={props.title ?? linkTitle(props.href, textOf(props.children))}
      isBlog={isBlog}
      slug={slug}
    />
  );
}

function DocsTitledLink(props: ComponentProps<typeof Link> & { isBlog: boolean; slug: string }) {
  const { full } = useTreeContext();
  const titles = useMemo(() => titlesOf(full), [full]);

  return (
    <ReportingLink
      {...props}
      title={props.title ?? linkTitle(props.href, textOf(props.children), titles)}
    />
  );
}

function ReportingLink({
  isBlog,
  slug,
  ...props
}: ComponentProps<typeof Link> & { isBlog: boolean; slug: string }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        props.onClick?.(event);

        try {
          const url = new URL(event.currentTarget.href, window.location.href);
          if (url.origin !== window.location.origin && url.protocol.startsWith("http")) {
            track(isBlog ? "blog_outbound_clicked" : "docs_outbound_clicked", {
              slug,
              host: url.host,
            });
          }
        } catch {
          // A malformed href has nothing to report.
        }
      }}
    />
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    a: TrackedLink,
    pre: TrackedPre,
    Accordion,
    Accordions,
    Card,
    Cards,
    DocsHome,
    Icon,
    Mermaid,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
