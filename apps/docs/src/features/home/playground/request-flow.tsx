import { Fragment, type ReactNode } from "react";

import {
  AppWindowIcon,
  BracesIcon,
  CheckIcon,
  LoaderCircleIcon,
  NetworkIcon,
  XIcon,
} from "lucide-react";

import { EnsforgeLogo } from "@/components/logos";
import { cn } from "@/lib/cn";

export type FlowState = "idle" | "running" | "done" | "failed";

const icon = "size-5";

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
  /** Shown under the result node once the read settles, e.g. `412 ms · 3 req`. */
  readonly summary: string | undefined;
}) {
  const nodes: readonly { id: string; label: string; detail: string; tile: ReactNode }[] = [
    {
      id: "app",
      label: "Your app",
      detail: `${api.split(" ")[0]}()`,
      tile: <AppWindowIcon className={icon} strokeWidth={1.5} />,
    },
    {
      id: "sdk",
      label: "ensforge",
      detail: "normalize · batch",
      tile: <EnsforgeLogo className="size-5.5" />,
    },
    {
      id: "ens",
      label: "ENS",
      detail: "on mainnet",
      tile: <NetworkIcon className={icon} strokeWidth={1.5} />,
    },
    {
      id: "result",
      label: "Result",
      detail: summary ?? "typed value",
      tile: <ResultIcon state={state} />,
    },
  ];

  return (
    <div
      className="ens-flow grid grid-cols-[auto_minmax(0.75rem,1fr)_auto_minmax(0.75rem,1fr)_auto_minmax(0.75rem,1fr)_auto] items-start"
      data-state={state}
    >
      {nodes.map((node, index) => (
        <Fragment key={node.id}>
          <div className="flex min-w-16 flex-col items-center text-center">
            <span
              className="ens-flow-node grid size-11 place-items-center rounded-xl border sm:size-12"
              data-node={node.id}
            >
              {node.tile}
            </span>
            <span className="mt-2.5 font-mono text-[11px] leading-none tracking-[0.08em] whitespace-nowrap text-fd-foreground uppercase">
              {node.label}
            </span>
            <span className="mt-1.5 hidden font-mono text-[10.5px] leading-none whitespace-nowrap text-fd-muted-foreground tabular-nums sm:block">
              {node.detail}
            </span>
          </div>
          {index < nodes.length - 1 ? (
            <span aria-hidden="true" className="ens-flow-wire mt-5.5 sm:mt-6" data-wire={index}>
              <span className="ens-flow-packet" />
            </span>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function ResultIcon({ state }: { readonly state: FlowState }) {
  if (state === "running") {
    return <LoaderCircleIcon className={cn(icon, "animate-spin")} strokeWidth={1.5} />;
  }
  if (state === "done") return <CheckIcon className={icon} strokeWidth={1.75} />;
  if (state === "failed") return <XIcon className={icon} strokeWidth={1.75} />;

  return <BracesIcon className={icon} strokeWidth={1.5} />;
}
