import {
  type AchievementId,
  DEFAULT_UI_LANGUAGE,
  type UiLanguage,
  type UiLanguageFailure,
  type UiMessageKey,
  type UiMessageText,
  type UiMessageValues,
  decodeUiLanguage,
  translateAchievementTitle,
  translateUiMessage,
} from '../domain/ui-language.js'
import {
  type AttributeCell,
  type TextCell,
  writeAttribute,
  writeText,
} from './dom-write.js'
import type { DomElement } from './dom-surface.js'
import { Result } from 'effect'

const LOCALIZED_ELEMENT_ATTRIBUTE = 'data-mx-ui-localized'
const LOCALIZED_ELEMENT_SELECTOR: '[data-mx-ui-localized]' = `[${LOCALIZED_ELEMENT_ATTRIBUTE}]`

export type UiLocalizationSelector = '*' | typeof LOCALIZED_ELEMENT_SELECTOR
export type UiLocalizedAttributeName = 'aria-label' | 'placeholder'

type LocalizedText =
  | Readonly<{ cell: TextCell; key: UiMessageKey; values: UiMessageValues }>
  | Readonly<{ cell: TextCell; resolve: (language: UiLanguage) => UiMessageText }>

type LocalizedAchievementTitle = {
  readonly cell: TextCell
  readonly achievement: AchievementId
}

type LocalizedAttribute = {
  readonly cell: AttributeCell
  readonly key: UiMessageKey
  values: UiMessageValues
}

type LocalizedElementState = {
  readonly attributes: Map<string, LocalizedAttribute>
  readonly element: DomElement
  achievementTitle?: LocalizedAchievementTitle
  text?: LocalizedText
}

export type UiLocalizationRoot = {
  querySelectorAll(selector: UiLocalizationSelector): ArrayLike<unknown>
}

const localizedElements = new WeakMap<object, LocalizedElementState>()
const elementLanguages = new WeakMap<object, UiLanguage>()
const INDEX_INCREMENT = 1

const languageFor = (element: DomElement): UiLanguage => elementLanguages.get(element) ?? DEFAULT_UI_LANGUAGE

export const uiLanguageForElement = (element: DomElement): UiLanguage => languageFor(element)

const stateFor = (element: DomElement): LocalizedElementState => {
  const existing = localizedElements.get(element)
  if (typeof existing !== 'undefined') {
    return existing
  }
  const created: LocalizedElementState = { attributes: new Map(), element }
  localizedElements.set(element, created)
  element.setAttribute(LOCALIZED_ELEMENT_ATTRIBUTE, '')
  return created
}

/** Carry an already-applied locale into UI nodes created during a later render. */
export const inheritUiLanguage = (parent: DomElement, child: DomElement): void => {
  const language = elementLanguages.get(parent)
  if (typeof language !== 'undefined') {
    elementLanguages.set(child, language)
  }
}

export const writeLocalizedText = (
  cell: TextCell,
  key: UiMessageKey,
  values: UiMessageValues = {},
): void => {
  const state = stateFor(cell.element)
  const text: LocalizedText = { cell, key, values }
  state.text = text
  writeText(cell, translateUiMessage(languageFor(cell.element), key, values))
}

/** Use when a sentence combines several localized fragments with dynamic data. */
export const writeLocalizedTextUsing = (
  cell: TextCell,
  resolve: (language: UiLanguage) => UiMessageText,
  language: UiLanguage = languageFor(cell.element),
): void => {
  const state = stateFor(cell.element)
  state.text = { cell, resolve }
  writeText(cell, resolve(language))
}

export const writeLocalizedAchievementTitle = (cell: TextCell, achievement: AchievementId): void => {
  const state = stateFor(cell.element)
  const title: LocalizedAchievementTitle = { achievement, cell }
  state.achievementTitle = title
  writeText(cell, translateAchievementTitle(languageFor(cell.element), achievement))
}

export const writeLocalizedAttribute = (
  cell: AttributeCell,
  key: UiMessageKey,
  values: UiMessageValues = {},
): void => {
  const state = stateFor(cell.element)
  const attribute: LocalizedAttribute = { cell, key, values }
  state.attributes.set(cell.name, attribute)
  writeAttribute(cell, translateUiMessage(languageFor(cell.element), key, values))
}

