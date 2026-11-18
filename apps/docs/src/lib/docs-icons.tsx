import { createElement, type ReactNode } from "react";

import {
  Alert02Icon,
  Analytics01Icon,
  BookOpen01Icon,
  CloudServerIcon,
  CommandLineIcon,
  Compass01Icon,
  CpuIcon,
  Database01Icon,
  HierarchySquare01Icon,
  HistoryIcon,
  Key01Icon,
  Layers01Icon,
  LibraryIcon,
  Mailbox01Icon,
  PackageIcon,
  MailSend01Icon,
  Megaphone01Icon,
  PlugSocketIcon,
  ReactIcon,
  Rocket01Icon,
  ServerStack01Icon,
  Settings02Icon,
  Shield01Icon,
  SourceCodeIcon,
  TestTube01Icon,
  WaterfallDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/**
 * Docs icons by semantic name, for `icon:` in frontmatter and `meta.json`, separators
 * (`---[rocket]Getting started---`) and `<Icon name="..." />` in MDX. An explicit map keeps
 * the bundle to these icons; importing the whole set would ship thousands.
 */
const icons = {
  intro: BookOpen01Icon,
  install: PackageIcon,
  rocket: Rocket01Icon,
  guide: Compass01Icon,
  data: Database01Icon,
  messaging: Megaphone01Icon,
  send: MailSend01Icon,
  shield: Shield01Icon,
  ops: Analytics01Icon,
  deploy: ServerStack01Icon,
  runtime: CpuIcon,
  cluster: HierarchySquare01Icon,
  server: CloudServerIcon,
  providers: Mailbox01Icon,
  commands: CommandLineIcon,
  reference: LibraryIcon,
  config: Settings02Icon,
  errors: Alert02Icon,
  test: TestTube01Icon,
  key: Key01Icon,
  react: ReactIcon,
  plug: PlugSocketIcon,
  layers: Layers01Icon,
  stream: WaterfallDown01Icon,
  code: SourceCodeIcon,
  history: HistoryIcon,
} satisfies Record<string, IconSvgElement>;

export type DocsIconName = keyof typeof icons;

const isIconName = (name: string): name is DocsIconName => name in icons;

/** The icon for a docs name. An unknown name is an authoring mistake, so it fails the build. */
export function docsIcon(name: string | undefined): ReactNode {
  if (!name) return undefined;
  if (!isIconName(name)) throw new Error(`Unknown docs icon "${name}"`);

  return createElement(HugeiconsIcon, { icon: icons[name], size: 16, strokeWidth: 1.75 });
}

/** `<Icon name="rocket" />` in MDX, for Cards. */
export function Icon({ name }: { readonly name: DocsIconName }) {
  return docsIcon(name);
}
