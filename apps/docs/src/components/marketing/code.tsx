import { createContext, type ReactNode, use, useEffect, useRef } from "react";

import { snippets, type SnippetId } from "@/content/snippets";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import type { HighlightedSnippets } from "@/lib/highlight";

import { CopyButton } from "./copy-button";

const CodeContext = createContext<HighlightedSnippets>({});

// Stable default so `active` doesn't change identity on every render.
const NO_LINES: readonly number[] = [];

export function CodeProvider({
  value,
  children,
}: {
  readonly value: HighlightedSnippets;
  readonly children: ReactNode;
}) {
  return <CodeContext value={value}>{children}</CodeContext>;
}

interface CodeProps {
  readonly id: SnippetId;
  /** 1-based lines to emphasise; other lines dim while any are active. */
  readonly active?: readonly number[];
  /** Flash lines that changed since the previous snippet (for swaps). */
  readonly flashFrom?: SnippetId;
  readonly className?: string;
}

/** Server-highlighted code. Falls back to plain text when a snippet wasn't preloaded. */
export function Code({ id, active = NO_LINES, flashFrom, className }: CodeProps) {
  const highlighted = use(CodeContext)[id];
  const ref = useRef<HTMLDivElement>(null);
  const activeKey = active.join(",");

  useEffect(() => {
    const root = ref.current;
    if (!root || !highlighted) return;

    const lines = new Set(activeKey ? activeKey.split(",") : []);

    for (const line of root.querySelectorAll<HTMLElement>("[data-line]")) {
      if (lines.has(line.dataset.line ?? "")) line.dataset.active = "";
      else delete line.dataset.active;
    }
  }, [activeKey, highlighted]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !flashFrom || flashFrom === id) return;

    const before = new Set(snippets[flashFrom].code.split("\n"));
    const after = snippets[id].code.split("\n");

    for (const line of root.querySelectorAll<HTMLElement>("[data-line]")) {
      const text = after[Number(line.dataset.line) - 1];
      if (text === undefined || before.has(text) || text.trim() === "") continue;

      // Remove, force a reflow, then re-add so the flash animation restarts on repeat swaps.
      delete line.dataset.flash;
      void line.offsetWidth;
      line.dataset.flash = "";
    }
  }, [id, flashFrom]);

  return (
    <div
      ref={ref}
      data-dim={active.length > 0}
      className={cn("ek-code overflow-x-auto py-4 font-mono", className)}
    >
      {highlighted ? (
        // Shiki output is generated on our server from static snippets in this repo.
        // oxlint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <pre className="px-5 text-[13px] leading-[1.7] text-fd-muted-foreground">
          {snippets[id].code}
        </pre>
      )}
    </div>
  );
}

/** Frame around code, with a copy button in the top-right corner. */
export function CodeWindow({
  code,
  snippetId,
  children,
  className,
}: {
  /** The source the copy button copies. */
  readonly code: string;
  /** Which snippet this is, for the copy event. */
  readonly snippetId?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-(--ek-line) bg-fd-card/60 shadow-[0_1px_0_0_var(--ek-line)_inset]",
        className,
      )}
    >
      <CopyButton
        text={code}
        onCopied={() =>
          track("code_copied", {
            snippet_id: snippetId ?? "unknown",
            surface: "code_window",
            lines: code.split("\n").length,
          })
        }
        className="absolute top-2 right-2 z-10 bg-fd-card/80 backdrop-blur-sm"
      />
      {children}
    </div>
  );
}