export const clearLocalizedAttribute = (cell: AttributeCell): void => {
  const state = localizedElements.get(cell.element)
  state?.attributes.delete(cell.name)
  writeAttribute(cell)
}

export const setLocalizedText = (
  element: DomElement,
  key: UiMessageKey,
  values: UiMessageValues = {},
): void => {
  const state = stateFor(element)
  const cell: TextCell = { element, previous: '' }
  const text: LocalizedText = { cell, key, values }
  state.text = text
  writeText(cell, translateUiMessage(languageFor(element), key, values))
}

export const setLocalizedAchievementTitle = (element: DomElement, achievement: AchievementId): void => {
  const state = stateFor(element)
  const cell: TextCell = { element, previous: '' }
  const title: LocalizedAchievementTitle = { achievement, cell }
  state.achievementTitle = title
  writeText(cell, translateAchievementTitle(languageFor(element), achievement))
}

export const setLocalizedAttribute = (
  element: DomElement,
  name: UiLocalizedAttributeName,
  ...message: [key: UiMessageKey, values?: UiMessageValues]
): void => {
  const [key, values = {}] = message
  const state = stateFor(element)
  const cell: AttributeCell = { element, name }
  const attribute: LocalizedAttribute = { cell, key, values }
  state.attributes.set(name, attribute)
  writeAttribute(cell, translateUiMessage(languageFor(element), key, values))
}

const setLanguageForTree = (root: UiLocalizationRoot, language: UiLanguage): void => {
  elementLanguages.set(root, language)
  const descendants = root.querySelectorAll('*')
  for (let index = 0; index < descendants.length; index += INDEX_INCREMENT) {
    const candidate = descendants[index]
    if (typeof candidate === 'object' && candidate !== null) {
      elementLanguages.set(candidate, language)
    }
  }
}

const localizedTextFor = (text: LocalizedText, language: UiLanguage): UiMessageText => {
  if ('resolve' in text) {
    return text.resolve(language)
  }
  return translateUiMessage(language, text.key, text.values)
}

const updateLocalizedText = (state: LocalizedElementState, language: UiLanguage): void => {
  if (typeof state.text !== 'undefined') {
    writeText(state.text.cell, localizedTextFor(state.text, language))
  }
}

const updateLocalizedAchievementTitle = (state: LocalizedElementState, language: UiLanguage): void => {
  if (typeof state.achievementTitle !== 'undefined') {
    writeText(
      state.achievementTitle.cell,
      translateAchievementTitle(language, state.achievementTitle.achievement),
    )
  }
}

const updateLocalizedAttributes = (state: LocalizedElementState, language: UiLanguage): void => {
  for (const attribute of state.attributes.values()) {
    writeAttribute(attribute.cell, translateUiMessage(language, attribute.key, attribute.values))
  }
}

const updateLocalizedState = (state: LocalizedElementState, language: UiLanguage): void => {
  elementLanguages.set(state.element, language)
  updateLocalizedText(state, language)
  updateLocalizedAchievementTitle(state, language)
  updateLocalizedAttributes(state, language)
}

const updateLocalizedCandidate = (candidate: unknown, language: UiLanguage): void => {
  if (typeof candidate === 'object' && candidate !== null) {
    const state = localizedElements.get(candidate)
    if (typeof state !== 'undefined') {
      updateLocalizedState(state, language)
    }
  }
}

const updateLocalizedElements = (root: UiLocalizationRoot, language: UiLanguage): void => {
  const elements = root.querySelectorAll(LOCALIZED_ELEMENT_SELECTOR)
  for (let index = 0; index < elements.length; index += INDEX_INCREMENT) {
    updateLocalizedCandidate(elements[index], language)
  }
}

/** Apply a validated language to every localized text and attribute below a mounted root. */
export const applyUiLanguage = (
  root: UiLocalizationRoot,
  input: unknown,
): Result.Result<UiLanguage, UiLanguageFailure> => {
  const decoded = decodeUiLanguage(input)
  if (Result.isFailure(decoded)) {
    return decoded
  }

  const language = decoded.success
  setLanguageForTree(root, language)
  updateLocalizedElements(root, language)
  return Result.succeed(language)
}
