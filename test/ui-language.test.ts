// @vitest-environment jsdom

import { Result } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import {
  ACHIEVEMENT_TITLES,
  UI_LANGUAGES,
  UI_MESSAGES,
  UI_TRANSLATION_KEY_COUNT,
  applyUiLanguage,
  createEnchantingTableView,
  createMainMenuView,
  createSettingsView,
  decodeUiLanguage,
  inputActionMessageKey,
  enchantingTableViewModel,
  makeUiMount,
  settingsViewModel,
  translateUiMessage,
} from '../src/index.js'
import {
  applyUiLanguage as applyLanguageToRoot,
  setLocalizedAchievementTitle,
  setLocalizedText,
  writeLocalizedTextUsing,
  type UiLocalizationRoot,
} from '../src/application/ui-localization.js'
import { textCell } from '../src/application/dom-write.js'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

describe('UI language', () => {
  it('returns typed failures for unsupported inputs through the decoder and mount controller', () => {
    const mount = makeUiMount({ root: document.createElement('main') })
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const decoded = decodeUiLanguage(input)
        const updated = mount.updateLanguage(input)
        const applied = applyUiLanguage(document.createElement('main'), input)

        if (Result.isFailure(decoded)) {
          expect(Reflect.get(decoded.failure, '_tag')).toBe('UnsupportedUiLanguage')
          expect(Result.isFailure(updated)).toBe(true)
          expect(Result.isFailure(applied)).toBe(true)
          if (Result.isFailure(updated)) {
            expect(Reflect.get(updated.failure, '_tag')).toBe('UnsupportedUiLanguage')
          }
          if (Result.isFailure(applied)) {
            expect(Reflect.get(applied.failure, '_tag')).toBe('UnsupportedUiLanguage')
          }
          return
        }

        expect(UI_LANGUAGES).toContain(decoded.success)
        expect(Result.isSuccess(updated)).toBe(true)
        expect(Result.isSuccess(applied)).toBe(true)
        if (Result.isSuccess(updated)) {
          expect(updated.success).toBe(decoded.success)
        }
        if (Result.isSuccess(applied)) {
          expect(Result.isSuccess(decodeUiLanguage(applied.success))).toBe(true)
          expect(applied.success).toBe(decoded.success)
        }
      }),
    )

    for (const input of [null, undefined, 'fr', 'JA', Object('ja')]) {
      expect(Result.isFailure(decodeUiLanguage(input))).toBe(true)
      const updated = mount.updateLanguage(input)
      expect(Result.isFailure(updated)).toBe(true)
      if (Result.isFailure(updated)) {
        expect(Reflect.get(updated.failure, '_tag')).toBe('UnsupportedUiLanguage')
      }
    }
  })

  it('updates mounted English and Japanese menu text, aria labels, and placeholders', () => {
    const host = document.createElement('main')
    let createdWorldName = ''
    const menu = createMainMenuView(document, host, {
      onCreateWorld: ({ name }) => {
        createdWorldName = name
      },
      onLoadWorld: () => undefined,
      onOpenSettings: () => undefined,
      onStateChange: () => undefined,
    })
    const newWorldButton = host.querySelector('[data-menu-entry="new-world"]')
    const worldNameInput = host.querySelector<HTMLInputElement>('[data-mx-ui="menu-world-name"]')

    expect(newWorldButton?.textContent).toBe('Create New World')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('New World')

    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)
    expect(newWorldButton?.textContent).toBe('新しいワールドを作成')
    expect(newWorldButton?.getAttribute('aria-label')).toBe('新しいワールドを作成')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('新しいワールド')
    host.querySelector<HTMLButtonElement>('[data-menu-action="confirm"]')?.click()
    expect(createdWorldName).toBe('新しいワールド')

    expect(Result.isSuccess(applyUiLanguage(host, 'en'))).toBe(true)
    expect(newWorldButton?.textContent).toBe('Create New World')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('New World')
    expect(Result.isFailure(applyUiLanguage(host, 'fr'))).toBe(true)
    expect(newWorldButton?.textContent).toBe('Create New World')
    menu.destroy()
  })

  it('inherits the active language for binding rows added after a locale change', () => {
    const host = document.createElement('main')
    const view = createSettingsView(document, host)
    const model = settingsViewModel(DEFAULT_SETTINGS, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS)
    if (Result.isFailure(model)) {
      throw new Error('Expected valid default settings')
    }
    view.render(model.success)
    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)
    view.render({
      ...model.success,
      bindingRows: [...model.success.bindingRows, { action: 'moddedAction', code: undefined }],
    })

    const addedCaption = host.querySelector('[data-binding-action="moddedAction"]')?.previousElementSibling
    expect(addedCaption?.textContent).toBe('不明な操作')
  })

  it('localizes known enchantments and preserves an unknown identifier as game data', () => {
    const host = document.createElement('main')
    const view = createEnchantingTableView(document, host)
    view.render(enchantingTableViewModel({
      item: undefined,
      lapis: undefined,
      offers: [
        { enchantmentId: 'minecraft:sharpness', enchantmentLevel: 3, lapisCost: 1, levelCost: 12 },
        { enchantmentId: 'example:future_enchantment', enchantmentLevel: 1, lapisCost: 2, levelCost: 8 },
        undefined,
      ],
    }))

    const labels = (): ReadonlyArray<string> =>
      Array.from(host.querySelectorAll('[data-mx-ui="enchanting-offer-label"]')).map(({ textContent }) => textContent ?? '')
    expect(labels()).toStrictEqual([
      'Sharpness 3; 12 levels; 1 lapis',
      'example:future_enchantment 1; 8 levels; 2 lapis',
      'Unavailable enchantment offer',
    ])

    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)
    expect(labels()).toStrictEqual([
      'ダメージ増加 3、経験値 12 レベル、ラピスラズリ 1 個',
      'example:future_enchantment 1、経験値 8 レベル、ラピスラズリ 2 個',
      'このエンチャントは選べません',
    ])
  })

  it('covers both languages for every UI message and achievement title', () => {
    for (const [key, messages] of Object.entries(UI_MESSAGES)) {
      expect(messages.en, `${key} English`).toBeTypeOf('string')
      expect(messages.en.length, `${key} English`).toBeGreaterThan(0)
      expect(messages.ja, `${key} Japanese`).toBeTypeOf('string')
      expect(messages.ja.length, `${key} Japanese`).toBeGreaterThan(0)
    }

    for (const [achievement, titles] of Object.entries(ACHIEVEMENT_TITLES)) {
      expect(titles.en, `${achievement} English`).toBeTypeOf('string')
      expect(titles.en.length, `${achievement} English`).toBeGreaterThan(0)
      expect(titles.ja, `${achievement} Japanese`).toBeTypeOf('string')
      expect(titles.ja.length, `${achievement} Japanese`).toBeGreaterThan(0)
    }

    expect(Object.keys(ACHIEVEMENT_TITLES)).toHaveLength(126)
    expect(UI_TRANSLATION_KEY_COUNT).toBe(
      Object.keys(UI_MESSAGES).length + Object.keys(ACHIEVEMENT_TITLES).length,
    )
    expect(translateUiMessage('en', 'settings.choice.motion.full')).toBe('Full')
    expect(translateUiMessage('ja', 'settings.choice.motion.full')).toBe('通常')
    expect(inputActionMessageKey('Move')).toBe('settings.action.move')
    expect(inputActionMessageKey('Jump')).toBe('settings.action.jump')
    expect(inputActionMessageKey('Open inventory')).toBe('settings.action.open-inventory')
    expect(translateUiMessage('ja', inputActionMessageKey('Open inventory'))).toBe('インベントリを開く')
    expect(inputActionMessageKey('unregistered action')).toBe('settings.action.unknown')
    expect(translateUiMessage('en', 'debug.fps')).toBe('FPS: {fps}')
  })

  it('updates achievement titles and dynamic text when a mounted root changes language', () => {
    const host = document.createElement('main')
    const achievement = document.createElement('span')
    const dynamicText = document.createElement('span')
    host.append(achievement, dynamicText)

    setLocalizedAchievementTitle(achievement, 'minecraft:story/root')
    writeLocalizedTextUsing(textCell(dynamicText), (language) =>
      translateUiMessage(language, 'debug.fps', { fps: 20 }),
    )

    expect(achievement.textContent).toBe('First Steps')
    expect(dynamicText.textContent).toBe('FPS: 20')
    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)
    expect(achievement.textContent).toBe('最初の一歩')
    expect(dynamicText.textContent).toBe('FPS: 20')
  })

  it('accepts array-like localization roots while ignoring candidates without localized state', () => {
    const label = document.createElement('span')
    const unrelatedObject = {}
    setLocalizedText(label, 'settings.close')

    const candidates: ReadonlyArray<unknown> = [null, 'unregistered', unrelatedObject, label]
    const root: UiLocalizationRoot = {
      querySelectorAll: () => candidates,
    }

    expect(Result.isSuccess(applyLanguageToRoot(root, 'ja'))).toBe(true)
    expect(label.textContent).toBe('設定を閉じる')
  })
})
