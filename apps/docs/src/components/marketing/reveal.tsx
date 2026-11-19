import { useEffect } from "react";

/**
 * Fades `[data-reveal]` elements in as they enter the viewport. Content is visible by
 * default; the page only opts into hiding once this has run, so SSR and no-JS stay readable.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          entry.target.dataset.reveal = "shown";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    for (const target of targets) {
      const rect = target.getBoundingClientRect();

      // Already on screen at load: leave it visible instead of flashing it out and back in.
      if (rect.top < window.innerHeight) continue;

      target.dataset.reveal = "hidden";
      observer.observe(target);
    }
    root.classList.add("ek-js");

    return () => observer.disconnect();
  }, []);

  return null;
}
