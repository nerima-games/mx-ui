import { type Brand, Result, Schema } from 'effect'
import { type ItemType, isItemType } from '@nerima-games/mc-kernel'
import type { UiLanguage } from './ui-language.js'

const MINECRAFT_NAMESPACE_PREFIX = 'minecraft:'

export type ItemDisplayName = string & Brand.Brand<'ItemDisplayName'>
export const ItemDisplayNameSchema: Schema.Codec<ItemDisplayName, string> = Schema.NonEmptyString.pipe(
  Schema.brand('ItemDisplayName'),
)

export type ItemDisplayNameResolverFailure = Readonly<{
  readonly _tag: 'ItemDisplayNameUnavailable'
}>

export type ItemDisplayNameFailure =
  | ItemDisplayNameResolverFailure
  | Readonly<{ readonly _tag: 'InvalidItemId' }>
  | Readonly<{ readonly _tag: 'MissingItemDisplayNameResolver' }>
  | Readonly<{ readonly _tag: 'InvalidItemDisplayName' }>

export type ItemDisplayNameResolver = (
  itemType: ItemType,
  language: UiLanguage,
) => Result.Result<string, ItemDisplayNameResolverFailure>

export type ItemDisplayNameOptions = Readonly<{
  readonly language: UiLanguage
  readonly resolver: ItemDisplayNameResolver
}>

type InvalidItemDisplayNameOptions = null | Readonly<{
  readonly language: UiLanguage | null | undefined
  readonly resolver: ItemDisplayNameResolver | null | undefined
}>

export type ItemDisplayNameView = Readonly<{
  readonly language: UiLanguage
  readonly result: Result.Result<ItemDisplayName, ItemDisplayNameFailure>
}>

type InvalidItemDisplayNameOptionsView = Readonly<{
  readonly language: undefined
  readonly result: Result.Result<ItemDisplayName, Readonly<{ readonly _tag: 'InvalidItemDisplayNameOptions' }>>
}>

const invalidItemDisplayNameOptionsView = (): InvalidItemDisplayNameOptionsView => ({
  language: Reflect.get({}, 'language'),
  result: Result.fail({ _tag: 'InvalidItemDisplayNameOptions' }),
})

const isItemDisplayNameOptions = (input: unknown): input is ItemDisplayNameOptions =>
  typeof input === 'object' &&
  input !== null &&
  'language' in input &&
  (input.language === 'en' || input.language === 'ja') &&
  'resolver' in input &&
  typeof input.resolver === 'function'

const itemTypeFromId = (input: unknown): ItemType | undefined => {
  if (typeof input !== 'string') {
    return
  }
  if (input.startsWith(MINECRAFT_NAMESPACE_PREFIX)) {
    const unnamespaced = input.slice(MINECRAFT_NAMESPACE_PREFIX.length)
    if (isItemType(unnamespaced)) {
      return unnamespaced
    }
    return
  }
  if (isItemType(input)) {
    return input
  }
  return
}

const decodeItemDisplayName = (name: string): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  if (name.includes(MINECRAFT_NAMESPACE_PREFIX)) {
    return Result.fail({ _tag: 'InvalidItemDisplayName' })
  }
  const decoded = Schema.decodeUnknownResult(ItemDisplayNameSchema)(name)
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: 'InvalidItemDisplayName' })
  }
  return Result.succeed(decoded.success)
}

const resolveForItemType = (
  itemType: ItemType,
  language: UiLanguage,
  resolver: ItemDisplayNameResolver,
): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  const resolved = resolver(itemType, language)
  if (Result.isFailure(resolved)) {
    return Result.fail(resolved.failure)
  }
  return decodeItemDisplayName(resolved.success)
}

/** Resolve an external item identifier without exposing it when no name exists. */
export const resolveItemDisplayName = (
  input: unknown,
  language: UiLanguage,
  resolver?: ItemDisplayNameResolver,
): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  const itemType = itemTypeFromId(input)
  if (typeof itemType === 'undefined') {
    return Result.fail({ _tag: 'InvalidItemId' })
  }
  if (typeof resolver === 'undefined') {
    return Result.fail({ _tag: 'MissingItemDisplayNameResolver' })
  }
  return resolveForItemType(itemType, language, resolver)
}

export function itemDisplayNameView(
  itemId: unknown,
  options?: ItemDisplayNameOptions,
): ItemDisplayNameView
export function itemDisplayNameView(
  itemId: unknown,
  options: InvalidItemDisplayNameOptions,
): InvalidItemDisplayNameOptionsView
export function itemDisplayNameView(
  itemId: unknown,
  options: ItemDisplayNameOptions | InvalidItemDisplayNameOptions,
): ItemDisplayNameView | InvalidItemDisplayNameOptionsView
export function itemDisplayNameView(
  itemId: unknown,
  options?: ItemDisplayNameOptions | InvalidItemDisplayNameOptions,
): ItemDisplayNameView | InvalidItemDisplayNameOptionsView {
  if (typeof options === 'undefined') {
    const language: UiLanguage = 'en'
    return {
      language,
      result: resolveItemDisplayName(itemId, language),
    }
  }
  if (!isItemDisplayNameOptions(options)) {
    return invalidItemDisplayNameOptionsView()
  }
  return {
    language: options.language,
    result: resolveItemDisplayName(itemId, options.language, options.resolver),
  }
}
