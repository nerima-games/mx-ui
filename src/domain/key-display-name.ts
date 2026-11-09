import {
  type UiLanguage,
  type UiMessageText,
  UiMessageTextSchema,
} from './ui-language.js'
import type { KeyCode } from '@nerima-games/mc-kernel/domain/settings'
import { Schema } from 'effect'

const KEY_NAMES: Readonly<Record<string, Readonly<Record<UiLanguage, string>>>> = {
  AltLeft: { en: 'Left Alt', ja: '左Alt' },
  AltRight: { en: 'Right Alt', ja: '右Alt' },
  ArrowDown: { en: 'Down arrow', ja: '下矢印' },
  ArrowLeft: { en: 'Left arrow', ja: '左矢印' },
  ArrowRight: { en: 'Right arrow', ja: '右矢印' },
  ArrowUp: { en: 'Up arrow', ja: '上矢印' },
  Backspace: { en: 'Backspace', ja: 'Backspace' },
  CapsLock: { en: 'Caps Lock', ja: 'Caps Lock' },
  ControlLeft: { en: 'Left Ctrl', ja: '左Ctrl' },
  ControlRight: { en: 'Right Ctrl', ja: '右Ctrl' },
  Delete: { en: 'Delete', ja: 'Delete' },
  End: { en: 'End', ja: 'End' },
  Enter: { en: 'Enter', ja: 'Enter' },
  Escape: { en: 'Esc', ja: 'Esc' },
  Home: { en: 'Home', ja: 'Home' },
  Insert: { en: 'Insert', ja: 'Insert' },
  MetaLeft: { en: 'Left Meta', ja: '左Meta' },
  MetaRight: { en: 'Right Meta', ja: '右Meta' },
  MouseLeft: { en: 'Left click', ja: '左クリック' },
  MouseMiddle: { en: 'Middle click', ja: '中クリック' },
  MouseRight: { en: 'Right click', ja: '右クリック' },
  PageDown: { en: 'Page Down', ja: 'Page Down' },
  PageUp: { en: 'Page Up', ja: 'Page Up' },
  ShiftLeft: { en: 'Left Shift', ja: '左Shift' },
  ShiftRight: { en: 'Right Shift', ja: '右Shift' },
  Space: { en: 'Space', ja: 'スペース' },
  Tab: { en: 'Tab', ja: 'Tab' },
}
const uiMessageText = Schema.decodeUnknownSync(UiMessageTextSchema)

const LETTER_KEY_PATTERN = /^Key(?<key>[A-Z])$/u
const DIGIT_KEY_PATTERN = /^Digit(?<key>[0-9])$/u
const NUMPAD_KEY_PATTERN = /^Numpad(?<key>[0-9])$/u

const namedKey = (code: string, language: UiLanguage): string | null => KEY_NAMES[code]?.[language] ?? null

const capturedKey = (pattern: RegExp, code: string): string | null =>
  pattern.exec(code)?.groups?.['key'] ?? null

const numpadName = (code: string, language: UiLanguage): string | null => {
  const numpad = capturedKey(NUMPAD_KEY_PATTERN, code)
  if (numpad === null) {
    return null
  }
  if (language === 'ja') {
    return `テンキー ${numpad}`
  }
  return `Numpad ${numpad}`
}

const prefixedKeyName = (code: string, language: UiLanguage): string | null => {
  const letter = capturedKey(LETTER_KEY_PATTERN, code)
  if (letter !== null) {
    return letter
  }

  const digit = capturedKey(DIGIT_KEY_PATTERN, code)
  if (digit !== null) {
    return digit
  }

  return numpadName(code, language)
}

/** Converts standard KeyboardEvent.code values to readable names, preserving unknown codes verbatim. */
export const keyDisplayName = (code: KeyCode, language: UiLanguage): UiMessageText => {
  const displayName = namedKey(code, language) ?? prefixedKeyName(code, language) ?? code
  return uiMessageText(displayName)
}
