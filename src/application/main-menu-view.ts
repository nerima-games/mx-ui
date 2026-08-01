import {
  ROOT_ENTRIES,
  backToRoot,
  cycleWorldMode,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  worldNameLabel,
  type CreateWorldRequest,
  type GameMode,
  type MainMenuState,
  type MainMenuViewModel,
  type MenuPanel,
  type RootEntry,
  type SavedWorld,
} from '../domain/main-menu'
import type {
  DomElement,
  DomElementFactory,
  DomInputElement,
  DomInteractiveElement,
} from './dom-surface'
import {
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
  type AttributeCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'

export const MAIN_MENU_TITLE = 'nerima-games'

export const ROOT_ENTRY_LABEL: Readonly<Record<RootEntry, string>> = {
  'new-world': 'Create New World',
  'load-world': 'Select World',
  settings: 'Options...',
}

export const GAME_MODE_LABEL: Readonly<Record<GameMode, string>> = {
  survival: 'Survival',
  creative: 'Creative',
}

export const MENU_PANEL_LABEL: Readonly<Record<MenuPanel, string>> = {
  root: 'Main menu',
  'new-world': 'Create new world',
  'load-world': 'Select world',
}

export const MENU_FIELD_LABEL = {
  'world-name': 'World name',
  'game-mode': 'Game mode',
} as const

export type MenuField = keyof typeof MENU_FIELD_LABEL

export const MENU_ACTION_LABEL = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  back: 'Back',
} as const

export type MenuAction = keyof typeof MENU_ACTION_LABEL

export const EMPTY_SAVE_LIST_NOTE = 'No saved worlds'

/** @deprecated The menu now distinguishes a host-supplied empty list directly. */
export const NO_SAVE_LIST_NOTE =
  'mc-save has not been asked. This list is unknown, which is not the same as empty.'

export type MainMenuCallbacks = {
  readonly onStateChange: (state: MainMenuState) => void
  readonly onCreateWorld: (request: CreateWorldRequest) => void
  readonly onLoadWorld: (world: SavedWorld) => void
  readonly onOpenSettings: () => void
}

const NOOP_CALLBACKS: MainMenuCallbacks = {
  onStateChange: () => undefined,
  onCreateWorld: () => undefined,
  onLoadWorld: () => undefined,
  onOpenSettings: () => undefined,
}

type PanelElement = {
  readonly panel: MenuPanel
  readonly root: DomElement
  readonly hidden: AttributeCell
}

type SavedWorldRow = {
  readonly root: DomInteractiveElement
  readonly hidden: AttributeCell
  readonly name: TextCell
  readonly sessionId: TextCell
  readonly accessibleName: AttributeCell
  current: SavedWorld
}

export type MainMenuView = {
  readonly root: DomElement
  readonly render: (model: MainMenuViewModel) => void
  readonly destroy: () => void
}

const createPanel = (
  factory: DomElementFactory,
  parent: DomElement,
  panel: MenuPanel,
): PanelElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'menu-panel')
  root.setAttribute('data-menu-panel', panel)
  root.setAttribute('hidden', '')
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', MENU_PANEL_LABEL[panel])
  parent.appendChild(root)

  const element: PanelElement = { panel, root, hidden: attributeCell(root, 'hidden') }
  element.hidden.previous = ''
  return element
}

const createButton = (
  factory: DomElementFactory,
  parent: DomElement,
  role: string,
  label: string,
  onClick: () => void,
  cleanups: Array<() => void>,
): DomInteractiveElement => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', role)
  button.style.setProperty('color', PALETTE_VAR.ink)
  button.textContent = label
  button.setAttribute('aria-label', label)
  button.addEventListener('click', onClick)
  cleanups.push(() => button.removeEventListener?.('click', onClick))
  parent.appendChild(button)
  return button
}

const modelState = (model: MainMenuViewModel): MainMenuState => ({
  panel: model.panel,
  draft: { name: model.worldNameInput, mode: model.mode },
})

