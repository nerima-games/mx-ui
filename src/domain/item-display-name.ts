import { type Brand, Result, Schema } from 'effect'
import { type ItemType, getDisplayName, isItemType } from '@nerima-games/mc-kernel'
import type { ItemIconResolver } from './item-icon.js'
import type { UiLanguage } from './ui-language.js'

const MINECRAFT_NAMESPACE_PREFIX = 'minecraft:'
const ITEM_DISPLAY_NAME_UNAVAILABLE: ItemDisplayNameResolverFailure = { _tag: 'ItemDisplayNameUnavailable' }
const SUCCESS_RESULT_PROTOTYPE = Object.getPrototypeOf(Result.succeed(null))
const FAILURE_RESULT_PROTOTYPE = Object.getPrototypeOf(Result.fail(null))
const ONE_KEY = 1
const FIRST_ARRAY_INDEX = 0

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
  | Readonly<{ readonly _tag: 'InvalidItemDisplayName' }>

export type ItemDisplayNameResolver = (
  itemType: ItemType,
  language: UiLanguage,
) => Result.Result<string, ItemDisplayNameResolverFailure>

type ItemDisplayNameResolverCallback = (itemType: ItemType, language: UiLanguage) => unknown

export type ItemDisplayNameOptions = Readonly<{
  readonly language: UiLanguage
  readonly resolver?: ItemDisplayNameResolver
  readonly iconResolver?: ItemIconResolver
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

const decodeItemDisplayName = (input: unknown): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  if (typeof input !== 'string') {
    return Result.fail({ _tag: 'InvalidItemDisplayName' })
  }
  const name = input
  if (name.includes(MINECRAFT_NAMESPACE_PREFIX)) {
    return Result.fail({ _tag: 'InvalidItemDisplayName' })
  }
  const decoded = Schema.decodeUnknownResult(ItemDisplayNameSchema)(name)
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: 'InvalidItemDisplayName' })
  }
  return Result.succeed(decoded.success)
}

const isDataDescriptor = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } =>
  typeof descriptor !== 'undefined' && Object.hasOwn(descriptor, 'value')

const resultDataMember = (input: object, memberName: 'success' | 'failure'): unknown | undefined => {
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(descriptors)
  const member = descriptors[memberName]
  if (keys.length !== ONE_KEY || keys.at(FIRST_ARRAY_INDEX) !== memberName || !isDataDescriptor(member)) {
    return
  }
  return member.value
}

const resultTagForMember = (memberName: 'success' | 'failure'): 'Success' | 'Failure' => {
  if (memberName === 'success') {
    return 'Success'
  }
  return 'Failure'
}

const resultMember = (
  input: object,
  prototype: object,
  memberName: 'success' | 'failure',
): unknown | undefined => {
  if (Object.getPrototypeOf(input) !== prototype) {
    return
  }
  if (Object.getOwnPropertyDescriptor(prototype, '_tag')?.value !== resultTagForMember(memberName)) {
    return
  }
  return resultDataMember(input, memberName)
}

const resultEnvelope = (
  input: object,
  prototype: object,
  memberName: 'success' | 'failure',
): Readonly<{ tag: 'Success' | 'Failure'; value: unknown }> | undefined => {
  const value = resultMember(input, prototype, memberName)
  if (typeof value === 'undefined') {
    return
  }
  return { tag: resultTagForMember(memberName), value }
}

const resultValueFromObject = (input: object): Readonly<{ tag: 'Success' | 'Failure'; value: unknown }> | undefined => {
  const prototype = Object.getPrototypeOf(input)
  if (prototype === SUCCESS_RESULT_PROTOTYPE) {
    return resultEnvelope(input, SUCCESS_RESULT_PROTOTYPE, 'success')
  }
  if (prototype === FAILURE_RESULT_PROTOTYPE) {
    return resultEnvelope(input, FAILURE_RESULT_PROTOTYPE, 'failure')
  }
  return
}

const resultValue = (
  input: unknown,
): Result.Result<Readonly<{ tag: 'Success' | 'Failure'; value: unknown }>, ItemDisplayNameResolverFailure> => {
  const parsed = Result.try({
    catch: () => ITEM_DISPLAY_NAME_UNAVAILABLE,
    try: () => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return
      }
      return resultValueFromObject(input)
    },
  })
  if (Result.isFailure(parsed) || typeof parsed.success === 'undefined') {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  return Result.succeed(parsed.success)
}

const displayNameFromResult = (
  result: Readonly<{ tag: 'Success' | 'Failure'; value: unknown }>,
): Result.Result<string, ItemDisplayNameResolverFailure> => {
  if (result.tag === 'Failure' || typeof result.value !== 'string') {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  return Result.succeed(result.value)
}

const resolverValue = (input: unknown): Result.Result<string, ItemDisplayNameResolverFailure> => {
  const parsed = resultValue(input)
  if (Result.isFailure(parsed)) {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  return displayNameFromResult(parsed.success)
}

/** Resolve default English or Japanese item names from the kernel registry. */
export const defaultItemDisplayNameResolver: ItemDisplayNameResolver = (itemType, language) => {
  if (!isItemType(itemType) || (language !== 'en' && language !== 'ja')) {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  const resolved = getDisplayName({ id: itemType, kind: 'item', language })
  if (Result.isFailure(resolved)) {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  return Result.succeed(resolved.success)
}

const invokeResolver = (
  resolver: ItemDisplayNameResolverCallback,
  itemType: ItemType,
  language: UiLanguage,
): Result.Result<unknown, ItemDisplayNameResolverFailure> => Result.try({
  catch: () => ITEM_DISPLAY_NAME_UNAVAILABLE,
  try: () => resolver(itemType, language),
})

const resolveForItemType = (
  itemType: ItemType,
  language: UiLanguage,
  resolver: ItemDisplayNameResolverCallback | undefined,
): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  const activeResolver = resolver ?? defaultItemDisplayNameResolver
  const called = invokeResolver(activeResolver, itemType, language)
  if (Result.isFailure(called)) {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  const resolved = resolverValue(called.success)
  if (Result.isFailure(resolved)) {
    return Result.fail(resolved.failure)
  }
  return decodeItemDisplayName(resolved.success)
}

/** Resolve an external item identifier without exposing it when no name exists. */
export const resolveItemDisplayName = (
  input: unknown,
  language: UiLanguage,
  resolver?: ItemDisplayNameResolverCallback,
): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  const itemType = itemTypeFromId(input)
  if (typeof itemType === 'undefined') {
    return Result.fail({ _tag: 'InvalidItemId' })
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
