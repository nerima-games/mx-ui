import { Result } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_NAME,
  backToRoot,
  cycleWorldMode,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  parseWorldSeed,
  worldNameLabel,
  type CreateWorldRequest,
  type MainMenuState,
  type SavedWorld,
  type UnreadableSave,
  type WorldSeed,
  type WorldTypeOption,
} from '../src/domain/main-menu'
import {
  EMPTY_SAVE_LIST_NOTE,
  MAIN_MENU_TITLE,
  ROOT_ENTRY_LABEL,
  createMainMenuView,
  requireRootButton,
  type MainMenuCallbacks,
} from '../src/application/main-menu-view'
import { fakeDocument, fakeElement, writeNames, type FakeElement } from './fake-dom'

const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [
  { sessionId: 'session-1', name: 'Cliff House' },
  { sessionId: 'session-2', name: 'Red Desert' },
]

const WORLD_TYPES: ReadonlyArray<WorldTypeOption> = [
  { value: 'standard', label: { en: 'Standard', ja: '標準' } },
  { value: 'caves', label: { en: 'Caves', ja: '洞窟' } },
]

const UNREADABLE_SAVE: UnreadableSave = {
  _tag: 'SaveDecodeError',
  key: 'save:broken',
  format: 'sv1',
  version: 1,
  reason: 'invalid header',
}

const mount = (overrides: Partial<MainMenuCallbacks> = {}) => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const states: Array<MainMenuState> = []
  const creates: Array<CreateWorldRequest> = []
  const loads: Array<SavedWorld> = []
  const deletes: Array<SavedWorld> = []
  const unreadableDeletes: Array<UnreadableSave> = []
  const exports: Array<SavedWorld> = []
  let settings = 0
  let multiplayer = 0
  let exits = 0
  const callbacks: MainMenuCallbacks = {
    onStateChange: (state) => states.push(state),
    onCreateWorld: (request) => creates.push(request),
    onLoadWorld: (world) => loads.push(world),
    onDeleteWorld: (world) => deletes.push(world),
    onDeleteUnreadableSave: (save) => unreadableDeletes.push(save),
    onExportWorld: (world) => exports.push(world),
    onOpenSettings: () => { settings += 1 },
    onOpenMultiplayer: () => { multiplayer += 1 },
    onExit: () => { exits += 1 },
    ...overrides,
  }
  const view = createMainMenuView(factory, parent, callbacks)
  const root = fakeElement(view.root)
  return {
    callbacks,
    creates,
    deletes,
    exits: () => exits,
    exports,
    factory,
    loads,
    multiplayer: () => multiplayer,
    parent,
    root,
    settings: () => settings,
    states,
    unreadableDeletes,
    view,
  }
}

const model = (
  state: MainMenuState = initialMainMenuState,
  worlds: ReadonlyArray<SavedWorld> = [],
  worldTypes: ReadonlyArray<WorldTypeOption> = WORLD_TYPES,
  unreadable: ReadonlyArray<UnreadableSave> = [],
) => mainMenuViewModel(state, worlds, worldTypes, unreadable)

const visiblePanels = (root: FakeElement): ReadonlyArray<string | undefined> =>
  root
    .findAll('data-mx-ui', 'menu-panel')
    .filter((panel) => !panel.attributes.has('hidden'))
    .map((panel) => panel.attributes.get('data-menu-panel'))

const EXPECTED_FNV_OFFSET_BASIS = 2166136261
const EXPECTED_FNV_PRIME = 16777619
const EXPECTED_UINT32_RANGE = 0x1_0000_0000
const EXPECTED_BYTE_RANGE = 0x100
const EXPECTED_BYTE_BITS = 8
const EXPECTED_ZERO = 0
const EXPECTED_ONE = 1
const EXPECTED_TWO = 2

const expectedUnsignedWord = (value: number): number => {
  if (value < EXPECTED_ZERO) {
    return value + EXPECTED_UINT32_RANGE
  }
  return value
}

const expectedXorLowByte = (leftByte: number, rightByte: number): number => {
  let left = leftByte
  let right = rightByte
  let place = EXPECTED_ONE
  let result = EXPECTED_ZERO
  for (let bit = EXPECTED_ZERO; bit < EXPECTED_BYTE_BITS; bit += EXPECTED_ONE) {
    const leftBit = left % EXPECTED_TWO
    const rightBit = right % EXPECTED_TWO
    if (leftBit !== rightBit) {
      result += place
    }
    left = Math.floor(left / EXPECTED_TWO)
    right = Math.floor(right / EXPECTED_TWO)
    place *= EXPECTED_TWO
  }
  return result
}

