"use client";

import { Actions, type Errors } from "@ensforge/sdk";

import type { ReadResult } from "../result.js";
import { useInfiniteRead, type InfiniteReadResult } from "../useInfiniteRead.js";
import { useRead, type ReadConfig } from "../useRead.js";

/**
 * A name's state: owner, manager, expiry, resolver, registry and wrapper status. Preset of `useRead(Actions.name.get, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useName } from "@ensforge/react"
 *
 * function View() {
 *   const { data } = useName({ name: "nick.eth" })
 *   return <span>{data?.owner}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useName = (
  options: Actions.name.get.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.name.get.ReturnType, Errors.AnyError> =>
  useRead(Actions.name.get, options, config);

/**
 * One text record, such as `url`, `avatar` or `com.twitter`. Preset of `useRead(Actions.record.getText, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useText } from "@ensforge/react"
 *
 * function View() {
 *   const { data: url } = useText({ name: "nick.eth", key: "url" })
 *   return <span>{url}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useText = (
  options: Actions.record.getText.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.record.getText.ReturnType, Errors.AnyError> =>
  useRead(Actions.record.getText, options, config);

/**
 * The address a name points to, for ETH or another coin. Preset of `useRead(Actions.record.getAddress, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useAddress } from "@ensforge/react"
 *
 * function View() {
 *   const { data: address } = useAddress({ name: "nick.eth" })
 *   return <span>{address}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useAddress = (
  options: Actions.record.getAddress.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.record.getAddress.ReturnType, Errors.AnyError> =>
  useRead(Actions.record.getAddress, options, config);

/**
 * A name's avatar as an image URL, with NFT avatars resolved. Preset of `useRead(Actions.record.getAvatar, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useAvatar } from "@ensforge/react"
 *
 * function View() {
 *   const { data: avatar } = useAvatar({ name: "nick.eth" })
 *   return <img src={avatar ?? undefined} />
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useAvatar = (
  options: Actions.record.getAvatar.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.record.getAvatar.ReturnType, Errors.AnyError> =>
  useRead(Actions.record.getAvatar, options, config);

/**
 * The primary name of an address, verified against its forward address. Preset of `useRead(Actions.primaryName.get, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { usePrimaryName } from "@ensforge/react"
 *
 * function View() {
 *   const { data: primary } = usePrimaryName({ address })
 *   return <span>{primary}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const usePrimaryName = (
  options: Actions.primaryName.get.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.primaryName.get.ReturnType, Errors.AnyError> =>
  useRead(Actions.primaryName.get, options, config);

/**
 * Whether a name can be registered now. Preset of `useRead(Actions.registration.isAvailable, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useAvailability } from "@ensforge/react"
 *
 * function View() {
 *   const { data: available } = useAvailability({ name: "alice.eth" })
 *   return <span>{String(available)}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useAvailability = (
  options: Actions.registration.isAvailable.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.registration.isAvailable.ReturnType, Errors.AnyError> =>
  useRead(Actions.registration.isAvailable, options, config);

/**
 * What registering names for a duration costs. Preset of `useRead(Actions.registration.getPrice, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { Duration } from "@ensforge/sdk"
 * import { useRegistrationPrice } from "@ensforge/react"
 *
 * function View() {
 *   const { data: price } = useRegistrationPrice({ name: "alice.eth", duration: Duration.years(1) })
 *   return <span>{String(price?.total)}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useRegistrationPrice = (
  options: Actions.registration.getPrice.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.registration.getPrice.ReturnType, Errors.AnyError> =>
  useRead(Actions.registration.getPrice, options, config);

/**
 * What an account may do with a name. Preset of `useRead(Actions.permission.get, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { usePermissions } from "@ensforge/react"
 *
 * function View() {
 *   const { data: permissions } = usePermissions({ name: "alice.eth", account: address })
 *   return <span>{String(permissions?.can.setRecords)}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const usePermissions = (
  options: Actions.permission.get.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.permission.get.ReturnType, Errors.AnyError> =>
  useRead(Actions.permission.get, options, config);

/**
 * Whether and how a name can move from ENSv1 to ENSv2. Preset of `useRead(Actions.migration.get, …)`.
 *
 * **Example** (Reading in a component)
 *
 * ```tsx
 * import { useMigrationStatus } from "@ensforge/react"
 *
 * function View() {
 *   const { data: migration } = useMigrationStatus({ name: "alice.eth" })
 *   return <span>{migration?.status}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useMigrationStatus = (
  options: Actions.migration.get.Options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.migration.get.ReturnType, Errors.AnyError> =>
  useRead(Actions.migration.get, options, config);

/**
 * Any mix of a name's records in one request; the result has exactly the requested fields.
 * Preset of `useRead(Actions.record.get, …)`.
 *
 * **Example** (A profile card)
 *
 * ```tsx
 * import { useRecords } from "@ensforge/react"
 *
 * function Profile() {
 *   const { data } = useRecords({ name: "nick.eth", texts: ["url", "avatar"], addresses: ["eth"] })
 *   return <span>{data?.texts.url}</span>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useRecords = <const options extends Actions.record.get.Options>(
  options: options | undefined,
  config?: ReadConfig,
): ReadResult<Actions.record.get.ReturnType<options>, Errors.AnyError> =>
  useRead(Actions.record.get, options, config) as ReadResult<
    Actions.record.get.ReturnType<options>,
    Errors.AnyError
  >;

/**
 * Names an address owns, manages or is the primary name of, page by page, from the indexer. Preset of `useInfiniteRead(Actions.indexer.getNamesForAddress, …)`.
 *
 * **Example** (A list with "Load more")
 *
 * ```tsx
 * import { useNamesForAddress } from "@ensforge/react"
 *
 * function List() {
 *   const { items, hasMore, loadMore } = useNamesForAddress({ address })
 *   return <button disabled={!hasMore} onClick={loadMore}>{items.length}</button>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useNamesForAddress = (
  options: Omit<Actions.indexer.getNamesForAddress.Options, "cursor">,
  config?: { readonly client?: ReadConfig["client"] },
): InfiniteReadResult<Actions.indexer.getNamesForAddress.ReturnType, Errors.AnyError> =>
  useInfiniteRead(Actions.indexer.getNamesForAddress, options, config);

/**
 * A name's subnames, page by page, from the indexer. Preset of `useInfiniteRead(Actions.indexer.getSubnames, …)`.
 *
 * **Example** (A list with "Load more")
 *
 * ```tsx
 * import { useSubnames } from "@ensforge/react"
 *
 * function List() {
 *   const { items, hasMore, loadMore } = useSubnames({ name: "ens.eth" })
 *   return <button disabled={!hasMore} onClick={loadMore}>{items.length}</button>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useSubnames = (
  options: Omit<Actions.indexer.getSubnames.Options, "cursor">,
  config?: { readonly client?: ReadConfig["client"] },
): InfiniteReadResult<Actions.indexer.getSubnames.ReturnType, Errors.AnyError> =>
  useInfiniteRead(Actions.indexer.getSubnames, options, config);

/**
 * A name's events (registrations, transfers, record changes), page by page, from the indexer. Preset of `useInfiniteRead(Actions.indexer.getHistory, …)`.
 *
 * **Example** (A list with "Load more")
 *
 * ```tsx
 * import { useNameHistory } from "@ensforge/react"
 *
 * function List() {
 *   const { items, hasMore, loadMore } = useNameHistory({ name: "nick.eth" })
 *   return <button disabled={!hasMore} onClick={loadMore}>{items.length}</button>
 * }
 * ```
 *
 * @category named reads
 * @since 1.0.0
 */
export const useNameHistory = (
  options: Omit<Actions.indexer.getHistory.Options, "cursor">,
  config?: { readonly client?: ReadConfig["client"] },
): InfiniteReadResult<Actions.indexer.getHistory.ReturnType, Errors.AnyError> =>
  useInfiniteRead(Actions.indexer.getHistory, options, config);
