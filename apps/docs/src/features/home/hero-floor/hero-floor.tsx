import { useEffect, useRef, useState } from "react";

import { useInView, useReducedMotion } from "@/components/marketing/hooks";

import { StoryCards } from "./cards";
import { FloorCanvas, type StoryClock } from "./floor-canvas";
import { type FloorLayout, placeFloor } from "./layout";
import { phoneStories, STORY_MS, stories } from "./stories";

/**
 * The hero's background: an isometric floor of ENS names, with story cards standing above it.
 * It measures the hero and its headline block, places the cards in the bands above and below the
 * headline, and moves to the next story every few seconds while the hero is on screen. Rendered
 * after mount only, since every position depends on the measured size.
 */
export function HeroFloor() {
  const root = useRef<HTMLDivElement>(null);
  const clock = useRef<StoryClock>({ start: 0, accents: [] });
  const [layout, setLayout] = useState<FloorLayout>();
  const [turn, setTurn] = useState(0);
  const inView = useInView(root);
  const reduced = useReducedMotion();

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

  useEffect(() => {
    if (!inView || reduced) return undefined;

    const timer = window.setInterval(() => setTurn((value) => value + 1), STORY_MS);

    return () => window.clearInterval(timer);
  }, [inView, reduced]);

  const list = layout?.compact ? phoneStories : stories;
  const story = list[turn % list.length] ?? stories[0];
  const cards = layout?.compact ? story?.cards.slice(2) : story?.cards;

  // The canvas times its pulses from the start of each story and colours traces by its cards.
  const compact = layout?.compact ?? false;
  useEffect(() => {
    const shown = compact ? story?.cards.slice(2) : story?.cards;
    clock.current = { start: performance.now(), accents: shown?.map((card) => card.accent) ?? [] };
  }, [story, compact]);

  return (
    <div ref={root} aria-hidden="true" className="absolute inset-0">
      {layout && story && cards ? (
        <>
          <FloorCanvas layout={layout} clock={clock} className="absolute inset-0 size-full" />
          <StoryCards
            slots={layout.slots}
            cards={cards}
            storyId={story.id}
            className="absolute inset-0"
          />
        </>
      ) : null}
    </div>
  );
}