const expectedXorByte = (word: number, byte: number): number => {
  const unsigned = expectedUnsignedWord(word)
  const lowByte = unsigned % EXPECTED_BYTE_RANGE
  return unsigned - lowByte + expectedXorLowByte(lowByte, byte)
}

const independentExpectedSeed = (input: string): WorldSeed | { readonly _tag: 'InvalidWorldSeed'; readonly input: string; readonly reason: 'unsafe-integer' } => {
  const trimmed = input.trim()
  if (trimmed.length === EXPECTED_ZERO) {
    return { kind: 'random' }
  }
  if (/^[+-]?\d+$/u.test(trimmed)) {
    const integer = Number(trimmed)
    if (!Number.isSafeInteger(integer)) {
      return { _tag: 'InvalidWorldSeed', input, reason: 'unsafe-integer' }
    }
    return { kind: 'fixed', value: integer }
  }
  let hash = EXPECTED_FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(input)) {
    hash = Math.imul(expectedXorByte(hash, byte), EXPECTED_FNV_PRIME)
  }
  return { kind: 'fixed', value: expectedUnsignedWord(hash) }
}

describe('main menu domain', () => {
  it('preserves the draft across navigation and normalizes the confirmed name', () => {
    const named = nameWorld(openPanel(initialMainMenuState, 'new-world'), '  Ravine  ')
    const creative = cycleWorldMode(named)

    expect(backToRoot(creative)).toStrictEqual({
      panel: 'root',
      draft: { name: '  Ravine  ', seed: '', mode: 'creative', difficulty: 'normal', worldType: '' },
    })
    expect(worldNameLabel(creative.draft)).toBe('Ravine')
    expect(worldNameLabel({ name: '   ' })).toBe(DEFAULT_WORLD_NAME)
    expect(mainMenuViewModel(creative, SAVED_WORLDS)).toMatchObject({
      panel: 'new-world',
      worldNameInput: '  Ravine  ',
      worldName: 'Ravine',
      mode: 'creative',
      savedWorlds: SAVED_WORLDS,
    })
  })

  it('resolves buttons only for the declared root entries', () => {
    const factory = fakeDocument()
    const buttons = {
      'single-player': factory.createElement('button'),
      multiplayer: factory.createElement('button'),
      settings: factory.createElement('button'),
      exit: factory.createElement('button'),
    }
    expect(requireRootButton(buttons, 'single-player')).toEqual(Result.succeed(buttons['single-player']))
    expect(requireRootButton(buttons, 'exit')).toEqual(Result.succeed(buttons.exit))
    const dynamicButtons: Readonly<Record<string, (typeof buttons)['exit']>> = buttons
    expect(requireRootButton(dynamicButtons, 'missing')).toEqual(
      Result.fail({ _tag: 'MissingMainMenuButton', entry: 'missing' }),
    )
  })

  it('parses blank input as random and safe integer boundaries as fixed seeds', () => {
    expect(parseWorldSeed(' \t\n ')).toEqual(Result.succeed({ kind: 'random' }))
    expect(parseWorldSeed(String(Number.MAX_SAFE_INTEGER))).toEqual(
      Result.succeed({ kind: 'fixed', value: Number.MAX_SAFE_INTEGER }),
    )
    expect(parseWorldSeed(String(Number.MIN_SAFE_INTEGER))).toEqual(
      Result.succeed({ kind: 'fixed', value: Number.MIN_SAFE_INTEGER }),
    )
    expect(parseWorldSeed(String(Number.MAX_SAFE_INTEGER + 1))).toEqual(
      Result.fail({ _tag: 'InvalidWorldSeed', input: '9007199254740992', reason: 'unsafe-integer' }),
    )
    expect(parseWorldSeed(String(Number.MIN_SAFE_INTEGER - 1))).toEqual(
      Result.fail({ _tag: 'InvalidWorldSeed', input: '-9007199254740992', reason: 'unsafe-integer' }),
    )
  })

  it('hashes non-integer Unicode seeds with an independently calculated UTF-8 FNV-1a value', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const expected = independentExpectedSeed(input)
        const actual = parseWorldSeed(input)
        if ('_tag' in expected) {
          expect(Result.isFailure(actual)).toBe(true)
          if (Result.isFailure(actual)) {
            expect(actual.failure).toEqual(expected)
          }
        } else {
          expect(Result.isSuccess(actual)).toBe(true)
          if (Result.isSuccess(actual)) {
            expect(actual.success).toEqual(expected)
          }
        }
      }),
    )
  })
})

