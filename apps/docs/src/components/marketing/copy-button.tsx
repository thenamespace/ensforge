import { useEffect, useRef, useState } from "react";

import { CheckIcon, CopyIcon } from "lucide-react";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

const RESET_MS = 1600;

/** Copies `text` to the clipboard and confirms with a check for a moment. */
export function CopyButton({
  text,
  label = "Copy code",
  className,
  surface = "code_window",
  onCopied,
}: {
  readonly text: string;
  readonly label?: string;
  /** Reported as `copy_failed.surface` when the clipboard write is rejected. */
  readonly surface?: string;
  /** Called after the text reached the clipboard. */
  readonly onCopied?: () => void;
  readonly className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Denied permission or an insecure context: report it and keep the idle icon.
      track("copy_failed", { surface });
      return;
    }

    onCopied?.();
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), RESET_MS);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring",
        className,
      )}
    >
      {copied ? (
        <CheckIcon className="size-4 animate-ek-pop text-ek-accent" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  );
}
