import { Suspense, use } from "react";

import { DocsBody } from "fumadocs-ui/layouts/spacious/page";

import { useMDXComponents } from "@/components/mdx";
import { legal } from "@/lib/source";

import { Container } from "./section";

export interface LegalData {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly updated: string;
}

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

function Body({ path }: { readonly path: string }) {
  const page = legal.getPage(path);
  if (!page) throw new Error(`Unknown legal page: ${path}`);

  use(page.load());
  const MDX = page.body;

  return (
    <DocsBody>
      <MDX components={useMDXComponents()} />
    </DocsBody>
  );
}

/** A terms or privacy page: header with the update date, then the MDX body in a readable column. */
export function LegalPage({ data }: { readonly data: LegalData }) {
  const { title, description, updated, path } = data;

  return (
    <Container className="max-w-2xl py-16 md:py-24">
      <header className="mb-10 flex flex-col gap-3 border-b border-(--ek-line) pb-8">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="text-lg text-fd-muted-foreground">{description}</p>
        <p className="font-mono text-xs text-fd-muted-foreground">
          Last updated{" "}
          <time dateTime={updated}>{dateFormat.format(new Date(`${updated}T00:00:00Z`))}</time>
        </p>
      </header>
      <Suspense>
        <Body path={path} />
      </Suspense>
    </Container>
  );
}
