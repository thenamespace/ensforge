import { useState } from "react";

import { ArrowUpRightIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { chainLabels, type ResultView } from "./examples";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** An avatar URL from a record, with the name's initial while it loads or when it fails. */
function Avatar({
  url,
  name,
  className,
}: {
  readonly url: string | null;
  readonly name: string;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = url !== null && failed !== url;

  return (
    <span
      className={cn(
        "ens-avatar relative grid shrink-0 place-items-center overflow-hidden rounded-full font-mono text-fd-foreground uppercase",
        className,
      )}
    >
      {name.slice(0, 1)}
      {showImage ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(url)}
        />
      ) : null}
    </span>
  );
}

function Missing({ children }: { readonly children: string }) {
  return <span className="font-mono text-sm text-fd-muted-foreground">{children}</span>;
}

/** The read drawn as an app would show it. */
export function ResultCard({ view }: { readonly view: ResultView }) {
  switch (view.kind) {
    case "profile":
      return (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar url={view.avatar} name={view.name} className="size-16 text-xl" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-xl font-light tracking-[-0.01em] text-fd-foreground">
                {view.name}
              </p>
              {view.address ? (
                <p className="font-mono text-xs text-fd-muted-foreground" title={view.address}>
                  {short(view.address)}
                </p>
              ) : (
                <Missing>no address</Missing>
              )}
            </div>
          </div>
          {view.description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-fd-muted-foreground">
              {view.description}
            </p>
          ) : null}
          {view.socials.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {view.socials.map((social) => (
                <li key={social.key}>
                  {social.href ? (
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer nofollow"
                      title={`${social.label}: ${social.value}`}
                      className="ens-chip inline-flex max-w-56 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors"
                    >
                      <span className="text-fd-muted-foreground">{social.label}</span>
                      <span className="truncate text-fd-foreground">{social.value}</span>
                      <ArrowUpRightIcon aria-hidden="true" className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="ens-chip inline-flex max-w-56 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px]">
                      <span className="text-fd-muted-foreground">{social.label}</span>
                      <span className="truncate text-fd-foreground">{social.value}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="grid grid-cols-3 border-t border-(--ek-line) pt-4">
            {view.facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1">
                <dt className="font-mono text-[10px] tracking-[0.12em] text-fd-muted-foreground uppercase">
                  {fact.label}
                </dt>
                <dd className="font-mono text-xs text-fd-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "address":
      return (
        <div className="flex flex-col gap-4">
          <p className="font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase">
            {view.name} on {chainLabels[view.chain]}
          </p>
          {view.address ? (
            <p className="font-mono text-base break-all text-fd-foreground sm:text-lg">
              {view.address}
            </p>
          ) : (
            <Missing>{`No ${chainLabels[view.chain]} address set: the action returns null.`}</Missing>
          )}
        </div>
      );
    case "primaryName":
      return (
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs break-all text-fd-muted-foreground">{view.address}</p>
          {view.name ? (
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="font-mono text-ek-accent">
                →
              </span>
              <p className="text-2xl font-light tracking-[-0.02em] text-fd-foreground">
                {view.name}
              </p>
              <span className="rounded border border-(--ek-line-strong) px-1.5 py-0.5 font-mono text-[10px] text-fd-muted-foreground">
                {chainLabels[view.chain]} · verified
              </span>
            </div>
          ) : (
            <Missing>No primary name on this chain: the action returns null.</Missing>
          )}
        </div>
      );
    case "avatar":
      return (
        <div className="flex items-center gap-5">
          <Avatar url={view.url} name={view.name} className="size-24 text-3xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-lg font-light text-fd-foreground">{view.name}</p>
            {view.url ? (
              <p className="font-mono text-[11px] break-all text-fd-muted-foreground">{view.url}</p>
            ) : (
              <Missing>No avatar set.</Missing>
            )}
          </div>
        </div>
      );
    // "batch", the last kind.
    default:
      return (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.12em] text-fd-muted-foreground uppercase">
            {view.name} · {view.rows.length} reads, one batch
          </p>
          <ul className="flex flex-col divide-y divide-(--ek-line) border-y border-(--ek-line)">
            {view.rows.map((row) => (
              <li key={row.key} className="flex items-center gap-3 py-2.5 font-mono text-xs">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", row.ok ? "bg-ek-live" : "bg-ek-fail")}
                />
                <span className="w-16 shrink-0 text-fd-muted-foreground">{row.key}</span>
                <span className="min-w-0 truncate text-fd-foreground" title={row.value}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}
