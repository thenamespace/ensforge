"use client";

import { Actions, type Errors } from "@ensforge/sdk";

import { useWrite, type WriteResult } from "../useWrite.js";

/**
 * Registers names: commit, wait the minimum age, then register, with every step in `steps`. Preset of `useWrite(Actions.registration.register)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { Duration } from "@ensforge/sdk"
 * import { useRegister } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useRegister()
 *   return <button disabled={isPending} onClick={() => mutate({ names: "alice.eth", duration: Duration.years(1) })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useRegister = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.registration.register>[1],
  Actions.registration.register.ReturnType,
  Errors.AnyError
> => useWrite(Actions.registration.register, config);

/**
 * Renews names. Preset of `useWrite(Actions.registration.renew)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { Duration } from "@ensforge/sdk"
 * import { useRenew } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useRenew()
 *   return <button disabled={isPending} onClick={() => mutate({ names: "alice.eth", duration: Duration.years(1) })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useRenew = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.registration.renew>[1],
  Actions.registration.renew.ReturnType,
  Errors.AnyError
> => useWrite(Actions.registration.renew, config);

/**
 * Sets, changes or clears a name's records in one write. Preset of `useWrite(Actions.record.set)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useSetRecords } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useSetRecords()
 *   return <button disabled={isPending} onClick={() => mutate({ name: "alice.eth", texts: { url: "https://alice.xyz" } })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useSetRecords = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.record.set>[1],
  Actions.record.set.ReturnType,
  Errors.AnyError
> => useWrite(Actions.record.set, config);

/**
 * Points a name at a resolver. Preset of `useWrite(Actions.resolver.set)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useSetResolver } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useSetResolver()
 *   return <button disabled={isPending} onClick={() => mutate({ name: "alice.eth", resolver: "default" })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useSetResolver = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.resolver.set>[1],
  Actions.resolver.set.ReturnType,
  Errors.AnyError
> => useWrite(Actions.resolver.set, config);

/**
 * Transfers a name to another account. Preset of `useWrite(Actions.name.transfer)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useTransferName } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useTransferName()
 *   return <button disabled={isPending} onClick={() => mutate({ name: "alice.eth", to: recipient })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useTransferName = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.name.transfer>[1],
  Actions.name.transfer.ReturnType,
  Errors.AnyError
> => useWrite(Actions.name.transfer, config);

/**
 * Creates a subname, optionally with records. Preset of `useWrite(Actions.subname.create)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useCreateSubname } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useCreateSubname()
 *   return <button disabled={isPending} onClick={() => mutate({ name: "pay.alice.eth", owner: recipient })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useCreateSubname = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.subname.create>[1],
  Actions.subname.create.ReturnType,
  Errors.AnyError
> => useWrite(Actions.subname.create, config);

/**
 * Sets the signer's primary name. Preset of `useWrite(Actions.primaryName.set)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useSetPrimaryName } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useSetPrimaryName()
 *   return <button disabled={isPending} onClick={() => mutate({ name: "alice.eth" })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useSetPrimaryName = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.primaryName.set>[1],
  Actions.primaryName.set.ReturnType,
  Errors.AnyError
> => useWrite(Actions.primaryName.set, config);

/**
 * Signs a claim to a primary name on L2s, with one signature and no transaction, for
 * `primaryName.set` on each chain (or a relaying server). Preset of
 * `useWrite(Actions.primaryName.signClaim)`; it refreshes no reads.
 *
 * **Example** (Signing, then setting the name on Base)
 *
 * ```tsx
 * import { useSetPrimaryName, useSignClaim } from "@ensforge/react"
 *
 * function Send() {
 *   const sign = useSignClaim()
 *   const set = useSetPrimaryName()
 *   const onClick = async () => {
 *     const signed = await sign.mutateAsync({ name: "alice.eth", chainIds: [8453] })
 *     set.mutate({ ...signed, coin: { chainId: 8453 } })
 *   }
 *   return <button disabled={sign.isPending || set.isPending} onClick={onClick}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useSignClaim = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.primaryName.signClaim>[1],
  Actions.primaryName.signClaim.ReturnType,
  Errors.AnyError
> => useWrite(Actions.primaryName.signClaim, config);

/**
 * Moves names from ENSv1 to ENSv2. Preset of `useWrite(Actions.migration.migrate)`.
 *
 * **Example** (A button that sends it)
 *
 * ```tsx
 * import { useMigrate } from "@ensforge/react"
 *
 * function Send() {
 *   const { mutate, isPending } = useMigrate()
 *   return <button disabled={isPending} onClick={() => mutate({ names: "alice.eth" })}>Send</button>
 * }
 * ```
 *
 * @category named writes
 * @since 1.0.0
 */
export const useMigrate = (
  config?: Parameters<typeof useWrite>[1],
): WriteResult<
  Parameters<typeof Actions.migration.migrate>[1],
  Actions.migration.migrate.ReturnType,
  Errors.AnyError
> => useWrite(Actions.migration.migrate, config);
