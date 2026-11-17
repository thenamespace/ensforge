import type { CommitmentStatus } from "../../actions/registration/types.js";
import type { EnsProtocol } from "../../schemas/protocol.js";

export interface ClassifyCommitmentStatusParameters {
  readonly protocol: EnsProtocol;
  readonly submittedAt: bigint;
  readonly minimumAge: bigint;
  readonly maximumAge: bigint;
  readonly currentTime: bigint;
}

export const classifyCommitmentStatus = ({
  protocol,
  submittedAt,
  minimumAge,
  maximumAge,
  currentTime,
}: ClassifyCommitmentStatusParameters): CommitmentStatus => {
  if (submittedAt === 0n) return { status: "not-found", protocol };

  const readyAt = submittedAt + minimumAge;
  const expiresAt = submittedAt + maximumAge;

  if (currentTime < readyAt) {
    return {
      status: "pending",
      protocol,
      submittedAt,
      readyAt,
      expiresAt,
      remainingSeconds: readyAt - currentTime,
    };
  }

  if (currentTime >= expiresAt) {
    return { status: "expired", protocol, submittedAt, readyAt, expiresAt };
  }

  return {
    status: "ready",
    protocol,
    submittedAt,
    readyAt,
    expiresAt,
    remainingSeconds: expiresAt - currentTime,
  };
};
