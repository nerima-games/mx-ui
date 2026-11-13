import { Result } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_NAME,
  backToRoot,
  cycleWorldMode,
  decodeWorldNameText,
  decodeWorldSeedText,
  decodeWorldTypeId,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  parseWorldSeed,
  seedWorld,
  setWorldType,
  worldNameLabel,
  type CreateWorldRequest,
  type MainMenuState,
  type SavedWorld,
  type UnreadableSave,
  type WorldSeed,
  type WorldSeedFailure,
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
import {
  asSaveSliceId,
  asSaveVersion,
  asUiMessageText,
  asWorldId,
  asWorldNameText,
  asWorldSeedText,
  asWorldSeedValue,
  asWorldTypeId,
} from './helpers/ui3-brand-values'

const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [
  { sessionId: asWorldId('session-1'), name: asWorldNameText('Cliff House') },
  { sessionId: asWorldId('session-2'), name: asWorldNameText('Red Desert') },
]

const WORLD_TYPES: ReadonlyArray<WorldTypeOption> = [
  { value: asWorldTypeId('standard'), label: { en: asUiMessageText('Standard'), ja: asUiMessageText('標準') } },
  { value: asWorldTypeId('caves'), label: { en: asUiMessageText('Caves'), ja: asUiMessageText('洞窟') } },
]

const UNREADABLE_SAVE: UnreadableSave = {
  _tag: 'SaveDecodeError',
  key: asWorldId('save:broken'),
  format: asSaveSliceId('sv1'),
  version: asSaveVersion(1),
  reason: asUiMessageText('invalid header'),
  record: { _tag: 'Chunk', key: asWorldId('chunk:broken') },
  repair: {
    lastHealthyRevisionAvailable: true,
    discardableChunkKeys: [asWorldId('chunk:discardable')],
  },
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

const independentExpectedSeed = (input: string): WorldSeed | WorldSeedFailure => {
  const trimmed = input.trim()
  if (trimmed.length === EXPECTED_ZERO) {
    return { kind: 'random' }
  }
  if (/^[+-]?\d+$/u.test(trimmed)) {
    const integer = Number(trimmed)
    if (!Number.isSafeInteger(integer)) {
      return { _tag: 'InvalidWorldSeed', input: asWorldSeedText(input), reason: 'unsafe-integer' }
    }
    return { kind: 'fixed', value: asWorldSeedValue(integer) }
  }
  let hash = EXPECTED_FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(input)) {
    hash = Math.imul(expectedXorByte(hash, byte), EXPECTED_FNV_PRIME)
  }
  return { kind: 'fixed', value: asWorldSeedValue(expectedUnsignedWord(hash)) }
}

