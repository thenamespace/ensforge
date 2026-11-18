import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { Check, Copy, X } from "lucide-react";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

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