/** Build an operable menu without taking ownership of persistence or routing. */
export const createMainMenuView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: MainMenuCallbacks = NOOP_CALLBACKS,
): MainMenuView => {
  const cleanups: Array<() => void> = []
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'main-menu')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const title = factory.createElement('h1')
  title.setAttribute('data-mx-ui', 'menu-title')
  title.style.setProperty('color', PALETTE_VAR.ink)
  title.textContent = MAIN_MENU_TITLE
  root.appendChild(title)

  const panels: Record<MenuPanel, PanelElement> = {
    root: createPanel(factory, root, 'root'),
    'new-world': createPanel(factory, root, 'new-world'),
    'load-world': createPanel(factory, root, 'load-world'),
  }

  let state = initialMainMenuState
  let savedWorlds: ReadonlyArray<SavedWorld> = []
  let renderModel: (model: MainMenuViewModel) => void = () => undefined
  let transition: (next: MainMenuState, focusTarget: DomInteractiveElement) => void = () => undefined

  const rootButtons = new Map<RootEntry, DomInteractiveElement>()
  for (const entry of ROOT_ENTRIES) {
    const button = createButton(factory, panels.root.root, 'menu-entry', ROOT_ENTRY_LABEL[entry], () => {
      if (entry === 'settings') {
        callbacks.onOpenSettings()
        return
      }
      const target = entry === 'new-world' ? worldNameInput : firstSavedWorldButton()
      transition(openPanel(state, entry), target)
    }, cleanups)
    button.setAttribute('data-menu-entry', entry)
    rootButtons.set(entry, button)
  }

  const newWorldPanel = panels['new-world'].root
  const worldNameLabelElement = factory.createElement('span')
  worldNameLabelElement.setAttribute('data-mx-ui', 'menu-field-caption')
  worldNameLabelElement.style.setProperty('color', PALETTE_VAR.inkMuted)
  worldNameLabelElement.textContent = MENU_FIELD_LABEL['world-name']
  newWorldPanel.appendChild(worldNameLabelElement)

  const worldNameInput: DomInputElement = factory.createElement('input')
  worldNameInput.setAttribute('type', 'text')
  worldNameInput.setAttribute('data-mx-ui', 'menu-world-name')
  worldNameInput.setAttribute('aria-label', MENU_FIELD_LABEL['world-name'])
  worldNameInput.setAttribute('placeholder', 'New World')
  const onWorldNameInput = () => {
    state = nameWorld(state, worldNameInput.value)
    callbacks.onStateChange(state)
  }
  worldNameInput.addEventListener('input', onWorldNameInput)
  cleanups.push(() => worldNameInput.removeEventListener?.('input', onWorldNameInput))
  newWorldPanel.appendChild(worldNameInput)

  const modeButton = createButton(
    factory,
    newWorldPanel,
    'menu-game-mode',
    GAME_MODE_LABEL.survival,
    () => transition(cycleWorldMode(state), modeButton),
    cleanups,
  )
  modeButton.setAttribute('aria-label', `${MENU_FIELD_LABEL['game-mode']}: ${GAME_MODE_LABEL.survival}`)
  const modeText = textCell(modeButton)
  modeText.previous = GAME_MODE_LABEL.survival
  const modeAccessibleName = attributeCell(modeButton, 'aria-label')
  modeAccessibleName.previous = `${MENU_FIELD_LABEL['game-mode']}: ${GAME_MODE_LABEL.survival}`

  const cancelButton = createButton(factory, newWorldPanel, 'menu-action', MENU_ACTION_LABEL.cancel, () => {
    transition(backToRoot(state), rootButtons.get('new-world') ?? cancelButton)
  }, cleanups)
  cancelButton.setAttribute('data-menu-action', 'cancel')

  const confirmButton = createButton(factory, newWorldPanel, 'menu-action', MENU_ACTION_LABEL.confirm, () => {
    callbacks.onCreateWorld({ name: worldNameLabel(state.draft), mode: state.draft.mode })
  }, cleanups)
  confirmButton.setAttribute('data-menu-action', 'confirm')

  const loadWorldPanel = panels['load-world'].root
  const savedWorldList = factory.createElement('div')
  savedWorldList.setAttribute('data-mx-ui', 'menu-saved-worlds')
  loadWorldPanel.appendChild(savedWorldList)
  const listState = attributeCell(savedWorldList, 'data-region-state')

  const emptyNote = factory.createElement('p')
  emptyNote.setAttribute('data-mx-ui', 'menu-note')
  emptyNote.style.setProperty('color', PALETTE_VAR.inkFaint)
  emptyNote.textContent = EMPTY_SAVE_LIST_NOTE
  savedWorldList.appendChild(emptyNote)
  const emptyNoteHidden = attributeCell(emptyNote, 'hidden')

  const rows = new Map<string, SavedWorldRow>()
  let backButton: DomInteractiveElement
  const firstSavedWorldButton = (): DomInteractiveElement => {
    const first = savedWorlds[0]
    return (first === undefined ? undefined : rows.get(first.sessionId)?.root) ?? backButton
  }

  const ensureSavedWorldRow = (world: SavedWorld): SavedWorldRow => {
    const existing = rows.get(world.sessionId)
    if (existing !== undefined) {
      existing.current = world
      return existing
    }

    const button = createButton(factory, savedWorldList, 'menu-world-row', '', () => {
      callbacks.onLoadWorld(row.current)
    }, cleanups)
    button.setAttribute('data-session-id', world.sessionId)

    const name = factory.createElement('span')
    name.setAttribute('data-mx-ui', 'menu-world-name')
    button.appendChild(name)
    const sessionId = factory.createElement('span')
    sessionId.setAttribute('data-mx-ui', 'menu-world-session-id')
    button.appendChild(sessionId)

    const row: SavedWorldRow = {
      root: button,
      hidden: attributeCell(button, 'hidden'),
      name: textCell(name),
      sessionId: textCell(sessionId),
      accessibleName: attributeCell(button, 'aria-label'),
      current: world,
    }
    rows.set(world.sessionId, row)
    return row
  }

  backButton = createButton(factory, loadWorldPanel, 'menu-action', MENU_ACTION_LABEL.back, () => {
    transition(backToRoot(state), rootButtons.get('load-world') ?? backButton)
  }, cleanups)
  backButton.setAttribute('data-menu-action', 'back')

  const panelFlag = attributeCell(root, 'data-menu-showing')

  renderModel = (model: MainMenuViewModel): void => {
    state = modelState(model)
    savedWorlds = model.savedWorlds
    writeAttribute(panelFlag, model.panel)
    for (const panel of Object.values(panels)) {
      writeHidden(panel.hidden, panel.panel !== model.panel)
    }
    if (worldNameInput.value !== model.worldNameInput) {
      worldNameInput.value = model.worldNameInput
    }
    writeText(modeText, GAME_MODE_LABEL[model.mode])
    writeAttribute(
      modeAccessibleName,
      `${MENU_FIELD_LABEL['game-mode']}: ${GAME_MODE_LABEL[model.mode]}`,
    )
    writeAttribute(listState, model.savedWorlds.length === 0 ? 'empty' : 'ready')
    writeHidden(emptyNoteHidden, model.savedWorlds.length !== 0)

    const visibleSessionIds = new Set(model.savedWorlds.map((world) => world.sessionId))
    for (const world of model.savedWorlds) {
      const row = ensureSavedWorldRow(world)
      writeHidden(row.hidden, false)
      writeText(row.name, world.name)
      writeText(row.sessionId, world.sessionId)
      writeAttribute(row.accessibleName, `Load ${world.name} (${world.sessionId})`)
    }
    for (const [sessionId, row] of rows) {
      if (!visibleSessionIds.has(sessionId)) {
        writeHidden(row.hidden, true)
      }
    }
  }

  transition = (next: MainMenuState, focusTarget: DomInteractiveElement): void => {
    renderModel(mainMenuViewModel(next, savedWorlds))
    focusTarget.focus()
    callbacks.onStateChange(next)
  }

  return {
    root,
    render: renderModel,
    destroy: () => {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    },
  }
}
