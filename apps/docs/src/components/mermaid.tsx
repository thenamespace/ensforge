import { useEffect, useId, useState } from "react";

/**
 * A Mermaid diagram from a ```mermaid code block, rendered in the browser (Mermaid needs the DOM)
 * in the site's dark palette. The `.md` version of the page keeps the source.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "inherit",
        themeVariables: {
          darkMode: true,
          background: "transparent",
          primaryColor: "#141414",
          primaryBorderColor: "#3a3a3a",
          primaryTextColor: "#f8f8f8",
          lineColor: "#6b6b6b",
          secondaryColor: "#1c1c1c",
          tertiaryColor: "#101010",
        },
      });
      const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart);
      if (!cancelled) setSvg(rendered);
    };
    void render();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (svg === undefined) {
    return <pre className="my-6 overflow-x-auto text-sm text-fd-muted-foreground">{chart}</pre>;
  }

  // Mermaid sanitises its own output with `securityLevel: "strict"`.
  // oxlint-disable-next-line react/no-danger
  return <div className="my-6 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}
