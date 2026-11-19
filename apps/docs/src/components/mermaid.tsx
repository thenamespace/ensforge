import { useEffect, useId, useState } from "react";

const fontFamily = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';

/*
 * Mermaid parses these with its own colour library, which does not understand oklch(), so they
 * are hex approximations of the dark site tokens. The brand accent is applied in `themeCSS`
 * with the live `--ek-accent`.
 */
const themeVariables = {
  darkMode: true,
  background: "transparent",
  fontFamily,
  fontSize: "14px",
  primaryColor: "#1b1d22",
  primaryBorderColor: "#4a8dff",
  primaryTextColor: "#f4f4f5",
  secondaryColor: "#202329",
  secondaryBorderColor: "#3a3d45",
  secondaryTextColor: "#f4f4f5",
  tertiaryColor: "#16181c",
  tertiaryBorderColor: "#2e3138",
  tertiaryTextColor: "#d4d4d8",
  lineColor: "#7a7f8a",
  textColor: "#e4e4e7",
  mainBkg: "#1b1d22",
  nodeBorder: "#4a8dff",
  clusterBkg: "#16181c",
  clusterBorder: "#2e3138",
  titleColor: "#f4f4f5",
  edgeLabelBackground: "#16181c",
  noteBkgColor: "#1d2433",
  noteBorderColor: "#4a8dff",
  noteTextColor: "#e4e4e7",
  actorBkg: "#1b1d22",
  actorBorder: "#4a8dff",
  actorTextColor: "#f4f4f5",
  actorLineColor: "#3a3d45",
  signalColor: "#a1a1aa",
  signalTextColor: "#e4e4e7",
  labelBoxBkgColor: "#1b1d22",
  labelBoxBorderColor: "#4a8dff",
  labelTextColor: "#f4f4f5",
  loopTextColor: "#d4d4d8",
  activationBkgColor: "#25364f",
  activationBorderColor: "#4a8dff",
  sequenceNumberColor: "#09090b",
  stateBkg: "#1b1d22",
  stateLabelColor: "#f4f4f5",
  altBackground: "#16181c",
  compositeBackground: "#16181c",
  compositeBorder: "#2e3138",
  compositeTitleBackground: "#1b1d22",
  transitionColor: "#7a7f8a",
  transitionLabelColor: "#e4e4e7",
  specialStateColor: "#4a8dff",
  innerEndBackground: "#4a8dff",
};

const themeCSS = `
  .node rect, .node polygon, .node circle, .node ellipse, .node path { rx: 10px; ry: 10px; stroke-width: 1.25px; }
  .node.default > rect, .basic.label-container, .statediagram-state rect.basic { rx: 10px; ry: 10px; }
  .node rect, .actor, .statediagram-state rect { stroke: var(--ek-accent); }
  .cluster rect { rx: 14px; ry: 14px; stroke-dasharray: 4 4; }
  .edgePath .path, .flowchart-link, .transition { stroke-width: 1.5px; }
  .edgeLabel, .edgeLabel p { padding: 2px 6px; border-radius: 6px; }
  .actor { rx: 8px; ry: 8px; stroke-width: 1.25px; }
  .actor-line { stroke-dasharray: 3 4; }
  .messageLine0, .messageLine1 { stroke-width: 1.5px; }
  .activation0, .activation1, .activation2 { rx: 3px; ry: 3px; stroke: var(--ek-accent); }
  .note { rx: 8px; ry: 8px; stroke: var(--ek-accent); }
  .loopLine { stroke: var(--ek-accent); stroke-dasharray: 5 4; opacity: 0.7; }
  .labelBox { rx: 6px; ry: 6px; stroke: var(--ek-accent); }
  .messageText, .noteText, .loopText, .labelText { font-weight: 450; }
  #arrowhead path, #crosshead path, .arrowMarkerPath { fill: #a1a1aa; stroke: #a1a1aa; }
  .state-start, .state-end circle { fill: var(--ek-accent); }
`;

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
        fontFamily,
        themeVariables,
        themeCSS,
        flowchart: {
          htmlLabels: true,
          curve: "basis",
          padding: 16,
          nodeSpacing: 48,
          rankSpacing: 56,
        },
        sequence: {
          actorMargin: 56,
          boxMargin: 12,
          messageMargin: 36,
          noteMargin: 12,
          mirrorActors: false,
          useMaxWidth: false,
          wrap: true,
        },
        state: { padding: 12 },
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
  return (
    <div
      className="my-6 overflow-x-auto rounded-xl border border-fd-border bg-fd-card/40 p-4 sm:p-6 [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:min-w-[28rem]"
      // oxlint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
