// @vitest-environment jsdom

import { Result, Schema } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, itemStack } from '@nerima-games/mc-sim'
import {
  ACHIEVEMENT_TITLES,
  emptyInventorySnapshot,
  UI_LANGUAGES,
  UI_MESSAGES,
  UI_TRANSLATION_KEY_COUNT,
  initialMainMenuState,
  ItemDisplayNameSchema,
  type ItemDisplayNameResolver,
  type UiLanguage,
  applyUiLanguage,
  createEnchantingTableView,
  createInventoryView,
  createMainMenuView,
  createSettingsView,
  decodeUiLanguage,
  inventoryViewModel,
  mainMenuViewModel,
  type WorldTypeOption,
  inputActionMessageKey,
  resolveItemDisplayName,
  enchantingTableViewModel,
  makeUiMount,
  settingsViewModel,
  translateUiMessage,
} from '../src/index.js'
import {
  applyUiLanguage as applyLanguageToRoot,
  setLocalizedAchievementTitle,
  setLocalizedAttribute,
  setLocalizedText,
  writeLocalizedTextUsing,
  type UiLocalizationRoot,
} from '../src/application/ui-localization.js'
import { textCell } from '../src/application/dom-write.js'
import { defaultItemDisplayNameResolver, itemDisplayNameView } from '../src/domain/item-display-name.js'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'
import type { ItemType } from '@nerima-games/mc-kernel'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'
import { asUiMessageText, asWorldTypeId } from './helpers/ui3-brand-values'

