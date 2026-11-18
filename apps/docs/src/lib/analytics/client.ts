import type { CaptureResult, PostHog } from "posthog-js";

import { getPackage } from "@/lib/packages";

import { analyticsConfig } from "./config";
import type { AnalyticsEvent, AnalyticsEvents } from "./events";

/**
 * PostHog in the browser: loaded after hydration, only on the production site, so development,
 * previews and forks send nothing. Until it loads, events wait in a small queue.
 */

let posthog: PostHog | undefined;
let started = false;
const queue: (() => void)[] = [];

const isEnabled = () =>
  import.meta.env.PROD &&
  analyticsConfig.key !== "" &&
  typeof window !== "undefined" &&
  window.location.hostname === analyticsConfig.productionHost;

async function load() {
  const { default: client } = await import("posthog-js");

  client.init(analyticsConfig.key, {
    api_host: analyticsConfig.host,
    ui_host: analyticsConfig.uiHost,
    defaults: "2026-08-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
    // No cookies or storage: visitors are counted with PostHog's server-side hash instead.
    cookieless_mode: "always",
    respect_dnt: true,
    autocapture: {
      dom_event_allowlist: ["click", "change", "submit"],
      element_allowlist: ["a", "button"],
      css_selector_allowlist: ["[data-ph]"],
      capture_copied_text: true,
    },
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: true },
    capture_dead_clicks: true,
    disable_surveys: true,
    // Replay needs a client session id, which cookieless mode does not keep.
    disable_session_recording: true,
    before_send: withPageContext,
  });

  posthog = client;
  for (const send of queue.splice(0)) send();
}

/** Starts analytics once, when the browser is idle after hydration. Safe to call repeatedly. */
export function startAnalytics() {
  if (started || !isEnabled()) return;
  started = true;

  // Animated pages may never go idle, so the deadline makes sure analytics starts anyway.
  if ("requestIdleCallback" in window)
    window.requestIdleCallback(() => void load(), { timeout: 2000 });
  else setTimeout(() => void load(), 1);
}

/** Sends a product event from the catalogue in `events.ts`. A no-op where analytics is off. */
export function track<E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]) {
  // In development, events are announced on `window` so they can be checked in a browser.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ensforge:track", { detail: { event, properties } }));
  }

  if (!isEnabled()) return;

  const send = () => posthog?.capture(event, properties);

  if (posthog) send();
  else queue.push(send);
}

/** Reports an error to error tracking. A no-op where analytics is off. */
export function captureError(error: unknown, properties: Record<string, unknown> = {}) {
  if (!isEnabled()) return;

  const send = () => posthog?.captureException(error, properties);

  if (posthog) send();
  else queue.push(send);
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * Adds where and how the event happened, computed when it is sent rather than registered once,
 * so a pageview fired by a client navigation carries the new page's context. Also samples web
 * vitals to half and keeps search queries short and free of email addresses.
 */
function withPageContext(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;

  if (event.event === "$web_vitals" && Math.random() >= 0.5) return null;

  const properties = event.properties;
  const path = window.location.pathname;

  properties["site_section"] =
    path.startsWith("/docs/") && path.includes("/changelog")
      ? "changelog"
      : path.startsWith("/docs")
        ? "docs"
        : path === "/blog" || path.startsWith("/blog/")
          ? "blog"
          : "landing";
  properties["page_package"] = packageOf(path);
  properties["viewport"] =
    window.innerWidth < 640 ? "phone" : window.innerWidth < 1024 ? "tablet" : "desktop";
  properties["reduced_motion"] = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  properties["release"] = import.meta.env.VITE_RELEASE;

  if (event.event === "docs_search_performed") {
    const query = String(properties["query"] ?? "")
      .trim()
      .slice(0, 100);
    properties["query"] = EMAIL.test(query) ? "[redacted]" : query;
  }

  return event;
}

function packageOf(path: string) {
  const [first, second] = path.split("/").filter(Boolean);

  return (first === "docs" ? getPackage(second)?.slug : undefined) ?? "site";
}
