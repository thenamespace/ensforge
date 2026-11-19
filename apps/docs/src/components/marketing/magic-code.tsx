import { useMemo } from "react";

import { ShikiMagicMovePrecompiled } from "@shikijs/magic-move/react";

import "@shikijs/magic-move/style.css";

import type { SnippetId } from "@/content/snippets";
import { cn } from "@/lib/cn";
import type { KeyedSnippets } from "@/lib/magic";

import { useReducedMotion } from "./hooks";

interface MagicCodeProps {
  /** Tokens from `keyedSnippets`, loaded by the route. */
  readonly tokens: KeyedSnippets;
  /** Every state the code can be in, in order. */
  readonly ids: readonly SnippetId[];
  /** The state to show; changing it animates the tokens that moved. */
  readonly current: SnippetId;
  readonly className?: string;
}

/**
 * Code that morphs between snippets with Shiki Magic Move: unchanged tokens slide to their new
 * place, removed ones fade out and new ones fade in, so a swap shows exactly what changed.
 */
export function MagicCode({ tokens, ids, current, className }: MagicCodeProps) {
  const reduced = useReducedMotion();
  const steps = useMemo(
    () =>
      ids.flatMap((id) => {
        const step = tokens[id];
        return step ? [step] : [];
      }),
    [ids, tokens],
  );
  const step = Math.max(
    0,
    ids.filter((id) => tokens[id]).findIndex((id) => id === current),
  );

  if (steps.length === 0) return null;

  return (
    <div
      className={cn("ek-code ek-magic overflow-x-auto py-5 text-[13px] leading-[1.7]", className)}
    >
      <ShikiMagicMovePrecompiled
        steps={steps}
        step={step}
        animate={!reduced}
        options={{ duration: 650, stagger: 0.3, lineNumbers: false }}
      />
    </div>
  );
}
