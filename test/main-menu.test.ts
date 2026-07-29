import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_NAME,
  backToRoot,
  cycleWorldMode,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  worldNameLabel,
  type MainMenuState,
  type SavedWorld,
} from '../domain/main-menu'
import {
  EMPTY_SAVE_LIST_NOTE,
  GAME_MODE_LABEL,
  MAIN_MENU_TITLE,
  ROOT_ENTRY_LABEL,
  createMainMenuView,
  type MainMenuCallbacks,
} from '../application/main-menu-view'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'

const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [
  { sessionId: 'session-1', name: 'Cliff House' },
  { sessionId: 'session-2', name: 'Red Desert' },
]

const mount = (overrides: Partial<MainMenuCallbacks> = {}) => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement
  const states: Array<MainMenuState> = []
  const creates: Array<{ readonly name: string; readonly mode: 'survival' | 'creative' }> = []
  const loads: Array<SavedWorld> = []
  let settings = 0
  const callbacks: MainMenuCallbacks = {
    onStateChange: (state) => states.push(state),
    onCreateWorld: (request) => creates.push(request),
    onLoadWorld: (world) => loads.push(world),
    onOpenSettings: () => {
      settings += 1
    },
    ...overrides,
  }
  const view = createMainMenuView(factory, parent, callbacks)
  return {
    factory,
    parent,
    view,
    root: view.root as FakeElement,
    states,
    creates,
    loads,
    settings: () => settings,
  }
}

const visiblePanels = (root: FakeElement): ReadonlyArray<string | undefined> =>
  root
    .findAll('data-mx-ui', 'menu-panel')
    .filter((panel) => !panel.attributes.has('hidden'))
    .map((panel) => panel.attributes.get('data-menu-panel'))

describe('main menu domain', () => {
  it('preserves the draft across navigation and normalizes the confirmed name', () => {
    const named = nameWorld(openPanel(initialMainMenuState, 'new-world'), '  Ravine  ')
    const creative = cycleWorldMode(named)

    expect(backToRoot(creative)).toStrictEqual({
      panel: 'root',
      draft: { name: '  Ravine  ', mode: 'creative' },
    })
    expect(worldNameLabel(creative.draft)).toBe('Ravine')
    expect(worldNameLabel({ name: '   ', mode: 'survival' })).toBe(DEFAULT_WORLD_NAME)
    expect(mainMenuViewModel(creative, SAVED_WORLDS)).toStrictEqual({
      panel: 'new-world',
      worldNameInput: '  Ravine  ',
      worldName: 'Ravine',
      mode: 'creative',
      savedWorlds: SAVED_WORLDS,
    })
  })
})

describe('operable main menu', () => {
  it('mounts three native root buttons in order and delegates settings', () => {
    const mounted = mount()
    mounted.view.render(mainMenuViewModel(initialMainMenuState))

    const entries = mounted.root.findAll('data-mx-ui', 'menu-entry')
    expect(mounted.parent.children).toContain(mounted.root)
    expect(mounted.root.find('data-mx-ui', 'menu-title')?.textContent).toBe(MAIN_MENU_TITLE)
    expect(entries.map((entry) => entry.tagName)).toStrictEqual(['button', 'button', 'button'])
    expect(entries.map((entry) => entry.attributes.get('data-menu-entry'))).toStrictEqual([
      'new-world',
      'load-world',
      'settings',
    ])
    expect(entries.map((entry) => entry.attributes.get('aria-label'))).toStrictEqual([
      ROOT_ENTRY_LABEL['new-world'],
      ROOT_ENTRY_LABEL['load-world'],
      ROOT_ENTRY_LABEL.settings,
    ])

    mounted.root.find('data-menu-entry', 'settings')?.dispatch('click')
    expect(mounted.settings()).toBe(1)
    expect(visiblePanels(mounted.root)).toStrictEqual(['root'])
  })

  it('creates a world from the editable name and cycled mode, then cancels with focus restored', () => {
    const mounted = mount()
    mounted.view.render(mainMenuViewModel(initialMainMenuState))

    const beforeOpen = mounted.factory.mark()
    mounted.root.find('data-menu-entry', 'new-world')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toStrictEqual(['new-world'])
    expect(writeNames(mounted.factory.since(beforeOpen))).toContain('focus:focus')

    const input = mounted.root.find('data-mx-ui', 'menu-world-name')
    expect(input?.tagName).toBe('input')
    expect(input?.attributes.get('aria-label')).toBe('World name')
    if (input === undefined) throw new Error('world name input was not mounted')
    input.value = '  Ravine  '
    input.dispatch('input')

    const mode = mounted.root.find('data-mx-ui', 'menu-game-mode')
    mode?.dispatch('click')
    expect(mode?.textContent).toBe(GAME_MODE_LABEL.creative)
    expect(mode?.attributes.get('aria-label')).toBe('Game mode: Creative')

    mounted.root.find('data-menu-action', 'confirm')?.dispatch('click')
    expect(mounted.creates).toStrictEqual([{ name: 'Ravine', mode: 'creative' }])

    const beforeCancel = mounted.factory.mark()
    mounted.root.find('data-menu-action', 'cancel')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toStrictEqual(['root'])
    expect(mounted.states.at(-1)).toStrictEqual({
      panel: 'root',
      draft: { name: '  Ravine  ', mode: 'creative' },
    })
    expect(writeNames(mounted.factory.since(beforeCancel))).toContain('focus:focus')
  })

  it('loads the selected host save and returns from the load panel', () => {
    const mounted = mount()
    mounted.view.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS))

    mounted.root.find('data-menu-entry', 'load-world')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toStrictEqual(['load-world'])
    expect(mounted.root.find('data-mx-ui', 'menu-note')?.attributes.has('hidden')).toBe(true)

    const rows = mounted.root.findAll('data-mx-ui', 'menu-world-row')
    expect(rows.map((row) => row.attributes.get('aria-label'))).toStrictEqual([
      'Load Cliff House (session-1)',
      'Load Red Desert (session-2)',
    ])
    mounted.root.find('data-session-id', 'session-2')?.dispatch('click')
    expect(mounted.loads).toStrictEqual([SAVED_WORLDS[1]])

    mounted.root.find('data-menu-action', 'back')?.dispatch('click')
    expect(visiblePanels(mounted.root)).toStrictEqual(['root'])
  })

  it('renders a known empty save state and relies only on native control events', () => {
    const mounted = mount()
    mounted.view.render(mainMenuViewModel(openPanel(initialMainMenuState, 'load-world')))

    const note = mounted.root.find('data-mx-ui', 'menu-note')
    expect(note?.textContent).toBe(EMPTY_SAVE_LIST_NOTE)
    expect(note?.attributes.has('hidden')).toBe(false)
    expect(mounted.root.listenersInTree().every((listener) => listener === 'click' || listener === 'input')).toBe(
      true,
    )
    expect(mounted.root.listenersInTree()).not.toContain('keydown')
  })

  it('does not mutate an unchanged render', () => {
    const mounted = mount()
    const model = mainMenuViewModel(initialMainMenuState, SAVED_WORLDS)
    mounted.view.render(model)
    const before = mounted.factory.mark()

    mounted.view.render(model)

    expect(writeNames(mounted.factory.since(before))).toStrictEqual([])
  })
})
