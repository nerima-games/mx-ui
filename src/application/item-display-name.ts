import {
  type ItemDisplayName,
  type ItemDisplayNameView,
  resolveItemDisplayName,
} from '../domain/item-display-name.js'
import {
  type UiLanguage,
  type UiMessageText,
  type UiMessageValue,
  translateUiMessage,
} from '../domain/ui-language.js'
import { Result } from 'effect'
import type { SlotView } from '../domain/hud-view-model.js'

const MINECRAFT_NAMESPACE_PREFIX = 'minecraft:'

const displayNameText = (slot: SlotView['itemDisplayName'], language: UiLanguage): ItemDisplayName | undefined => {
  if (typeof slot === 'undefined' || slot.language !== language || Result.isFailure(slot.result)) {
    return
  }
  const { success } = slot.result
  if (success.includes(MINECRAFT_NAMESPACE_PREFIX)) {
    return
  }
  return success
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
    if (Result.isSuccess(resolved.result)) {
      return displayNameValue(resolved.result)
    }
  }
  const displayName = resolveItemDisplayName(slot.itemId, language)
  return displayNameValue(displayName)
}
