import type { Deployments } from "@ensforge/contracts";

/** Runtime deployments retain provenance when supplied, but do not require it. */
export type EnsV1ConfigDeployment = Omit<Deployments.V1, "provenance"> &
  Partial<Pick<Deployments.V1, "provenance">>;

export type EnsV2ConfigDeployment = Omit<Deployments.V2, "provenance"> &
  Partial<Pick<Deployments.V2, "provenance">>;

type DeploymentMetadata = "id" | "chainId" | "protocol" | "status";

export type EnsV1DeploymentConfig = Omit<EnsV1ConfigDeployment, DeploymentMetadata> &
  Partial<Pick<Deployments.V1, "status">>;

export type EnsV2DeploymentConfig = Omit<EnsV2ConfigDeployment, DeploymentMetadata> &
  Partial<Pick<Deployments.V2, "status">>;

/** An ENS-compatible deployment on a single chain. IDs must be unique across deployments. */
export type CustomEnsNetwork = {
  readonly id: string;
  readonly chainId: number;
} & (
  | { readonly protocol: "v1"; readonly v1: EnsV1DeploymentConfig; readonly v2?: never }
  | {
      readonly protocol: "v2";
      readonly v1?: EnsV1DeploymentConfig;
      readonly v2: EnsV2DeploymentConfig;
    }
);
