export interface WorkflowParameters {
  /** Optional explicit instance. Otherwise unfinished work is matched by normalized inputs. */
  readonly workflowId?: string;
}

export interface WorkflowProgress {
  readonly workflowId?: string;
  readonly workflowRevision?: number;
}

export interface WorkflowSnapshot {
  readonly workflowId: string;
  readonly revision: number;
  readonly operation: string;
  readonly chainId: number;
  readonly account: string;
  readonly status: "pending" | "completed";
  readonly busyUntil: number | null;
  readonly progress: unknown;
  readonly submissions: ReadonlyArray<{
    readonly id: string;
    readonly kind: "transaction" | "batch";
    readonly reference: string | null;
  }>;
}
