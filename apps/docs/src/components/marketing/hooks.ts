import { type RefObject, useEffect, useState, useSyncExternalStore } from "react";

import { track } from "@/lib/analytics/client";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

/** `true` when the user asked for reduced motion. Always `false` during SSR. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

/** Tracks whether an element is in the viewport. */
export function useInView(
  ref: RefObject<Element | null>,
  { rootMargin = "0px", threshold = 0, once = false } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? false;
        setInView(visible);

        if (visible && once) observer.disconnect();
      },
      { rootMargin, threshold },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, rootMargin, threshold, once]);

  return inView;
}

/** Section ids already reported on this page view, so a section counts once however often it re-enters. */
const reportedSections = new Set<string>();
let lastPath = "";

/** Sends `section_viewed` once per page view, when half of the section is visible. */
export function useSectionView(ref: RefObject<Element | null>, id: string | undefined) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !id) return undefined;

    // A client navigation is a new page view.
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      reportedSections.clear();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || reportedSections.has(id)) return;

        // A section taller than two viewports can never be half visible, so half the viewport counts too.
        const half =
          entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight / 2;
        if (!half) return;

        const sections = [...document.querySelectorAll("section[data-section]")];
        reportedSections.add(id);
        track("section_viewed", { section_id: id, section_index: sections.indexOf(element) });
        observer.disconnect();
      },
      { threshold: Array.from({ length: 11 }, (_, i) => i / 10) },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, id]);
}
