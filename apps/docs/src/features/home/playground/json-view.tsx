import { cn } from "@/lib/cn";

/**
 * Pretty-printed JSON with token colours from the site's code theme. A small tokenizer instead
 * of Shiki: the output is JSON we produced ourselves, and Shiki in the browser would cost more
 * than the whole playground.
 */

const token =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(source: string) {
  const parts: { readonly text: string; readonly kind?: string }[] = [];
  let last = 0;

  for (const match of source.matchAll(token)) {
    const index = match.index;
    if (index > last) parts.push({ text: source.slice(last, index) });

    const [whole, string, colon, literal, number] = match;
    if (string !== undefined) {
      parts.push({ text: string, kind: colon ? "key" : "string" });
      if (colon) parts.push({ text: colon });
    } else if (literal !== undefined) {
      parts.push({ text: literal, kind: literal === "null" ? "null" : "literal" });
    } else if (number !== undefined) {
      parts.push({ text: number, kind: "number" });
    } else {
      parts.push({ text: whole });
    }

    last = index + whole.length;
  }

  if (last < source.length) parts.push({ text: source.slice(last) });

  return parts;
}

export function JsonView({
  value,
  className,
}: {
  readonly value: unknown;
  readonly className?: string;
}) {
  const source = JSON.stringify(value, null, 2) ?? "undefined";

  return (
    <pre className={cn("ens-json font-mono text-[12.5px] leading-[1.7]", className)}>
      <code>
        {highlight(source).map((part, index) =>
          part.kind ? (
            // oxlint-disable-next-line react/no-array-index-key -- tokens of a static string, re-rendered whole
            <span key={index} data-token={part.kind}>
              {part.text}
            </span>
          ) : (
            part.text
          ),
        )}
      </code>
    </pre>
  );
}
