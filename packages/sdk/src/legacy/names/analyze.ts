import type { NormalizedName } from "../schemas/name.js";
import { normalizeName } from "./normalize.js";

export type NameKind = "root" | "top-level" | "second-level" | "subname";

export interface NameAnalysis {
  readonly name: NormalizedName;
  readonly labels: ReadonlyArray<string>;
  readonly depth: number;
  readonly kind: NameKind;
  readonly label: string | undefined;
  readonly parent: NormalizedName | undefined;
  readonly tld: string | undefined;
  readonly isEth: boolean;
  readonly isSecondLevel: boolean;
  readonly isSecondLevelEth: boolean;
  readonly ethSecondLevelLabel: string | undefined;
}

export const analyzeName = (name: NormalizedName): NameAnalysis => {
  const labels = Object.freeze(name === "" ? [] : name.split("."));
  const depth = labels.length;

  const kind: NameKind =
    depth === 0 ? "root" : depth === 1 ? "top-level" : depth === 2 ? "second-level" : "subname";

  const tld = labels.at(-1);
  const isEth = tld === "eth";
  const ethSecondLevelLabel = isEth && depth >= 2 ? labels.at(-2) : undefined;

  return Object.freeze({
    name,
    labels,
    depth,
    kind,
    label: labels[0],
    parent: depth === 0 ? undefined : normalizeName(labels.slice(1).join(".")),
    tld,
    isEth,
    isSecondLevel: depth === 2,
    isSecondLevelEth: isEth && depth === 2,
    ethSecondLevelLabel,
  });
};
