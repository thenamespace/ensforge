import type { ComponentType } from "react";

import {
  Alert02Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  DatabaseIcon,
  Edit02Icon,
  Image01Icon,
  Layers01Icon,
  LibraryIcon,
  Location01Icon,
  PackageIcon,
  Robot01Icon,
  SourceCodeIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "fumadocs-core/link";

import {
  ContractsLogo,
  EnsforgeLogo,
  HcaLogo,
  type LogoProps,
  ReactLogo,
  SdkLogo,
} from "@/components/logos";
import { CopyButton } from "@/components/marketing/copy-button";
import { cn } from "@/lib/cn";

const installCommand = "pnpm add @ensforge/sdk viem effect";

const packageCards: readonly {
  readonly slug: string;
  readonly name: string;
  readonly badge?: string;
  readonly Logo: ComponentType<LogoProps>;
  readonly description: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}[] = [
  {
    slug: "sdk",
    name: "SDK",
    Logo: SdkLogo,
    description: "Look up, register and manage ENS names with typed actions and typed errors.",
    links: [
      { label: "Quick start", href: "/docs/sdk" },
      { label: "Get an address", href: "/docs/sdk/get-an-address" },
      { label: "API reference", href: "/docs/reference/sdk" },
    ],
  },
  {
    slug: "react",
    name: "React",
    Logo: ReactLogo,
    description: "Hooks for reading names and sending writes, with caching and Suspense built in.",
    links: [
      { label: "Quick start", href: "/docs/react" },
      { label: "Set up the provider", href: "/docs/react/set-up-the-provider" },
      { label: "API reference", href: "/docs/reference/react" },
    ],
  },
  {
    slug: "hca",
    name: "HCA",
    badge: "Experimental",
    Logo: HcaLogo,
    description: "Hosted contract accounts that let an ENS name act onchain through executors.",
    links: [
      { label: "Quick start", href: "/docs/hca" },
      { label: "How it works", href: "/docs/hca/how-it-works" },
      { label: "API reference", href: "/docs/reference/hca" },
    ],
  },
  {
    slug: "contracts",
    name: "Contracts",
    Logo: ContractsLogo,
    description: "ENS ABIs, addresses and interface ids for any chain, with no runtime lock-in.",
    links: [
      { label: "Quick start", href: "/docs/contracts" },
      { label: "Use ABIs with viem", href: "/docs/contracts/use-abis-with-viem" },
      { label: "API reference", href: "/docs/reference/contracts" },
    ],
  },
];

const tasks: readonly { label: string; href: string; icon: IconSvgElement }[] = [
  { label: "Get a name's address", href: "/docs/sdk/get-an-address", icon: Location01Icon },
  { label: "Get an avatar", href: "/docs/sdk/get-an-avatar", icon: Image01Icon },
  { label: "Get the name for an address", href: "/docs/sdk/get-a-primary-name", icon: UserIcon },
  { label: "Register a name", href: "/docs/sdk/register-a-name", icon: PackageIcon },
  { label: "Set records", href: "/docs/sdk/set-records", icon: Edit02Icon },
  { label: "Look up many at once", href: "/docs/sdk/look-up-many-at-once", icon: Layers01Icon },
  { label: "Connect an indexer", href: "/docs/sdk/connect-an-indexer", icon: DatabaseIcon },
  { label: "Handle errors", href: "/docs/sdk/handle-errors", icon: Alert02Icon },
];

const deeper: readonly {
  label: string;
  description: string;
  href: string;
  icon: IconSvgElement;
}[] = [
  {
    label: "API reference",
    description: "Every action, hook and error code.",
    href: "/docs/reference",
    icon: LibraryIcon,
  },
  {
    label: "Migration guides",
    description: "Move from ensjs, viem or ensforge 0.x.",
    href: "/docs/sdk/from-ensjs",
    icon: BookOpen01Icon,
  },
  {
    label: "Effect API",
    description: "Typed errors, services and streams.",
    href: "/docs/sdk/effect-api",
    icon: SourceCodeIcon,
  },
  {
    label: "Use with AI agents",
    description: "llms.txt, Markdown pages and AGENTS.md.",
    href: "/docs/sdk/use-with-ai-agents",
    icon: Robot01Icon,
  },
];

const cardClass =
  "group rounded-xl border border-(--ek-line-strong) bg-fd-card/60 transition-colors hover:border-ek-accent/50 hover:bg-fd-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring";

function SectionHeading({ children }: { readonly children: string }) {
  return (
    <h2 className="mt-12 mb-4 font-mono text-xs font-medium tracking-widest text-fd-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function Hero() {
  return (
    <section className="not-prose rounded-2xl border border-(--ek-line-strong) bg-fd-card/40 p-6 sm:p-8">
      <div className="grid gap-8">
        <div>
          <EnsforgeLogo className="size-10" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-fd-foreground sm:text-4xl">
            The SDK for ENS
          </h1>
          <p className="mt-3 max-w-md text-fd-muted-foreground">
            Read and manage Ethereum Name Service names from TypeScript, with typed errors and
            nothing to configure twice.
          </p>
          <div className="mt-6 flex max-w-md items-center gap-3 rounded-lg border border-(--ek-line-strong) bg-fd-background/60 py-1.5 ps-4 pe-1.5">
            <span aria-hidden="true" className="font-mono text-[13px] text-ek-accent">
              $
            </span>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-fd-foreground">
              {installCommand}
            </code>
            <CopyButton text={installCommand} label="Copy install command" surface="docs_home" />
          </div>
        </div>
        <figure className="min-w-0 overflow-hidden rounded-lg border border-(--ek-line-strong) bg-fd-background/60 font-mono text-[12.5px] leading-6">
          <pre className="overflow-x-auto px-4 py-3 text-fd-foreground">
            <code>{`const ens = Ensforge.create({ publicClient }).extend(ensActions());

const address = await ens.record.getAddress({ name: "nick.eth" });`}</code>
          </pre>
          <figcaption className="border-t border-(--ek-line) px-4 py-2 text-fd-muted-foreground">
            <span className="text-ek-accent">{"→ "}</span>
            0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function PackageCard({ pkg }: { readonly pkg: (typeof packageCards)[number] }) {
  return (
    <div data-accent={pkg.slug} className={cn(cardClass, "flex flex-col p-5")}>
      <div className="flex items-center gap-3">
        <pkg.Logo className="size-7 text-ek-accent" />
        <span className="text-lg font-semibold text-fd-foreground">{pkg.name}</span>
        {pkg.badge ? (
          <span className="rounded-full border border-ek-accent/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ek-accent uppercase">
            {pkg.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-3 flex-1 text-sm text-fd-muted-foreground">{pkg.description}</p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {pkg.links.map((link, index) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={cn(
                "inline-flex items-center gap-1 rounded outline-none hover:text-ek-accent focus-visible:ring-2 focus-visible:ring-fd-ring",
                index === 0 ? "font-medium text-ek-accent" : "text-fd-foreground",
              )}
            >
              {link.label}
              {index === 0 ? <HugeiconsIcon icon={ArrowRight01Icon} size={14} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The `/docs` landing: what ensforge is, the packages, common tasks and where to go deeper. */
export function DocsHome() {
  return (
    <div className="not-prose">
      <Hero />

      <SectionHeading>Packages</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        {packageCards.map((pkg) => (
          <PackageCard key={pkg.slug} pkg={pkg} />
        ))}
      </div>

      <SectionHeading>Start with a task</SectionHeading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tasks.map((task) => (
          <Link
            key={task.href}
            href={task.href}
            className={cn(
              cardClass,
              "flex flex-col gap-3 p-4 text-sm font-medium text-fd-foreground outline-none",
            )}
          >
            <HugeiconsIcon
              icon={task.icon}
              size={18}
              strokeWidth={1.75}
              className="text-ek-accent"
            />
            {task.label}
          </Link>
        ))}
      </div>

      <SectionHeading>Go deeper</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {deeper.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(cardClass, "flex gap-3 p-4 outline-none")}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-fd-muted-foreground group-hover:text-ek-accent"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fd-foreground">{item.label}</span>
              <span className="mt-0.5 block text-xs text-fd-muted-foreground">
                {item.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