describe('operable main menu', () => {
  it('centers the four root actions and delegates connected external actions', () => {
    const mounted = mount()
    mounted.view.render(model())

    const entries = mounted.root.findAll('data-mx-ui', 'menu-entry')
    expect(mounted.parent.children).toContain(mounted.root)
    expect(mounted.root.style.properties.get('place-items')).toBe('center')
    expect(mounted.root.find('data-mx-ui', 'menu-title')?.textContent).toBe(MAIN_MENU_TITLE)
    expect(entries.map((entry) => entry.attributes.get('data-menu-entry'))).toEqual([
      'single-player',
      'multiplayer',
      'settings',
      'exit',
    ])
    expect(entries.map((entry) => entry.attributes.get('aria-label'))).toEqual([
      ROOT_ENTRY_LABEL['single-player'],
      ROOT_ENTRY_LABEL.multiplayer,
      ROOT_ENTRY_LABEL.settings,
      ROOT_ENTRY_LABEL.exit,
    ])
    expect(mounted.root.find('data-menu-entry', 'multiplayer')?.attributes.has('disabled')).toBe(false)
    expect(mounted.root.find('data-menu-entry', 'exit')?.attributes.has('disabled')).toBe(false)

    mounted.root.find('data-menu-entry', 'single-player')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toEqual(['load-world'])
    mounted.root.find('data-menu-entry', 'settings')?.dispatch('click')
    mounted.root.find('data-menu-entry', 'multiplayer')?.dispatch('click')
    mounted.root.find('data-menu-entry', 'exit')?.dispatch('click')
    expect(mounted.settings()).toBe(1)
    expect(mounted.multiplayer()).toBe(1)
    expect(mounted.exits()).toBe(1)
  })

  it('renders host saves, loads and exports them, and requires confirmation before deletion', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))

    const rows = mounted.root.findAll('data-mx-ui', 'menu-world-row')
    expect(rows.map((row) => row.attributes.get('data-session-id'))).toEqual(['session-1', 'session-2'])
    expect(rows[0]?.attributes.get('aria-label')).toBe('Load Cliff House (session-1)')
    rows[1]?.dispatch('click')
    expect(mounted.loads).toEqual([SAVED_WORLDS[1]])
    mounted.root.find('data-mx-ui', 'menu-world-export')?.dispatch('click')
    expect(mounted.exports).toEqual([SAVED_WORLDS[0]])

    mounted.root.find('data-mx-ui', 'menu-world-delete')?.dispatch('click')
    expect(mounted.deletes).toEqual([])
    expect(mounted.root.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden')).toBe(false)
    mounted.root.find('data-mx-ui', 'menu-world-delete-confirm')?.dispatch('click')
    expect(mounted.deletes).toEqual([SAVED_WORLDS[0]])
    expect(mounted.root.find('data-mx-ui', 'menu-world-row-container')?.attributes.has('hidden')).toBe(false)
  })

  it('renders unreadable save details and only delegates deletion after confirmation', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [], WORLD_TYPES, [UNREADABLE_SAVE]))
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-summary')?.textContent).toBe('1 unreadable save(s)')
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-detail')?.textContent).toContain('invalid header')
    mounted.root.find('data-mx-ui', 'menu-unreadable-delete')?.dispatch('click')
    expect(mounted.unreadableDeletes).toEqual([])
    mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.dispatch('click')
    expect(mounted.unreadableDeletes).toEqual([UNREADABLE_SAVE])
  })

  it('creates with all host-supported fields and the parsed seed', () => {
    const mounted = mount()
    mounted.view.render(model())
    mounted.root.find('data-menu-entry', 'single-player')?.dispatch('click')
    mounted.root.find('data-mx-ui', 'menu-new-world')?.dispatch('click')

    const name = mounted.root.find('data-mx-ui', 'menu-world-name')
    const seed = mounted.root.find('data-mx-ui', 'menu-world-seed')
    if (name === undefined || seed === undefined) {
      throw new Error('create-world fields were not mounted')
    }
    name.value = '  Ravine  '
    name.dispatch('input')
    seed.value = '41'
    seed.dispatch('input')
    mounted.root.find('data-mx-ui', 'menu-game-mode')?.dispatch('click')
    mounted.root.find('data-mx-ui', 'menu-difficulty')?.dispatch('click')
    mounted.root.find('data-mx-ui', 'menu-world-type')?.dispatch('click')
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')

    expect(mounted.creates).toEqual([{
      name: 'Ravine',
      seed: { kind: 'fixed', value: 41 },
      mode: 'creative',
      difficulty: 'hard',
      worldType: 'caves',
    }])
  })

  it('creates with a random seed when the seed field contains only whitespace', () => {
    const mounted = mount()
    mounted.view.render(model())
    mounted.root.find('data-menu-entry', 'single-player')?.dispatch('click')
    mounted.root.find('data-mx-ui', 'menu-new-world')?.dispatch('click')
    const seed = mounted.root.find('data-mx-ui', 'menu-world-seed')
    if (seed === undefined) {
      throw new Error('seed field was not mounted')
    }
    seed.value = ' \t '
    seed.dispatch('input')
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')

    expect(mounted.creates[0]?.seed).toEqual({ kind: 'random' })
  })

  it('rejects unsafe integer seeds and creates without a selector when the host has no world types', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'new-world')))
    const seed = mounted.root.find('data-mx-ui', 'menu-world-seed')
    if (seed === undefined) {
      throw new Error('seed field was not mounted')
    }
    seed.value = '9007199254740992'
    seed.dispatch('input')
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')
    expect(mounted.creates).toEqual([])
    expect(seed.attributes.get('aria-invalid')).toBe('true')
    expect(mounted.root.find('data-mx-ui', 'menu-seed-error')?.attributes.has('hidden')).toBe(false)

    mounted.view.render(model(openPanel(initialMainMenuState, 'new-world'), [], []))
    expect(mounted.root.find('data-mx-ui', 'menu-world-type')?.attributes.get('data-world-type-options')).toBe('empty')
    expect(mounted.root.find('data-menu-field', 'world-type')?.attributes.has('hidden')).toBe(true)
    expect(mounted.root.find('data-mx-ui', 'menu-world-type')?.attributes.has('hidden')).toBe(true)
    expect(mounted.root.find('data-mx-ui', 'menu-create-world')?.attributes.has('disabled')).toBe(false)
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')
    expect(mounted.creates).toEqual([{
      name: 'New World',
      seed: { kind: 'random' },
      mode: 'survival',
      difficulty: 'normal',
    }])
  })

  it('uses the localized empty-save message and refuses unconnected callbacks', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('div'))
    const view = createMainMenuView(factory, parent)
    view.render(model())
    const root = fakeElement(view.root)

    expect(root.find('data-mx-ui', 'menu-entry')?.attributes.has('disabled')).toBe(false)
    root.find('data-menu-entry', 'multiplayer')?.dispatch('click')
    root.find('data-menu-entry', 'settings')?.dispatch('click')
    root.find('data-menu-entry', 'exit')?.dispatch('click')
    expect(visiblePanels(root)).toEqual(['root'])

    root.find('data-menu-entry', 'single-player')?.dispatch('click')
    expect(root.find('data-mx-ui', 'menu-note')?.textContent).toBe(EMPTY_SAVE_LIST_NOTE)
    expect(root.find('data-mx-ui', 'menu-note')?.attributes.has('hidden')).toBe(false)
    expect(root.listenersInTree().every((listener) => listener === 'click' || listener === 'input')).toBe(true)
    expect(root.listenersInTree()).not.toContain('keydown')
  })

  it('does not write the DOM again when the host renders the same menu model', () => {
    const mounted = mount()
    const current = model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS, WORLD_TYPES, [UNREADABLE_SAVE])
    mounted.view.render(current)
    const before = mounted.factory.mark()

    mounted.view.render(current)

    expect(writeNames(mounted.factory.since(before))).toEqual([])
  })
})