describe('main menu domain', () => {
  it('decodes host menu strings into their branded input types', () => {
    expect(decodeWorldNameText('Ravine')).toEqual(Result.succeed(asWorldNameText('Ravine')))
    expect(decodeWorldSeedText('42')).toEqual(Result.succeed(asWorldSeedText('42')))
    expect(decodeWorldTypeId('caves')).toEqual(Result.succeed(asWorldTypeId('caves')))
    expect(Result.isFailure(decodeWorldNameText(null))).toBe(true)
    expect(Result.isFailure(decodeWorldSeedText(42))).toBe(true)
    expect(Result.isFailure(decodeWorldTypeId(undefined))).toBe(true)
  })

  it('property: brand decoders return typed results for arbitrary host inputs without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const decoderSuccesses = [
          Result.isSuccess(decodeWorldNameText(input)),
          Result.isSuccess(decodeWorldSeedText(input)),
          Result.isSuccess(decodeWorldTypeId(input)),
        ]
        const expectedSuccess = typeof input === 'string'
        expect(decoderSuccesses).toEqual([expectedSuccess, expectedSuccess, expectedSuccess])
      }),
    )
  })

  it('preserves a branded world name in the draft', () => {
    const named = nameWorld(initialMainMenuState, asWorldNameText('Raw Ridge'))

    expect(named.draft.name).toBe(asWorldNameText('Raw Ridge'))
  })

  it('property: branded world name, seed, and type remain in their matching draft fields', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (name, seed, worldType) => {
        const worldName = asWorldNameText(name)
        const worldSeed = asWorldSeedText(seed)
        const worldTypeId = asWorldTypeId(worldType)
        const state = setWorldType(
          seedWorld(nameWorld(initialMainMenuState, worldName), worldSeed),
          worldTypeId,
        )

        expect(state.draft.name).toBe(worldName)
        expect(state.draft.seed).toBe(worldSeed)
        expect(state.draft.worldType).toBe(worldTypeId)
      }),
    )
  })

  it('preserves the draft across navigation and normalizes the confirmed name', () => {
    const named = nameWorld(openPanel(initialMainMenuState, 'new-world'), asWorldNameText('  Ravine  '))
    const creative = cycleWorldMode(named)

    expect(backToRoot(creative)).toStrictEqual({
      panel: 'root',
      draft: {
        name: '  Ravine  ',
        seed: asWorldSeedText(''),
        mode: 'creative',
        difficulty: 'normal',
        worldType: asWorldTypeId(''),
      },
    })
    expect(worldNameLabel(creative.draft)).toBe('Ravine')
    expect(openPanel(creative, 'new-world')).toBe(creative)
    expect(cycleWorldMode(creative).draft.mode).toBe('survival')
    expect(mainMenuViewModel(creative, SAVED_WORLDS)).toMatchObject({
      panel: 'new-world',
      worldNameInput: '  Ravine  ',
      worldName: 'Ravine',
      mode: 'creative',
      savedWorlds: SAVED_WORLDS,
    })
  })

  it('uses the vanilla default world name when the name is omitted or only whitespace', () => {
    expect(worldNameLabel(initialMainMenuState.draft)).toBe(DEFAULT_WORLD_NAME)
    expect(worldNameLabel({ name: asWorldNameText(' \t\n ') })).toBe(DEFAULT_WORLD_NAME)
  })

  it('selects an available world type after sparse host entries', () => {
    const laterWorldType: WorldTypeOption = {
      value: asWorldTypeId('later'),
      label: { en: asUiMessageText('Later'), ja: asUiMessageText('後') },
    }
    const sparseWorldTypes = new Array<WorldTypeOption>(2)
    sparseWorldTypes[1] = laterWorldType

    const viewModel = mainMenuViewModel(initialMainMenuState, [], sparseWorldTypes)

    expect(viewModel.worldType).toBe(laterWorldType.value)
    expect(viewModel.worldTypes.at(1)).toEqual(laterWorldType)
  })

  it('returns typed failures for explicit null world-type inputs', () => {
    const invalidState = {
      ...initialMainMenuState,
      draft: { ...initialMainMenuState.draft, worldType: null },
    }
    const invalidWorldTypes: ReadonlyArray<unknown> = [{
      value: null,
      label: { en: asUiMessageText('Standard'), ja: asUiMessageText('標準') },
    }]

    expect(mainMenuViewModel(invalidState)).toEqual(
      Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'state' }),
    )
    expect(mainMenuViewModel(initialMainMenuState, [], invalidWorldTypes)).toEqual(
      Result.fail({ _tag: 'InvalidMainMenuViewModelInput', field: 'worldTypes' }),
    )
  })

  it('returns a typed failure or model for arbitrary main-menu state input', () => {
    fc.assert(fc.property(fc.anything(), (state) => {
      const output = mainMenuViewModel(state)
      const isFailure = typeof output === 'object' && output !== null && '_tag' in output && output._tag === 'Failure'
      expect(isFailure || 'panel' in output).toBe(true)
    }))
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
      Result.succeed({ kind: 'fixed', value: asWorldSeedValue(Number.MAX_SAFE_INTEGER) }),
    )
    expect(parseWorldSeed(String(Number.MIN_SAFE_INTEGER))).toEqual(
      Result.succeed({ kind: 'fixed', value: asWorldSeedValue(Number.MIN_SAFE_INTEGER) }),
    )
    expect(parseWorldSeed(String(Number.MAX_SAFE_INTEGER + 1))).toEqual(
      Result.fail({ _tag: 'InvalidWorldSeed', input: asWorldSeedText('9007199254740992'), reason: 'unsafe-integer' }),
    )
    expect(parseWorldSeed(String(Number.MIN_SAFE_INTEGER - 1))).toEqual(
      Result.fail({ _tag: 'InvalidWorldSeed', input: asWorldSeedText('-9007199254740992'), reason: 'unsafe-integer' }),
    )
  })

  it('returns a typed failure for a non-string seed input', () => {
    expect(parseWorldSeed(null)).toEqual(Result.fail({ _tag: 'InvalidWorldSeedInput', reason: 'not-string' }))
  })

  it('matches fixed FNV-1a 32-bit reference vectors over the original UTF-8 bytes', () => {
    // `a` is lcn2/fnv's 32-bit test vector; the other literals use RFC 9923 over UTF-8 bytes.
    const vectors = [
      { input: 'a', expected: 0xe40c292c },
      { input: 'é', expected: 0x1e9de8c1 },
      { input: '  hi  ', expected: 0x179432f2 },
    ] as const

    for (const vector of vectors) {
      expect(parseWorldSeed(vector.input)).toEqual(
        Result.succeed({ kind: 'fixed', value: asWorldSeedValue(vector.expected) }),
      )
    }
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

  it('property: arbitrary seed inputs return a typed result and reject non-strings', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const actual = parseWorldSeed(input)
        expect(Result.isSuccess(actual) || Result.isFailure(actual)).toBe(true)
        if (typeof input !== 'string') {
          expect(actual).toEqual(Result.fail({ _tag: 'InvalidWorldSeedInput', reason: 'not-string' }))
        }
      }),
    )
  })
})

