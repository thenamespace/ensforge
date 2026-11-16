/**
 * Fuse values defined by INameWrapper in @ensdomains/ens-contracts v1.7.0.
 *
 * @since 1.0.0
 */
export const nameWrapperFuses = {
  canDoEverything: 0,
  cannotUnwrap: 1,
  cannotBurnFuses: 2,
  cannotTransfer: 4,
  cannotSetResolver: 8,
  cannotSetTtl: 16,
  cannotCreateSubdomain: 32,
  cannotApprove: 64,
  parentCannotControl: 0x00010000,
  isDotEth: 0x00020000,
  canExtendExpiry: 0x00040000,
  parentControlled: 0xffff0000,
  userSettable: 0xfffdffff,
} as const;

/**
 * A single fuse value from {@link nameWrapperFuses}.
 *
 * @since 1.0.0
 */
export type NameWrapperFuse = (typeof nameWrapperFuses)[keyof typeof nameWrapperFuses];
