import {
  type ItemDisplayName,
  type ItemDisplayNameFailure,
  ItemDisplayNameSchema,
  type ItemDisplayNameView,
  defaultItemDisplayNameResolver,
  resolveItemDisplayName,
} from '../domain/item-display-name.js'
import { Result, Schema } from 'effect'
import {
  type UiLanguage,
  type UiMessageText,
  type UiMessageValue,
  translateUiMessage,
} from '../domain/ui-language.js'
import type { SlotView } from '../domain/hud-view-model.js'

const MINECRAFT_NAMESPACE_PREFIX = 'minecraft:'
const ITEM_DISPLAY_NAME_UNAVAILABLE: ItemDisplayNameFailure = { _tag: 'ItemDisplayNameUnavailable' }
const INVALID_ITEM_DISPLAY_NAME: ItemDisplayNameFailure = { _tag: 'InvalidItemDisplayName' }
const ONE_RESULT_MEMBER = 1
const TWO_RESULT_MEMBERS = 2
const FIRST_RESULT_KEY = 0

const isDataDescriptor = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } =>
  typeof descriptor !== 'undefined' && Object.hasOwn(descriptor, 'value')

const isSuccessEnvelope = (
  keys: ReadonlyArray<string | symbol>,
  tag: unknown,
): boolean => {
  const hasUntaggedSuccess = keys.length === ONE_RESULT_MEMBER && keys.at(FIRST_RESULT_KEY) === 'success'
  const hasTaggedSuccess = keys.length === TWO_RESULT_MEMBERS &&
    keys.includes('success') && keys.includes('_tag') &&
    tag === 'Success'
  return hasUntaggedSuccess || hasTaggedSuccess
}

type DisplayNameResult = ItemDisplayNameView['result']

const isItemDisplayNameFailure = (input: unknown): boolean => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false
  }
  const failureTag = Reflect.get(input, '_tag')
  return typeof failureTag === 'string' && [
    'InvalidItemDisplayName',
    'InvalidItemId',
    'ItemDisplayNameUnavailable',
    'MissingItemDisplayNameResolver',
  ].includes(failureTag)
}

export const isItemDisplayNameResult = (input: unknown): boolean => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false
  }
  // Effect stores _tag on the Result prototype, so structuredClone keeps only the own success or failure field.
  const keys = Reflect.ownKeys(input)
  const tag = Reflect.get(input, '_tag')
  if (isSuccessEnvelope(keys, tag)) {
    return typeof Reflect.get(input, 'success') === 'string'
  }
  const isClonedSingleMember = typeof tag === 'undefined' && keys.length === ONE_RESULT_MEMBER
  return (tag === 'Failure' || (isClonedSingleMember && keys[FIRST_RESULT_KEY] === 'failure')) &&
    isItemDisplayNameFailure(Reflect.get(input, 'failure'))
}

const serializedSuccessDescriptor = (input: object): PropertyDescriptor | undefined => {
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(descriptors)
  const { _tag: tag, success } = descriptors
  const tagValue: unknown = isDataDescriptor(tag) && tag.value
  if (!isSuccessEnvelope(keys, tagValue) || !isDataDescriptor(success)) {
    return
  }
  return success
}

const serializedDisplayNameSuccess = (input: DisplayNameResult): unknown | undefined => {
  const descriptor = serializedSuccessDescriptor(input)
  if (!isDataDescriptor(descriptor)) {
    return
  }
  return descriptor.value
}

const serializedSuccessValue = (input: DisplayNameResult): Result.Result<unknown, ItemDisplayNameFailure> => Result.try({
  catch: () => INVALID_ITEM_DISPLAY_NAME,
  try: () => serializedDisplayNameSuccess(input),
})

const decodeDisplayName = (input: unknown): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  if (typeof input !== 'string' || input.includes(MINECRAFT_NAMESPACE_PREFIX)) {
    return Result.fail(INVALID_ITEM_DISPLAY_NAME)
  }
  const decoded = Schema.decodeUnknownResult(ItemDisplayNameSchema)(input)
  if (Result.isFailure(decoded)) {
    return Result.fail(INVALID_ITEM_DISPLAY_NAME)
  }
  return Result.succeed(decoded.success)
}

const displayNameResultOf = (input: DisplayNameResult): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
  const serializedSuccess = serializedSuccessValue(input)
  if (Result.isFailure(serializedSuccess)) {
    return Result.fail(serializedSuccess.failure)
  }
  const { success } = serializedSuccess
  if (typeof success === 'undefined') {
    return Result.fail(ITEM_DISPLAY_NAME_UNAVAILABLE)
  }
  return decodeDisplayName(success)
}

const displayNameText = (view: ItemDisplayNameView): ItemDisplayName | undefined => {
  const name = displayNameResultOf(view.result)
  if (Result.isFailure(name)) {
    return
  }
  return name.success
}

/** A same-language host view decides the name; an unreadable one is shown as unknown, not replaced. */
const suppliedDisplayNameText = (
  view: SlotView['itemDisplayName'],
  language: UiLanguage,
): ItemDisplayName | UiMessageText | undefined => {
  if (typeof view === 'undefined' || view.language !== language) {
    return
  }
  const supplied = displayNameText(view)
  if (typeof supplied !== 'undefined') {
    return supplied
  }
  return translateUiMessage(language, 'item.unknown')
}

export const itemDisplayNameText = (
  slot: Pick<SlotView, 'itemId' | 'itemDisplayName'>,
  language: UiLanguage,
): ItemDisplayName | UiMessageText | '' => {
  if (typeof slot.itemId === 'undefined') {
    return ''
  }
  const supplied = suppliedDisplayNameText(slot.itemDisplayName, language)
  if (typeof supplied !== 'undefined') {
    return supplied
  }
  const resolved = resolveItemDisplayName(slot.itemId, language, defaultItemDisplayNameResolver)
  if (Result.isSuccess(resolved)) {
    return resolved.success
  }
  return translateUiMessage(language, 'item.unknown')
}

const displayNameValue = (name: Result.Result<ItemDisplayName, ItemDisplayNameFailure>): UiMessageValue => {
  if (Result.isSuccess(name)) {
    return name.success
  }
  return { key: 'item.unknown' }
}

export const itemDisplayNameValue = (
  slot: Pick<SlotView, 'itemId' | 'itemDisplayName'>,
  language: UiLanguage,
): UiMessageValue => {
  if (typeof slot.itemId === 'undefined') {
    return { key: 'inventory.empty' }
  }
  const currentView = slot.itemDisplayName
  if (typeof currentView !== 'undefined' && currentView.language === language) {
    return displayNameValue(displayNameResultOf(currentView.result))
  }
  return displayNameValue(resolveItemDisplayName(slot.itemId, language, defaultItemDisplayNameResolver))
}
