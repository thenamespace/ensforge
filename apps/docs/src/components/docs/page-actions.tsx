import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { ArrowUpRight, Check, Copy, X } from "lucide-react";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import { absolute } from "@/lib/site";

const cache = new Map<string, string>();

type State = "idle" | "loading" | "copied" | "failed";

/**
 * "Copy Markdown" with the look of the Fumadocs button. The stock one throws on a failed fetch
 * and shows nothing; this one says so and reports the failure.
 */
export function CopyMarkdownButton({ markdownUrl, slug }: { markdownUrl: string; slug: string }) {
  const [state, setState] = useState<State>("idle");
  const timeout = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const settle = (next: "copied" | "failed") => {
    setState(next);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setState("idle"), next === "copied" ? 1500 : 2500);
  };

  const onClick = async () => {
    setState("loading");

    try {
      const cached = cache.get(markdownUrl);

      if (cached) {
        await navigator.clipboard.writeText(cached);
      } else {
        // The clipboard item takes a promise so Safari keeps the click's permission while fetching.
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": fetch(markdownUrl).then(async (response) => {
              if (!response.ok)
                throw new Error(`Failed to fetch ${markdownUrl}: ${response.status}`);

              const content = await response.text();
              cache.set(markdownUrl, content);

              return content;
            }),
          }),
        ]);
      }

      settle("copied");
      track("docs_markdown_copied", { slug });
    } catch {
      settle("failed");
      track("copy_failed", { surface: "docs_markdown" });
    }
  };

  const Icon = state === "copied" ? Check : state === "failed" ? X : Copy;

  return (
    <button
      type="button"
      disabled={state === "loading"}
      aria-live="polite"
      onClick={() => void onClick()}
      className={cn(
        buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
        }),
      )}
    >
      <Icon />
      {state === "copied"
        ? "Copied Markdown"
        : state === "failed"
          ? "Copy failed"
          : "Copy Markdown"}
    </button>
  );
}

const assistants = [
  { name: "Claude", href: (prompt: string) => `https://claude.ai/new?q=${prompt}` },
  { name: "ChatGPT", href: (prompt: string) => `https://chatgpt.com/?q=${prompt}` },
] as const;

/** "Open in Claude" and "Open in ChatGPT": a chat that starts from this page's Markdown. */
export function OpenInAssistantButtons({
  markdownUrl,
  slug,
}: {
  markdownUrl: string;
  slug: string;
}) {
  const prompt = encodeURIComponent(
    `Read ${absolute(markdownUrl)} and answer my questions about it, using the ensforge APIs it documents.`,
  );

  return assistants.map((assistant) => (
    <a
      key={assistant.name}
      href={assistant.href(prompt)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open this page in ${assistant.name}`}
      onClick={() =>
        track("docs_markdown_opened_in_assistant", { slug, assistant: assistant.name })
      }
      className={buttonVariants({
        variant: "secondary",
        size: "sm",
        className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
      })}
    >
      Open in {assistant.name}
      <ArrowUpRight />
    </a>
  ));
}
