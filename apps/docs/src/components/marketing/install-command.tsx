import { useState, useSyncExternalStore } from "react";

import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

import { CopyButton } from "./copy-button";

const managers = {
  pnpm: "pnpm add",
  npm: "npm install",
  bun: "bun add",
  yarn: "yarn add",
} as const;

type Manager = keyof typeof managers;

const isManager = (value: string): value is Manager => Object.hasOwn(managers, value);

const STORAGE_KEY = "ensforge:package-manager";
const CHANGE_EVENT = "ensforge:package-manager";

/** The preferred package manager, shared by every install command and remembered. */
const managerStore = {
  subscribe: (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);

    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  },
  get: (): Manager => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && isManager(saved) ? saved : "pnpm";
  },
  set: (manager: Manager) => {
    window.localStorage.setItem(STORAGE_KEY, manager);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
};

export interface InstallOption {
  readonly id: string;
  readonly label: string;
  /** Packages after the add command, e.g. `@ensforge/sdk effect viem`. */
  readonly packages: string;
}

/** Install command with package manager tabs (remembered) and an optional package picker. */
export function InstallCommand({
  options,
  className,
}: {
  readonly options: readonly InstallOption[];
  readonly className?: string;
}) {
  const manager = useSyncExternalStore(
    managerStore.subscribe,
    managerStore.get,
    // The server can't read localStorage, so it renders the default manager.
    () => "pnpm" as const,
  );
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");

  const option = options.find((entry) => entry.id === optionId) ?? options[0];
  const command = `${managers[manager]} ${option?.packages ?? ""}`;

  return (
    <div
      className={cn(
        "w-full max-w-xl overflow-hidden rounded-lg border border-(--ek-line-strong) bg-fd-card/70",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-(--ek-line) px-1.5">
        <div role="tablist" aria-label="Package manager" className="flex">
          {Object.keys(managers)
            .filter(isManager)
            .map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === manager}
                onClick={() => {
                  if (entry !== manager) {
                    track("package_manager_selected", {
                      package_manager: entry,
                      previous: manager,
                    });
                  }

                  managerStore.set(entry);
                }}
                className={cn(
                  "relative px-2.5 py-2 font-mono text-[11px] transition-colors",
                  entry === manager
                    ? "text-fd-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-px after:bg-ek-accent"
                    : "text-fd-muted-foreground hover:text-fd-foreground",
                )}
              >
                {entry}
              </button>
            ))}
        </div>
        {options.length > 1 ? (
          <div role="tablist" aria-label="Package" className="flex gap-1 pe-1">
            {options.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === option?.id}
                onClick={() => setOptionId(entry.id)}
                className={cn(
                  "rounded px-2 py-1 font-mono text-[11px] transition-colors",
                  entry.id === option?.id
                    ? "bg-fd-accent text-fd-foreground"
                    : "text-fd-muted-foreground hover:text-fd-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3 py-3 ps-4 pe-2">
        <span aria-hidden="true" className="font-mono text-[13px] text-ek-accent">
          $
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fd-foreground">
          {command}
        </code>
        <CopyButton
          text={command}
          label="Copy install command"
          surface="install_command"
          onCopied={() =>
            track("install_command_copied", {
              package_manager: manager,
              packages: option?.packages ?? "",
              option_id: option?.id ?? "",
            })
          }
        />
      </div>
    </div>
  );
}
