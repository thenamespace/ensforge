import { useEffect, useRef, useState } from "react";

import { FloorCards } from "./cards";
import { FloorCanvas } from "./floor-canvas";
import { type FloorLayout, placeFloor } from "./layout";

/**
 * The hero's background: an isometric floor of ENS names with component cards lying on it,
 * joined by coloured traces. It measures the hero and its headline block, then lays the cards in
 * the bands above and below the headline so the text stays clear. Rendered after mount only, since
 * every position depends on the measured size.
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

      setLayout(
        placeFloor(bounds.width, bounds.height, {
          left: Math.min(...boxes.map((box) => box.left)) - bounds.left,
          top: Math.min(...boxes.map((box) => box.top)) - bounds.top,
          right: Math.max(...boxes.map((box) => box.right)) - bounds.left,
          bottom: Math.max(...boxes.map((box) => box.bottom)) - bounds.top,
        }),
      );
    };

    const resize = new ResizeObserver(measure);
    resize.observe(element);
    void document.fonts.ready.then(measure);

    return () => resize.disconnect();
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="absolute inset-0">
      {layout ? (
        <>
          <FloorCanvas layout={layout} className="absolute inset-0 size-full" />
          <FloorCards cards={layout.cards} className="absolute inset-0" />
        </>
      ) : null}
    </div>
  );
}