describe('operable main menu', () => {
  it('returns through the world panels and restores focus to each destination', () => {
    const mounted = mount()
    const focusedMarker = (): string | undefined =>
      mounted.factory.mutations
        .filter(({ kind }) => kind === 'focus')
        .at(-1)
        ?.target.attributes.get('data-mx-ui')

    mounted.view.render(model())
    mounted.root.find('data-menu-entry', 'single-player')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toEqual(['load-world'])
    expect(focusedMarker()).toBe('menu-new-world')

    mounted.root.find('data-mx-ui', 'menu-new-world')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toEqual(['new-world'])
    expect(focusedMarker()).toBe('menu-world-name')
    mounted.root.find('data-mx-ui', 'menu-back-worlds')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toEqual(['load-world'])
    expect(focusedMarker()).toBe('menu-new-world')

    mounted.root.find('data-mx-ui', 'menu-back')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toEqual(['root'])
    expect(focusedMarker()).toBe('menu-entry')
    expect(
      mounted.factory.mutations
        .filter(({ kind }) => kind === 'focus')
        .at(-1)
        ?.target.attributes.get('data-menu-entry'),
    ).toBe('single-player')
    expect(mounted.states.map(({ panel }) => panel)).toEqual([
      'load-world',
      'new-world',
      'load-world',
      'root',
    ])
  })

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
    expect(rows[0]?.attributes.get('aria-label')).toBe('Load Cliff House')
    rows[1]?.dispatch('click')
    expect(mounted.loads).toEqual([SAVED_WORLDS[1]])
    mounted.root.find('data-mx-ui', 'menu-world-export')?.dispatch('click')
    expect(mounted.exports).toEqual([SAVED_WORLDS[0]])

    mounted.root.find('data-mx-ui', 'menu-world-delete')?.dispatch('click')
    expect(mounted.deletes).toEqual([])
    expect(mounted.root.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden')).toBe(false)
    mounted.root.find('data-mx-ui', 'menu-world-delete-confirm')?.dispatch('click')
    expect(mounted.deletes).toEqual([SAVED_WORLDS[0]])
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden'),
    ).toBe(false)
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('disabled'),
    ).toBe(true)
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-cancel')?.attributes.has('hidden'),
    ).toBe(true)
    expect(mounted.root.find('data-mx-ui', 'menu-world-row-container')?.attributes.has('hidden')).toBe(false)
  })

  it('omits the saved-world id from visible and accessible load-button copy', () => {
    const mounted = mount()
    const world: SavedWorld = { sessionId: asWorldId('world_one'), name: asWorldNameText('Cliff House') }
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [world]))

    const loadButton = mounted.root.find('data-session-id', 'world_one')?.find('data-mx-ui', 'menu-world-row')
    if (loadButton === undefined) {
      throw new Error('Expected a saved-world load button')
    }

    expect(loadButton.textContent).toBe('Load Cliff House')
    expect(loadButton.attributes.get('aria-label')).toBe('Load Cliff House')
    expect(loadButton.textContent).not.toContain('world_one')
    expect(loadButton.attributes.get('aria-label')).not.toContain('world_one')
    expect(loadButton.attributes.get('data-session-id')).toBe('world_one')
    loadButton.dispatch('click')
    expect(mounted.loads).toEqual([world])
  })

  it('uses a localized fallback for saved worlds without a name', () => {
    const mounted = mount()
    const world: SavedWorld = { sessionId: asWorldId('unnamed-world'), name: asWorldNameText('') }
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [world]))

    const loadButton = mounted.root.find('data-session-id', 'unnamed-world')?.find('data-mx-ui', 'menu-world-row')
    if (loadButton === undefined) {
      throw new Error('Expected a saved-world load button')
    }

    expect(loadButton.textContent).toBe('Load Unnamed world')
    expect(loadButton.attributes.get('aria-label')).toBe('Load Unnamed world')
    expect(loadButton.attributes.get('data-session-id')).toBe('unnamed-world')
    loadButton.dispatch('click')
    expect(mounted.loads).toEqual([world])
  })

  it('returns a typed failure when a saved-world name is null', () => {
    const mounted = mount()
    const invalidWorld = {
      sessionId: asWorldId('null-name-world'),
      name: null,
    } as unknown as SavedWorld

    expect(
      mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [invalidWorld])),
    ).toEqual(Result.fail({ _tag: 'InvalidMainMenuViewInput', field: 'savedWorlds.name' }))
    expect(mounted.root.findAll('data-mx-ui', 'menu-world-row')).toHaveLength(0)
  })

  it('returns a typed initialization failure for an explicit null external root callback', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('div'))
    const callbacks: MainMenuCallbacks = {}
    Reflect.set(callbacks, 'onOpenSettings', null)
    const view = createMainMenuView(factory, parent, callbacks)
    const failure = Result.fail({
      _tag: 'InvalidMainMenuViewInput',
      field: 'callbacks.onOpenSettings',
    })

    expect(view.initializationResult).toStrictEqual(failure)
    expect(view.render(model())).toStrictEqual(failure)
  })

  it('cancels a pending saved-world deletion without sending a host intent', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))

    mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete')?.dispatch('click')
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden'),
    ).toBe(false)
    mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-cancel')?.dispatch('click')

    expect(mounted.deletes).toEqual([])
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden'),
    ).toBe(true)
  })

  it('ignores stale confirmation and cancellation events for another saved world', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))
    const firstRow = mounted.root.find('data-session-id', 'session-1')
    const secondRow = mounted.root.find('data-session-id', 'session-2')
    const firstConfirm = firstRow?.find('data-mx-ui', 'menu-world-delete-confirm')
    const secondConfirm = secondRow?.find('data-mx-ui', 'menu-world-delete-confirm')
    const secondCancel = secondRow?.find('data-mx-ui', 'menu-world-delete-cancel')
    if (
      firstRow === undefined ||
      secondRow === undefined ||
      firstConfirm === undefined ||
      secondConfirm === undefined ||
      secondCancel === undefined
    ) {
      throw new Error('Expected saved-world delete controls')
    }

    expect(secondConfirm.attributes.has('hidden')).toBe(true)
    secondConfirm.dispatch('click')
    expect(mounted.deletes).toEqual([])

    firstRow.find('data-mx-ui', 'menu-world-delete')?.dispatch('click')
    expect(firstConfirm.attributes.has('hidden')).toBe(false)
    expect(secondCancel.attributes.has('hidden')).toBe(true)
    secondCancel.dispatch('click')
    firstConfirm.dispatch('click')

    expect(mounted.deletes).toEqual([SAVED_WORLDS[0]])
  })

  it('preserves a deletion confirmation across refresh and clears it when the host removes that save', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))
    mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete')?.dispatch('click')

    const refreshedWorlds = SAVED_WORLDS.map((world) =>
      world.sessionId === asWorldId('session-1')
        ? { ...world, name: asWorldNameText('Cliff House Updated') }
        : world,
    )
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), refreshedWorlds))
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden'),
    ).toBe(false)
    expect(mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-row')?.textContent).toContain(
      'Cliff House Updated',
    )

    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world')))
    expect(mounted.root.find('data-session-id', 'session-1')?.attributes.has('hidden')).toBe(true)
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))
    expect(mounted.root.find('data-session-id', 'session-1')?.attributes.has('hidden')).toBe(false)
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete')?.attributes.has('hidden'),
    ).toBe(false)
    expect(
      mounted.root.find('data-session-id', 'session-1')?.find('data-mx-ui', 'menu-world-delete-confirm')?.attributes.has('hidden'),
    ).toBe(true)
    expect(mounted.deletes).toEqual([])
  })

  it('retains all listed save failure fields through the confirmed deletion callback', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [], WORLD_TYPES, [UNREADABLE_SAVE]))
    expect(Object.keys(UNREADABLE_SAVE).sort()).toEqual(['_tag', 'format', 'key', 'reason', 'record', 'repair', 'version'])
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-summary')?.textContent).toBe('1 unreadable save(s)')
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-detail')?.textContent).toContain('invalid header')
    mounted.root.find('data-mx-ui', 'menu-unreadable-delete')?.dispatch('click')
    expect(mounted.unreadableDeletes).toEqual([])
    mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.dispatch('click')
    expect(mounted.unreadableDeletes).toEqual([UNREADABLE_SAVE])
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.attributes.has('hidden')).toBe(false)
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.attributes.has('disabled')).toBe(true)
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-delete-cancel')?.attributes.has('hidden')).toBe(true)
  })

  it('cancels an unreadable-save deletion without sending a host intent', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [], WORLD_TYPES, [UNREADABLE_SAVE]))
    mounted.root.find('data-mx-ui', 'menu-unreadable-delete')?.dispatch('click')
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.attributes.has('hidden')).toBe(false)

    mounted.root.find('data-mx-ui', 'menu-unreadable-delete-cancel')?.dispatch('click')

    expect(mounted.unreadableDeletes).toEqual([])
    expect(mounted.root.find('data-mx-ui', 'menu-unreadable-delete-confirm')?.attributes.has('hidden')).toBe(true)
  })

  it('ignores stale unreadable-save confirmation and cancellation events for another save', () => {
    const mounted = mount()
    const otherSave = { ...UNREADABLE_SAVE, key: asWorldId('save:other') }
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), [], WORLD_TYPES, [UNREADABLE_SAVE, otherSave]))
    const firstRow = mounted.root.find('data-save-key', UNREADABLE_SAVE.key)
    const secondRow = mounted.root.find('data-save-key', otherSave.key)
    const firstConfirm = firstRow?.find('data-mx-ui', 'menu-unreadable-delete-confirm')
    const secondConfirm = secondRow?.find('data-mx-ui', 'menu-unreadable-delete-confirm')
    const secondCancel = secondRow?.find('data-mx-ui', 'menu-unreadable-delete-cancel')
    if (
      firstRow === undefined ||
      secondRow === undefined ||
      firstConfirm === undefined ||
      secondConfirm === undefined ||
      secondCancel === undefined
    ) {
      throw new Error('Expected unreadable-save delete controls')
    }

    expect(secondConfirm.attributes.has('hidden')).toBe(true)
    secondConfirm.dispatch('click')
    expect(mounted.unreadableDeletes).toEqual([])

    firstRow.find('data-mx-ui', 'menu-unreadable-delete')?.dispatch('click')
    expect(firstConfirm.attributes.has('hidden')).toBe(false)
    expect(secondCancel.attributes.has('hidden')).toBe(true)
    secondCancel.dispatch('click')
    firstConfirm.dispatch('click')

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
      seed: { kind: 'fixed', value: asWorldSeedValue(41) },
      mode: 'creative',
      difficulty: 'hard',
      worldType: asWorldTypeId('caves'),
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

  it('does not create from a view model whose selected world type is unavailable', () => {
    const mounted = mount()
    const inconsistentModel = {
      ...model(openPanel(initialMainMenuState, 'new-world'), [], WORLD_TYPES),
      worldType: asWorldTypeId('unavailable'),
    }
    mounted.view.render(inconsistentModel)

    expect(mounted.root.find('data-mx-ui', 'menu-world-type')?.attributes.has('hidden')).toBe(true)
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')
    expect(mounted.creates).toEqual([])
  })

  it('rejects unsafe integer seeds and creates without a selector when the host has no world types', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'new-world'), [], []))
    expect(mounted.root.find('data-menu-field', 'world-type')?.attributes.has('hidden')).toBe(true)
    expect(mounted.root.find('data-mx-ui', 'menu-world-type')?.attributes.has('hidden')).toBe(true)
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

  it('does not cycle a sparse host world-type list', () => {
    const mounted = mount()
    const sparseWorldTypes = new Array<WorldTypeOption>(1)
    const completeModel = model(openPanel(initialMainMenuState, 'new-world'), [], WORLD_TYPES)
    mounted.view.render({ ...completeModel, worldTypes: sparseWorldTypes })

    const worldTypeButton = mounted.root.find('data-mx-ui', 'menu-world-type')
    expect(worldTypeButton?.attributes.has('hidden')).toBe(true)
    worldTypeButton?.dispatch('click')
    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')

    expect(mounted.states).toEqual([])
    expect(mounted.creates).toEqual([])
  })

  it('ignores a stale world-type click after host options become empty', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'new-world'), [], WORLD_TYPES))
    const worldTypeButton = mounted.root.find('data-mx-ui', 'menu-world-type')
    expect(worldTypeButton?.attributes.has('hidden')).toBe(false)

    mounted.view.render(model(openPanel(initialMainMenuState, 'new-world'), [], []))
    expect(worldTypeButton?.attributes.has('hidden')).toBe(true)
    worldTypeButton?.dispatch('click')

    expect(mounted.states).toEqual([])
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

    root.find('data-mx-ui', 'menu-new-world')?.dispatch('click')
    expect(visiblePanels(root)).toEqual(['new-world'])
    expect(root.find('data-mx-ui', 'menu-create-world')?.attributes.has('disabled')).toBe(true)
    expect(root.find('data-mx-ui', 'menu-seed-error')?.attributes.has('hidden')).toBe(true)
    expect(parent.children).toContain(root)
  })

  it('disables optional host actions when their callbacks are absent', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('div'))
    const view = createMainMenuView(factory, parent)
    view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS, WORLD_TYPES, [UNREADABLE_SAVE]))
    const root = fakeElement(view.root)

    for (const marker of [
      'menu-world-row',
      'menu-world-delete',
      'menu-world-export',
      'menu-world-delete-confirm',
      'menu-unreadable-delete',
      'menu-unreadable-delete-confirm',
      'menu-create-world',
    ]) {
      expect(root.find('data-mx-ui', marker)?.attributes.has('disabled')).toBe(true)
    }
  })

  it('hides the empty-save note when saved worlds are present', () => {
    const mounted = mount()
    mounted.view.render(model(openPanel(initialMainMenuState, 'load-world'), SAVED_WORLDS))

    expect(mounted.root.findAll('data-mx-ui', 'menu-world-row-container')).toHaveLength(SAVED_WORLDS.length)
    expect(mounted.root.find('data-mx-ui', 'menu-note')?.attributes.has('hidden')).toBe(true)
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
