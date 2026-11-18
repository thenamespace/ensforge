import { type ReactNode, useState } from "react";

import { Link01Icon, Linkedin01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { XIcon } from "@/components/icons/x-icon";
import { track } from "@/lib/analytics/client";
import type { AnalyticsEvents } from "@/lib/analytics/events";
import { absolute, site } from "@/lib/site";

type Network = AnalyticsEvents["blog_share_clicked"]["network"];

const button =
  "grid size-9 place-items-center rounded-md border border-(--ek-line-strong) text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring";

/** Share links that open each network's own composer, plus copying the post's link. */
export function ShareLinks({
  slug,
  title,
  path,
}: {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = absolute(path);
  const text = site.twitter ? `${title} ${site.twitter}` : title;

  const networks: readonly { network: Network; label: string; href: string; icon: ReactNode }[] = [
    {
      network: "x",
      label: "Share on X",
      href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      icon: <XIcon className="size-3.5" />,
    },
    {
      network: "linkedin",
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      icon: <HugeiconsIcon icon={Linkedin01Icon} size={16} strokeWidth={1.6} />,
    },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track("blog_share_clicked", { slug, network: "copy" });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      track("copy_failed", { surface: "blog_share" });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {networks.map((item) => (
        <a
          key={item.network}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("blog_share_clicked", { slug, network: item.network })}
          className={button}
        >
          {item.icon}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        title={copied ? "Link copied" : "Copy link"}
        aria-label={copied ? "Link copied" : "Copy link"}
        className={button}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Link01Icon}
          size={16}
          strokeWidth={1.6}
          className={copied ? "text-ek-accent" : undefined}
        />
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
