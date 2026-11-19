import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { ArrowUpRightIcon, PlayIcon } from "lucide-react";

import { CopyButton } from "@/components/marketing/copy-button";
import { useInView } from "@/components/marketing/hooks";
import { snippets } from "@/content/snippets";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import type { HighlightedSnippets } from "@/lib/highlight";

import type * as ClientModule from "./client";
import {
  type Chain,
  chainLabels,
  type Example,
  examples,
  type RunOutcome,
  snippetInput,
} from "./examples";
import { JsonView } from "./json-view";
import { type FlowState, RequestFlow } from "./request-flow";
import { ResultCard } from "./result-card";

type Client = typeof ClientModule;

const focusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ek-accent";

interface TabState {
  readonly input: string;
  readonly chain: Chain;
  readonly flow: FlowState;
  readonly outcome: RunOutcome | undefined;
}

const initialTab = (example: Example): TabState => ({
  input: example.presets[0]?.value ?? "",
  chain: "eth",
  flow: "idle",
  outcome: undefined,
});

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The snippet as written, with its sample input swapped for the reader's. */
function personalize(example: Example, chain: Chain, input: string, html: string | undefined) {
  const id = example.snippets[chain] ?? example.snippets.eth;
  const sample = snippetInput[example.input];
  const value = input.trim() || sample;
  const code = snippets[id].code.replaceAll(`"${sample}"`, JSON.stringify(value));
  const literal = escapeHtml(JSON.stringify(value));
  const highlighted = html
    ?.replaceAll(`"${sample}"`, literal)
    .replaceAll(`&quot;${sample}&quot;`, literal)
    .replaceAll(`&#x22;${sample}&#x22;`, literal);

  return { id, code, highlighted };
}

const describeRun = (outcome: RunOutcome | undefined) => {
  if (!outcome) return undefined;
  if (!outcome.ok) return `${outcome.code} · ${Math.round(outcome.ms)} ms`;
  if (outcome.cached) return "cached · 0 requests";

  return `${outcome.requests} RPC request${outcome.requests === 1 ? "" : "s"} · ${Math.round(outcome.ms)} ms`;
};

/** The same run, short enough to sit on one line under the flow's result tile. */
const summarizeRun = (outcome: RunOutcome | undefined) => {
  if (!outcome) return undefined;
  if (!outcome.ok) return `failed · ${Math.round(outcome.ms)} ms`;
  if (outcome.cached) return "cached";

  return `${Math.round(outcome.ms)} ms · ${outcome.requests} req`;
};

/**
 * Real reads of `@ensforge/sdk` against Ethereum mainnet, in the browser. The SDK loads when
 * the playground first scrolls near the screen; until then (and on the server) it renders idle.
 */