describe('UI language', () => {
  it('localizes the recipe-book grid guidance in English and Japanese', () => {
    expect(translateUiMessage('en', 'recipe-book.no-grid-fit')).toBe('Does not fit a crafting grid')
    expect(translateUiMessage('ja', 'recipe-book.no-grid-fit')).toBe('クラフト枠に配置できません')
    expect(translateUiMessage('en', 'recipe-book.requires-table')).toBe('Requires a 3×3 grid')
    expect(translateUiMessage('ja', 'recipe-book.requires-table')).toBe('3×3 のクラフト枠が必要です')
  })

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

  it('updates localized attributes on the language root itself', () => {
    const dialog = document.createElement('section')
    setLocalizedAttribute(dialog, 'aria-label', 'pause.dialog.options')

    expect(dialog.getAttribute('aria-label')).toBe('Settings')
    expect(Result.isSuccess(applyLanguageToRoot(dialog, 'ja'))).toBe(true)
    expect(dialog.getAttribute('aria-label')).toBe('設定')
  })

  it('updates mounted English and Japanese menu text, aria labels, and placeholders', () => {
    const host = document.createElement('main')
    const worldTypes: ReadonlyArray<WorldTypeOption> = [
      {
        label: { en: asUiMessageText('Standard'), ja: asUiMessageText('標準') },
        value: asWorldTypeId('standard'),
      },
    ]
    let createdWorldName = ''
    const menu = createMainMenuView(document, host, {
      onCreateWorld: ({ name }) => {
        createdWorldName = name
      },
      onLoadWorld: () => undefined,
      onOpenSettings: () => undefined,
      onStateChange: () => undefined,
    })
    menu.render(mainMenuViewModel(initialMainMenuState, [], worldTypes))
    host.querySelector<HTMLButtonElement>('[data-menu-entry="single-player"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-new-world"]')?.click()
    const inventory = createInventoryView(document, host)
    const carriedStack = itemStack('stone', 1)
    if (Result.isFailure(carriedStack)) {
      expect.fail('Expected a valid test item stack')
    }
    const inventorySnapshot = { ...emptyInventorySnapshot, carried: carriedStack.success }
    const renderInventory = (language: UiLanguage): void => {
      inventory.render(
        inventoryViewModel(inventorySnapshot, fakeItemDisplayNameOptions(language)),
        { focused: { kind: 'crafting-output' }, status: 'Carrying item' },
      )
    }
    renderInventory('en')
    const newWorldButton = host.querySelector('[data-mx-ui="menu-new-world"]')
    const worldNameInput = host.querySelector<HTMLInputElement>('[data-mx-ui="menu-world-name"]')
    const carriedItem = host.querySelector('[data-mx-ui="carried"] [data-mx-ui="slot-item"]')

    expect(newWorldButton?.textContent).toBe('Create New World')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('World name')
    expect(carriedItem?.textContent).toBe('en:stone')

    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)
    renderInventory('ja')
    expect(carriedItem?.textContent).toBe('ja:stone')
    expect(newWorldButton?.textContent).toBe('新しいワールドを作成')
    expect(newWorldButton?.getAttribute('aria-label')).toBe('新しいワールドを作成')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('ワールド名')
    host.querySelector<HTMLButtonElement>('[data-menu-panel="new-world"] [data-menu-action="confirm"]')?.click()
    expect(createdWorldName).toBe('新しいワールド')

    expect(Result.isSuccess(applyUiLanguage(host, 'en'))).toBe(true)
    expect(newWorldButton?.textContent).toBe('Create New World')
    expect(worldNameInput?.getAttribute('placeholder')).toBe('World name')
    expect(Result.isFailure(applyUiLanguage(host, 'fr'))).toBe(true)
    expect(newWorldButton?.textContent).toBe('Create New World')
    menu.destroy()
  })

  it('inherits the parent language when the menu is mounted after localization', () => {
    const host = document.createElement('main')
    expect(Result.isSuccess(applyUiLanguage(host, 'ja'))).toBe(true)

    const menu = createMainMenuView(document, host)
    menu.render(mainMenuViewModel(initialMainMenuState))

    expect(host.querySelector('[data-menu-entry="single-player"]')?.textContent).toBe('シングルプレイ')
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

    const resolverCalls: Array<Readonly<{ itemType: ItemType; language: UiLanguage }>> = []
    const resolver: ItemDisplayNameResolver = (itemType, language) => {
      resolverCalls.push({ itemType, language })
      return Result.succeed(`${language}:${itemType}`)
    }
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const callsBefore = resolverCalls.length
        const resolved = resolveItemDisplayName(input, 'en', resolver)
        if (Result.isFailure(resolved)) {
          const failureTag = Reflect.get(resolved.failure, '_tag')
          expect(failureTag).toBeTypeOf('string')
          expect(failureTag.length).toBeGreaterThan(0)
          if (failureTag === 'InvalidItemId') {
            expect(resolverCalls).toHaveLength(callsBefore)
          }
          return
        }
        expect(Result.isSuccess(Schema.decodeUnknownResult(ItemDisplayNameSchema)(resolved.success))).toBe(true)
        expect(resolved.success).not.toContain('minecraft:')
      }),
    )
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const decoded = Schema.decodeUnknownResult(ItemDisplayNameSchema)(input)
        if (Result.isFailure(decoded)) {
          expect(decoded.failure).toBeDefined()
          return
        }
        expect(Result.isSuccess(Schema.decodeUnknownResult(ItemDisplayNameSchema)(decoded.success))).toBe(true)
      }),
    )

    const namespacedId = resolveItemDisplayName('minecraft:iron_ingot', 'ja', resolver)
    expect(Result.isSuccess(namespacedId)).toBe(true)
    expect(resolverCalls.at(-1)).toStrictEqual({ itemType: 'iron_ingot', language: 'ja' })
    const defaultView = itemDisplayNameView('stone')
    expect(defaultView.language).toBe('en')
    expect(Result.isFailure(defaultView.result)).toBe(true)
    if (Result.isFailure(defaultView.result)) {
      expect(defaultView.result.failure).toStrictEqual({ _tag: 'MissingItemDisplayNameResolver' })
    }
    const resolverFailure = resolveItemDisplayName('stone', 'en', () =>
      Result.fail({ _tag: 'ItemDisplayNameUnavailable' as const }),
    )
    expect(Result.isFailure(resolverFailure)).toBe(true)
    if (Result.isFailure(resolverFailure)) {
      expect(resolverFailure.failure).toStrictEqual({ _tag: 'ItemDisplayNameUnavailable' })
    }
    const callsBeforeUnknown = resolverCalls.length
    const unknownId = resolveItemDisplayName('minecraft:no_such_item', 'en', resolver)
    expect(Result.isFailure(unknownId)).toBe(true)
    expect(resolverCalls).toHaveLength(callsBeforeUnknown)
    expect(resolveItemDisplayName('stone', 'ja')).toStrictEqual(
      Result.fail({ _tag: 'MissingItemDisplayNameResolver' }),
    )
    expect(Result.isSuccess(resolveItemDisplayName('stone', 'ja', defaultItemDisplayNameResolver))).toBe(true)
    expect(
      Result.isFailure(resolveItemDisplayName('stone', 'en', () => Result.succeed(''))),
    ).toBe(true)
    const namespacedDisplayName = resolveItemDisplayName('stone', 'en', () =>
      Result.succeed('minecraft:stone'),
    )
    expect(Result.isFailure(namespacedDisplayName)).toBe(true)
    if (Result.isFailure(namespacedDisplayName)) {
      expect(Reflect.get(namespacedDisplayName.failure, '_tag')).toBe('InvalidItemDisplayName')
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

  it('maps arbitrary input-action values to a registered UI message key', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(Object.hasOwn(UI_MESSAGES, inputActionMessageKey(input))).toBe(true)
      }),
    )
  })

  it('classifies arbitrary item ids as a typed failure or a decodable display name', () => {
    const options = fakeItemDisplayNameOptions('ja')
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const view = itemDisplayNameView(input, options)
        expect(view.language).toBe('ja')
        if (Result.isFailure(view.result)) {
          expect(view.result.failure).toStrictEqual({ _tag: 'InvalidItemId' })
          return
        }
        expect(Result.isSuccess(Schema.decodeUnknownResult(ItemDisplayNameSchema)(view.result.success))).toBe(true)
        expect(view.result.success).not.toContain('minecraft:')
      }),
    )
  })

  it('rejects explicit null options and absent option languages without choosing a default', () => {
    const resolverCalls: Array<Readonly<{ itemType: ItemType; language: UiLanguage }>> = []
    const resolver: ItemDisplayNameResolver = (itemType, language) => {
      resolverCalls.push({ itemType, language })
      return Result.succeed(`${language}:${itemType}`)
    }
    const invalidViews = [
      itemDisplayNameView('stone', null),
      itemDisplayNameView('stone', { language: null, resolver }),
      itemDisplayNameView('stone', { language: undefined, resolver }),
      itemDisplayNameView('stone', { language: 'ja', resolver: null }),
    ]

    for (const view of invalidViews) {
      expect(view.language).toBeUndefined()
      expect(Result.isFailure(view.result)).toBe(true)
      if (Result.isFailure(view.result)) {
        expect(view.result.failure).toStrictEqual({ _tag: 'InvalidItemDisplayNameOptions' })
      }
    }

    fc.assert(
      fc.property(fc.anything(), (itemId) => {
        const invalidView = itemDisplayNameView(itemId, null)
        expect(invalidView.language).toBeUndefined()
        expect(Result.isFailure(invalidView.result)).toBe(true)
      }),
    )
    expect(resolverCalls).toHaveLength(0)
  })

  it.each(['__proto__', 'constructor', 'toString'])('maps inherited input-action key %s to the unknown message', (action) => {
    expect(inputActionMessageKey(action)).toBe('settings.action.unknown')
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
