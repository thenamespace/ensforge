import { useEffect, useRef, useState } from "react";

import { FloorCanvas } from "./floor-canvas";
import type { FloorLayout } from "./layout";

/**
 * The hero's background: an isometric floor where ENS names rise up, hold and sink away. It
 * measures the hero and its headline block so the names keep clear of the text. Rendered after
 * mount only, since every position depends on the measured size.
 */
export function HeroFloor() {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<FloorLayout>();

  useEffect(() => {
    const element = root.current;
    const hero = element?.parentElement;
    if (!element || !hero) return undefined;

    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const content = hero.querySelector("[data-hero-content]");
      const boxes = [...(content?.children ?? [])].map((child) => child.getBoundingClientRect());
      if (bounds.width === 0 || boxes.length === 0) return;

      setLayout({
        width: bounds.width,
        height: bounds.height,
        compact: bounds.width < 768,
        clear: {
          left: Math.min(...boxes.map((box) => box.left)) - bounds.left,
          top: Math.min(...boxes.map((box) => box.top)) - bounds.top,
          right: Math.max(...boxes.map((box) => box.right)) - bounds.left,
          bottom: Math.max(...boxes.map((box) => box.bottom)) - bounds.top,
        },
      });
    };

    const resize = new ResizeObserver(measure);
    resize.observe(element);
    void document.fonts.ready.then(measure);

    return () => resize.disconnect();
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="absolute inset-0">
      {layout ? <FloorCanvas layout={layout} className="absolute inset-0 size-full" /> : null}
    </div>
  );
}
