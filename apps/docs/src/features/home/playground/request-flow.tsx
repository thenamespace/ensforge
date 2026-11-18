import { Fragment } from "react";

import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";

import { EnsforgeLogo } from "@/components/logos";
import { cn } from "@/lib/cn";

export type FlowState = "idle" | "running" | "done" | "failed";

/**
 * The path of one read, after Visual Effect's nodes: your app calls ensforge, ensforge asks
 * ENS's resolvers on mainnet, and the result comes back typed. A packet travels the wires
 * while the read is in flight; the last node reports what it cost.
 */
export function RequestFlow({
  state,
  api,
  summary,
}: {
  readonly state: FlowState;
  readonly api: string;
  /** Shown under the result node once the read settles, e.g. `3 requests · 412 ms`. */
  readonly summary: string | undefined;
}) {
  const nodes = [
    { id: "app", label: "Your app", detail: `ens.${api.split(" ")[0]}()`, glyph: "{ }" },
    { id: "sdk", label: "ensforge", detail: "normalize · batch", glyph: null },
    { id: "ens", label: "ENS", detail: "registry · resolver", glyph: ".eth" },
    { id: "result", label: "Result", detail: summary ?? "typed value", glyph: null },
  ] as const;

  return (
    <div
      className="ens-flow grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto] items-start gap-y-2"
      data-state={state}
    >
      {nodes.map((node, index) => (
        <Fragment key={node.id}>
          <div className="flex w-16 flex-col items-center gap-2 text-center sm:w-24">
            <span
              className="ens-flow-node grid size-11 place-items-center rounded-lg border font-mono text-[13px] sm:size-14"
              data-node={node.id}
            >
              {node.id === "sdk" ? (
                <EnsforgeLogo className="size-6" />
              ) : node.id === "result" ? (
                <ResultGlyph state={state} />
              ) : (
                node.glyph
              )}
            </span>
            <span className="font-mono text-[11px] tracking-[0.08em] text-fd-foreground uppercase">
              {node.label}
            </span>
            <span className="hidden font-mono text-[10.5px] leading-snug text-fd-muted-foreground sm:block">
              {node.detail}
            </span>
          </div>
          {index < nodes.length - 1 ? (
            <span aria-hidden="true" className="ens-flow-wire mt-5.5 sm:mt-7" data-wire={index}>
              <span className="ens-flow-packet" />
            </span>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function ResultGlyph({ state }: { readonly state: FlowState }) {
  const className = "size-5";

  if (state === "running") return <LoaderCircleIcon className={cn(className, "animate-spin")} />;
  if (state === "done") return <CheckIcon className={className} />;
  if (state === "failed") return <XIcon className={className} />;

  return <span className="size-2 rounded-full bg-fd-muted-foreground/50" />;
}
