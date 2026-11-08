import {
  type ItemDisplayName,
  type ItemDisplayNameFailure,
  ItemDisplayNameSchema,
  type ItemDisplayNameView,
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
  descriptors: PropertyDescriptorMap,
): boolean => {
  const { _tag: tag } = descriptors
  const { success } = descriptors
  const hasUntaggedSuccess = keys.length === ONE_RESULT_MEMBER && keys.at(FIRST_RESULT_KEY) === 'success'
  const hasTaggedSuccess = keys.length === TWO_RESULT_MEMBERS &&
    keys.includes('success') && keys.includes('_tag') &&
    isDataDescriptor(tag) && tag.value === 'Success'
  return (hasUntaggedSuccess || hasTaggedSuccess) && isDataDescriptor(success)
}

const serializedSuccessDescriptor = (input: unknown): PropertyDescriptor | undefined => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(descriptors)
  const { success } = descriptors
  if (!isSuccessEnvelope(keys, descriptors) || !isDataDescriptor(success)) {
    return
  }
  return success
}

const serializedDisplayNameSuccess = (input: unknown): unknown | undefined => {
  const descriptor = serializedSuccessDescriptor(input)
  if (!isDataDescriptor(descriptor)) {
    return
  }
  return descriptor.value
}

const serializedSuccessValue = (input: unknown): Result.Result<unknown, ItemDisplayNameFailure> => Result.try({
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

const displayNameResultOf = (input: unknown): Result.Result<ItemDisplayName, ItemDisplayNameFailure> => {
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

const displayNameText = (slot: SlotView['itemDisplayName'], language: UiLanguage): ItemDisplayName | undefined => {
  if (typeof slot === 'undefined' || slot.language !== language) {
    return
  }
  const name = displayNameResultOf(slot.result)
  if (Result.isFailure(name)) {
    return
  }
  return name.success
}

export const itemDisplayNameText = (
  slot: Pick<SlotView, 'itemId' | 'itemDisplayName'>,
  language: UiLanguage,
): ItemDisplayName | UiMessageText | '' => {
  if (typeof slot.itemId === 'undefined') {
    return ''
  }
  const supplied = displayNameText(slot.itemDisplayName, language)
  if (typeof supplied !== 'undefined') {
    return supplied
  }
  const resolved = resolveItemDisplayName(slot.itemId, language)
  if (Result.isSuccess(resolved)) {
    return resolved.success
  }
  return translateUiMessage(language, 'item.unknown')
}

const displayNameValue = (result: ItemDisplayNameView['result']): UiMessageValue => {
  if (Result.isFailure(result) || result.success.includes(MINECRAFT_NAMESPACE_PREFIX)) {
    return { key: 'item.unknown' }
  }
  return result.success
}

export const itemDisplayNameValue = (
  slot: Pick<SlotView, 'itemId' | 'itemDisplayName'>,
  language: UiLanguage,
): UiMessageValue => {
  if (typeof slot.itemId === 'undefined') {
    return { key: 'inventory.empty' }
  }
  const resolved = slot.itemDisplayName
  if (typeof resolved !== 'undefined' && resolved.language === language) {
    const name = displayNameResultOf(resolved.result)
    if (Result.isSuccess(name)) {
      return displayNameValue(name)
    }
  }
  const displayName = resolveItemDisplayName(slot.itemId, language)
  return displayNameValue(displayName)
}
