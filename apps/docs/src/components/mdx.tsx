import { type ComponentProps, useEffect, useRef } from "react";

import { useLocation } from "@tanstack/react-router";

import { Link } from "fumadocs-core/link";
import * as Twoslash from "fumadocs-twoslash/ui";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { track } from "@/lib/analytics/client";
import { Icon } from "@/lib/docs-icons";

import { useDocsSlug } from "./docs/analytics";

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
          is_twoslash: figure.classList.contains("twoslash"),
        });
      }}
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  );
}

/** External links report a click; the rest behave as the stock link. */
function TrackedLink(props: ComponentProps<typeof Link>) {
  const { isBlog, slug } = useContentScope();

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

let hoverSlug: string | undefined;
const hovered = new Set<string>();

/** Reports a type popup once per identifier per page view, after a short hover or a tap. */
function TrackedPopupTrigger(props: ComponentProps<typeof Twoslash.PopupTrigger>) {
  const { isBlog, slug } = useContentScope();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let timer: number | undefined;

    const report = () => {
      if (hoverSlug !== slug) {
        hoverSlug = slug;
        hovered.clear();
      }

      const identifier = (element.textContent ?? "").trim().slice(0, 80);
      if (!identifier || hovered.has(identifier)) return;

      hovered.add(identifier);
      track(isBlog ? "blog_type_hovered" : "docs_type_hovered", { slug, identifier });
    };

    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") timer = window.setTimeout(report, 300);
    };
    const onLeave = () => window.clearTimeout(timer);

    element.addEventListener("pointerenter", onEnter);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("click", report);

    return () => {
      window.clearTimeout(timer);
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("click", report);
    };
  }, [isBlog, slug]);

  return <Twoslash.PopupTrigger {...props} ref={ref} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...Twoslash,
    PopupTrigger: TrackedPopupTrigger,
    a: TrackedLink,
    pre: TrackedPre,
    Accordion,
    Accordions,
    Icon,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
