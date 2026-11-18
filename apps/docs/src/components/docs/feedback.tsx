import { useState } from "react";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { track } from "@/lib/analytics/client";
import type { DocsFeedbackReason } from "@/lib/analytics/events";

const reasons: readonly { readonly id: DocsFeedbackReason; readonly label: string }[] = [
  { id: "missing_information", label: "Missing information" },
  { id: "hard_to_follow", label: "Hard to follow" },
  { id: "code_failed", label: "Code did not work" },
  { id: "outdated", label: "Out of date" },
  { id: "other", label: "Something else" },
];

const button = buttonVariants({
  variant: "secondary",
  size: "sm",
  className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
});

type Step = "ask" | "reason" | "done";

/**
 * "Was this page helpful?" at the end of a docs page. Answers are anonymous events with fixed
 * values, never free text. Remount it per page (`key`) so each page asks again.
 */
export function DocsFeedback({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>("ask");

  const answer = (helpful: boolean) => {
    track("docs_feedback_submitted", { slug, helpful });
    setStep(helpful ? "done" : "reason");
  };

  const explain = (reason: DocsFeedbackReason) => {
    track("docs_feedback_reason_selected", { slug, reason });
    setStep("done");
  };

  return (
    <section
      aria-label="Page feedback"
      className="mt-12 flex flex-col gap-3 border-t pt-6 text-sm text-fd-muted-foreground"
    >
      {step === "ask" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>Was this page helpful?</p>
          <div className="flex gap-2">
            <button type="button" className={button} onClick={() => answer(true)}>
              <ThumbsUp aria-hidden="true" />
              Yes
            </button>
            <button type="button" className={button} onClick={() => answer(false)}>
              <ThumbsDown aria-hidden="true" />
              No
            </button>
          </div>
        </div>
      ) : step === "reason" ? (
        <div className="flex flex-col gap-2">
          <p>What was wrong with it?</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <button
                key={reason.id}
                type="button"
                className={button}
                onClick={() => explain(reason.id)}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <output>Thanks for the feedback.</output>
      )}
    </section>
  );
}
