"use client";

import { useRef, type ReactNode } from "react";

import { RegistryContext, RegistryProvider } from "@effect/atom-react";
import type { AtomRegistry } from "effect/reactivity";

import type { CreateConfigParameters } from "@ensforge/core/legacy";
import { createIndexedDbWorkflowStorage } from "@ensforge/core/legacy/storage/browser";

import { Ensforge } from "../legacy/ensforge.js";
import {
  createEnsforge as createWagmiEnsforge,
  type CreateWagmiConfigParameters,
} from "../legacy/wagmi.js";
import {
  EnsforgeReactContext,
  type EnsforgeReactContextValue,
  type EnsforgeReactDefaults,
} from "./context.js";

interface SharedEnsforgeProviderProps {
  readonly children?: ReactNode;
  readonly defaultIdleTTL?: number;
  readonly defaults?: EnsforgeReactDefaults;
  readonly registry?: AtomRegistry.AtomRegistry;
}

export type EnsforgeProviderProps = SharedEnsforgeProviderProps &
  (
    | {
        readonly config: CreateConfigParameters | CreateWagmiConfigParameters;
        readonly sdk?: never;
      }
    | {
        readonly config?: never;
        readonly sdk: Ensforge;
      }
  );

export const EnsforgeProvider = (props: EnsforgeProviderProps) => {
  const valueRef = useRef<EnsforgeReactContextValue | undefined>(undefined);

  if (valueRef.current === undefined) {
    valueRef.current = Object.freeze({
      defaults: Object.freeze(props.defaults ?? {}),
      sdk:
        props.sdk ??
        ("wagmiConfig" in props.config
          ? createWagmiEnsforge({
              ...props.config,
              storage: props.config.storage ?? createIndexedDbWorkflowStorage(),
            })
          : new Ensforge({
              ...props.config,
              storage: props.config.storage ?? createIndexedDbWorkflowStorage(),
            })),
    });
  }

  const children = (
    <EnsforgeReactContext.Provider value={valueRef.current}>
      {props.children}
    </EnsforgeReactContext.Provider>
  );

  return props.registry === undefined ? (
    <RegistryProvider defaultIdleTTL={props.defaultIdleTTL}>{children}</RegistryProvider>
  ) : (
    <RegistryContext.Provider value={props.registry}>{children}</RegistryContext.Provider>
  );
};
