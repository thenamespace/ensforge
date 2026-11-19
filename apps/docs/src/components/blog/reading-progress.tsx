import { type RefObject, useEffect, useRef } from "react";

/**
 * A hairline under the sticky header that fills as the article is read. Updated through a CSS
 * variable on scroll, so reading never re-renders the page.
 */
export function ReadingProgress({ target }: { readonly target: RefObject<HTMLElement | null> }) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const element = target.current;
      if (!element || !bar.current) return;

      const { top, height } = element.getBoundingClientRect();
      const total = height - window.innerHeight;
      const progress = total <= 0 ? 1 : Math.min(1, Math.max(0, -top / total));

      bar.current.style.setProperty("--progress", progress.toFixed(4));
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [target]);

  return (
    <div aria-hidden="true" className="pointer-events-none sticky top-15 z-30 h-px">
      <div ref={bar} className="ek-blog-progress h-px w-full bg-ek-accent" />
    </div>
  );
}
