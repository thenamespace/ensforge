/**
 * An approval contract: the ENSv1 `"registry"`, `"registrar"` (BaseRegistrar) or `"wrapper"`
 * (NameWrapper), or any ENSv2 registry or resolver by address.
 *
 * @category approvals
 * @since 1.0.0
 */
export type ApprovalContract = "registry" | "registrar" | "wrapper" | (string & {});