export function Playground({ code }: { readonly code: HighlightedSnippets }) {
  const base = useId();
  const root = useRef<HTMLElement>(null);
  const near = useInView(root, { rootMargin: "400px", once: true });
  const client = useRef<Promise<Client> | undefined>(undefined);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const [active, setActive] = useState(0);
  const [state, setState] = useState<Record<string, TabState>>(() =>
    Object.fromEntries(examples.map((example) => [example.id, initialTab(example)])),
  );

  const example = examples[active] ?? examples[0];

  useEffect(() => {
    if (near) client.current ??= import("./client");
  }, [near]);

  if (!example) return null;

  const tab = state[example.id] ?? initialTab(example);
  const running = tab.flow === "running";
  const {
    id: snippetId,
    code: plainCode,
    highlighted,
  } = personalize(
    example,
    tab.chain,
    tab.input,
    code[example.snippets[tab.chain] ?? example.snippets.eth],
  );

  const update = (id: string, patch: Partial<TabState>) =>
    setState((current) => {
      const previous = current[id];

      return previous ? { ...current, [id]: { ...previous, ...patch } } : current;
    });

  const runExample = async () => {
    if (running || !tab.input.trim()) return;

    const { id } = example;
    const input = example.presets.some((preset) => preset.value === tab.input) ? "preset" : "typed";
    update(id, { flow: "running" });
    client.current ??= import("./client");

    try {
      const { run } = await client.current;
      const outcome = await run(id, tab.input, tab.chain);
      update(id, { flow: outcome.ok ? "done" : "failed", outcome });
      track("playground_run_completed", {
        example_id: id,
        ok: outcome.ok,
        cached: outcome.ok && outcome.cached,
        ms: Math.round(outcome.ms),
        chain: tab.chain,
        input,
        ...(outcome.ok ? {} : { error_code: outcome.code }),
      });
    } catch {
      // Only the chunk itself can fail here (offline, a new deploy): reads report their own errors.
      client.current = undefined;
      track("playground_run_completed", {
        example_id: id,
        ok: false,
        cached: false,
        ms: 0,
        chain: tab.chain,
        input,
        error_code: "PLAYGROUND_UNAVAILABLE",
      });
      update(id, {
        flow: "failed",
        outcome: {
          ok: false,
          code: "PLAYGROUND_UNAVAILABLE",
          title: "The playground did not load",
          message: "Check your connection and press Run again.",
          docs: undefined,
          json: null,
          ms: 0,
        },
      });
    }
  };

  const select = (index: number) => {
    setActive(index);
    tabs.current[index]?.focus();
  };

  const onTabKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: examples.length - 1,
    };
    const move = moves[event.key];
    if (move === undefined) return;

    event.preventDefault();
    select((move + examples.length) % examples.length);
  };

  const panelId = `${base}-panel`;
  const inputId = `${base}-input`;
  const outcome = tab.outcome;

  return (
    <section ref={root} aria-label="ensforge playground" className="relative">
      <div className="border border-(--ek-line-strong) bg-fd-background">
        <div
          role="tablist"
          aria-label="Examples"
          className="flex overflow-x-auto border-b border-(--ek-line) [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible"
        >
          {examples.map((entry, index) => (
            <button
              key={entry.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${entry.id}`}
              aria-selected={index === active}
              aria-controls={panelId}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onTabKey}
              className={cn(
                "relative min-h-13 shrink-0 px-4 py-2.5 font-mono whitespace-nowrap sm:px-3 text-[13px] transition-colors",
                focusRing,
                index === active
                  ? "bg-zinc-900 text-fd-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-ek-accent"
                  : "text-fd-foreground/70 hover:bg-zinc-900/50 hover:text-fd-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={`${base}-tab-${example.id}`}
          className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        >
          <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6 lg:border-e lg:border-(--ek-line)">
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[15px] font-semibold text-fd-foreground">
                ens.{example.api.replace(" + ", " + ens.")}
              </p>
              <p className="text-sm leading-snug text-pretty text-fd-muted-foreground">
                {example.description}
              </p>
            </div>

            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runExample();
              }}
            >
              <label
                htmlFor={inputId}
                className="font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase"
              >
                {example.input === "name" ? "ENS name" : "Address"}
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={tab.input}
                  onChange={(event) => update(example.id, { input: event.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder={example.input === "name" ? "nick.eth" : "0x…"}
                  className="h-11 min-w-0 flex-1 rounded-md border border-(--ek-line-strong) bg-fd-card/60 px-3 font-mono text-sm text-fd-foreground transition-colors outline-none placeholder:text-fd-muted-foreground/60 focus:border-ek-accent"
                />
                <button
                  type="submit"
                  disabled={running || !tab.input.trim()}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-ek-accent px-4 text-sm font-medium text-ek-accent-ink transition-[opacity,filter] hover:brightness-110 disabled:opacity-60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ek-accent",
                  )}
                >
                  <PlayIcon aria-hidden="true" className="size-3.5 fill-current" />
                  {running ? "Running" : "Run"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {example.presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => update(example.id, { input: preset.value })}
                    aria-pressed={tab.input === preset.value}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                      focusRing,
                      tab.input === preset.value
                        ? "border-ek-accent/60 bg-ek-accent/10 text-fd-foreground"
                        : "border-(--ek-line-strong) text-fd-muted-foreground hover:text-fd-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {example.chains ? (
                <fieldset className="flex flex-wrap items-center gap-3 pt-1">
                  <legend className="float-left font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase">
                    Chain
                  </legend>
                  <div className="flex rounded-lg border border-(--ek-line) bg-zinc-900/60 p-1">
                    {example.chains.map((chain) => (
                      <button
                        key={chain}
                        type="button"
                        aria-pressed={tab.chain === chain}
                        onClick={() => update(example.id, { chain })}
                        className={cn(
                          "min-h-8 rounded-md px-3 font-mono text-[12px] transition-colors",
                          focusRing,
                          tab.chain === chain
                            ? "bg-zinc-700/80 text-fd-foreground"
                            : "text-fd-muted-foreground hover:text-fd-foreground",
                        )}
                      >
                        {chainLabels[chain]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </form>

            <RequestFlow state={tab.flow} api={example.api} summary={summarizeRun(outcome)} />

            <div
              aria-live="polite"
              className={cn(
                "ens-result relative min-h-48 rounded-lg border border-(--ek-line) bg-fd-card/40 p-5",
                running && "animate-pulse",
              )}
            >
              {outcome?.ok ? (
                <ResultCard view={outcome.view} />
              ) : outcome ? (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[11px] tracking-[0.08em] text-ek-fail">
                    {outcome.code}
                  </p>
                  <p className="text-base text-fd-foreground">{outcome.title}</p>
                  <p className="text-sm leading-relaxed text-fd-muted-foreground">
                    {outcome.message}
                  </p>
                  {outcome.docs ? (
                    <a
                      href={outcome.docs}
                      className="inline-flex w-fit items-center gap-1 pt-1 font-mono text-[11px] text-fd-foreground/80 underline decoration-(--ek-line-strong) underline-offset-4 hover:decoration-fd-foreground"
                    >
                      {outcome.code} reference
                      <ArrowUpRightIcon aria-hidden="true" className="size-3" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-38 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-fd-foreground">
                    {running
                      ? "Reading from mainnet…"
                      : `Press Run to read ${tab.input.trim() || "a name"} from mainnet.`}
                  </p>
                  <p className="font-mono text-[11px] text-fd-muted-foreground">
                    Real calls, a public RPC, no wallet.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col border-t border-(--ek-line) lg:border-t-0">
            <div className="flex items-center justify-between border-b border-(--ek-line) ps-4 pe-2 sm:ps-6">
              <p className="py-2.5 font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase">
                Code
              </p>
              <CopyButton
                text={plainCode}
                surface="playground"
                onCopied={() =>
                  track("code_copied", {
                    snippet_id: snippetId,
                    surface: "playground",
                    lines: plainCode.split("\n").length,
                  })
                }
              />
            </div>
            <div className="ek-code overflow-x-auto py-4 font-mono text-[12.5px]">
              {highlighted ? (
                // Shiki output from our server for the static snippets; the swapped input is escaped.
                // oxlint-disable-next-line react/no-danger
                <div dangerouslySetInnerHTML={{ __html: highlighted }} />
              ) : (
                <pre className="px-5 leading-[1.7] text-fd-muted-foreground">{plainCode}</pre>
              )}
            </div>
            <div className="flex items-center justify-between border-y border-(--ek-line) px-4 sm:px-6">
              <p className="py-2.5 font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase">
                Output
              </p>
              <p className="font-mono text-[11px] text-fd-muted-foreground">
                {running ? "running…" : (describeRun(outcome) ?? "not run yet")}
              </p>
            </div>
            <div className="max-h-96 min-h-40 flex-1 overflow-auto px-4 py-4 sm:px-6">
              {outcome ? (
                <JsonView value={outcome.json} />
              ) : (
                <p className="font-mono text-[12.5px] text-fd-muted-foreground/70">
                  {"// The response appears here, bigints as strings."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="pt-4 text-center font-mono text-[11px] tracking-[0.08em] text-fd-muted-foreground">
        Reads Ethereum mainnet through rpc.namespace.ninja · results cached for this visit
      </p>
    </section>
  );
}
