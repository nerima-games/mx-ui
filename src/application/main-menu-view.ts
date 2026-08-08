import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write'
import {
  type CreateWorldRequest,
  type GameMode,
  type MainMenuState,
  type MainMenuViewModel,
  type MenuPanel,
  ROOT_ENTRIES,
  type RootEntry,
  type SavedWorld,
  backToRoot,
  cycleWorldMode,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  worldNameLabel,
} from '../domain/main-menu'
import type {
  DomElement,
  DomElementFactory,
  DomInputElement,
  DomInteractiveElement,
} from './dom-surface'
import { PALETTE_VAR, declarePalette } from './palette-css'

export const MAIN_MENU_TITLE = 'nerima-games'

export const ROOT_ENTRY_LABEL: Readonly<Record<RootEntry, string>> = {
  'load-world': 'Select World',
  'new-world': 'Create New World',
  settings: 'Options...',
}

export const GAME_MODE_LABEL: Readonly<Record<GameMode, string>> = {
  creative: 'Creative',
  survival: 'Survival',
}

export const MENU_PANEL_LABEL: Readonly<Record<MenuPanel, string>> = {
  'load-world': 'Select world',
  'new-world': 'Create new world',
  root: 'Main menu',
}

export const MENU_FIELD_LABEL = {
  'game-mode': 'Game mode',
  'world-name': 'World name',
} as const

export type MenuField = keyof typeof MENU_FIELD_LABEL

export const MENU_ACTION_LABEL = {
  back: 'Back',
  cancel: 'Cancel',
  confirm: 'Confirm',
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

const noop = (): void => {
  // No-op.
}

const NOOP_CALLBACKS: MainMenuCallbacks = {
  onCreateWorld: noop,
  onLoadWorld: noop,
  onOpenSettings: noop,
  onStateChange: noop,
}

/** Nothing — the zero count, the zero index, the drain-from-the-start splice. */
const ZERO = 0

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

/** Everything an element-building helper needs to mount into the document and clean up after itself. */
type MountContext = {
  readonly factory: DomElementFactory
  readonly cleanups: Array<() => void>
}

/** The menu's one piece of mutable state, shared by reference with every closure that reads or writes it. */
type MenuStateBox = {
  state: MainMenuState
  savedWorlds: ReadonlyArray<SavedWorld>
}

type MenuTransition = (next: MainMenuState, focusTarget: DomInteractiveElement) => void

/** Behavioural wiring shared by every interactive element this file builds. */
type MenuBindings = {
  readonly box: MenuStateBox
  readonly callbacks: MainMenuCallbacks
  readonly rootButtons: Map<RootEntry, DomInteractiveElement>
  readonly transition: MenuTransition
}

const setAttributes = (element: DomElement, attrs: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, value)
  }
}

type ListenerSpec = {
  readonly type: string
  readonly handler: () => void
}

const addManagedListener = (
  ctx: MountContext,
  target: DomInteractiveElement,
  spec: ListenerSpec,
): void => {
  target.addEventListener(spec.type, spec.handler)
  ctx.cleanups.push(() => target.removeEventListener?.(spec.type, spec.handler))
}

const createPanel = (
  factory: DomElementFactory,
  parent: DomElement,
  panel: MenuPanel,
): PanelElement => {
  const root = factory.createElement('section')
  setAttributes(root, {
    'aria-label': MENU_PANEL_LABEL[panel],
    'data-menu-panel': panel,
    'data-mx-ui': 'menu-panel',
    hidden: '',
    role: 'group',
  })
  parent.appendChild(root)

  const element: PanelElement = { hidden: attributeCell(root, 'hidden'), panel, root }
  element.hidden.previous = ''
  return element
}

type ButtonSpec = {
  readonly role: string
  readonly label: string
  readonly onClick: () => void
}

const createButton = (
  ctx: MountContext,
  parent: DomElement,
  spec: ButtonSpec,
): DomInteractiveElement => {
  const button = ctx.factory.createElement('button')
  setAttributes(button, { 'aria-label': spec.label, 'data-mx-ui': spec.role, type: 'button' })
  button.style.setProperty('color', PALETTE_VAR.ink)
  button.textContent = spec.label
  addManagedListener(ctx, button, { handler: spec.onClick, type: 'click' })
  parent.appendChild(button)
  return button
}

const modelState = (model: MainMenuViewModel): MainMenuState => ({
  draft: { mode: model.mode, name: model.worldNameInput },
  panel: model.panel,
})

const modeAriaLabel = (mode: GameMode): string =>
  `${MENU_FIELD_LABEL['game-mode']}: ${GAME_MODE_LABEL[mode]}`

const savedWorldListState = (count: number): string => {
  if (count === ZERO) {
    return 'empty'
  }
  return 'ready'
}

const createMainMenuRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'main-menu')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createMainMenuTitle = (factory: DomElementFactory, root: DomElement): void => {
  const title = factory.createElement('h1')
  title.setAttribute('data-mx-ui', 'menu-title')
  title.style.setProperty('color', PALETTE_VAR.ink)
  title.textContent = MAIN_MENU_TITLE
  root.appendChild(title)
}

const createMenuPanels = (
  factory: DomElementFactory,
  root: DomElement,
): Record<MenuPanel, PanelElement> => ({
  'load-world': createPanel(factory, root, 'load-world'),
  'new-world': createPanel(factory, root, 'new-world'),
  root: createPanel(factory, root, 'root'),
})

type MainMenuShell = {
  readonly root: DomElement
  readonly panels: Record<MenuPanel, PanelElement>
}

const createMainMenuShell = (factory: DomElementFactory, parent: DomElement): MainMenuShell => {
  const root = createMainMenuRoot(factory, parent)
  createMainMenuTitle(factory, root)
  const panels = createMenuPanels(factory, root)
  return { panels, root }
}

const createFieldCaption = (ctx: MountContext, parent: DomElement, text: string): void => {
  const caption = ctx.factory.createElement('span')
  caption.setAttribute('data-mx-ui', 'menu-field-caption')
  caption.style.setProperty('color', PALETTE_VAR.inkMuted)
  caption.textContent = text
  parent.appendChild(caption)
}

const createWorldNameField = (
  ctx: MountContext,
  parent: DomElement,
  bindings: MenuBindings,
): DomInputElement => {
  createFieldCaption(ctx, parent, MENU_FIELD_LABEL['world-name'])

  const input: DomInputElement = ctx.factory.createElement('input')
  setAttributes(input, {
    'aria-label': MENU_FIELD_LABEL['world-name'],
    'data-mx-ui': 'menu-world-name',
    placeholder: 'New World',
    type: 'text',
  })
  addManagedListener(ctx, input, {
    handler: () => {
      bindings.box.state = nameWorld(bindings.box.state, input.value)
      bindings.callbacks.onStateChange(bindings.box.state)
    },
    type: 'input',
  })
  parent.appendChild(input)
  return input
}

type ModeButtonElements = {
  readonly text: TextCell
  readonly accessibleName: AttributeCell
}

const createModeButton = (
  ctx: MountContext,
  parent: DomElement,
  bindings: MenuBindings,
): ModeButtonElements => {
  const modeButton = createButton(ctx, parent, {
    label: GAME_MODE_LABEL.survival,
    onClick: () => {
      bindings.transition(cycleWorldMode(bindings.box.state), modeButton)
    },
    role: 'menu-game-mode',
  })
  modeButton.setAttribute('aria-label', modeAriaLabel('survival'))
  const modeText = textCell(modeButton)
  modeText.previous = GAME_MODE_LABEL.survival
  const modeAccessibleName = attributeCell(modeButton, 'aria-label')
  modeAccessibleName.previous = modeAriaLabel('survival')
  return { accessibleName: modeAccessibleName, text: modeText }
}

const createCancelButton = (ctx: MountContext, parent: DomElement, bindings: MenuBindings): void => {
  const cancelButton = createButton(ctx, parent, {
    label: MENU_ACTION_LABEL.cancel,
    onClick: () => {
      bindings.transition(
        backToRoot(bindings.box.state),
        bindings.rootButtons.get('new-world') ?? cancelButton,
      )
    },
    role: 'menu-action',
  })
  cancelButton.setAttribute('data-menu-action', 'cancel')
}

const createConfirmButton = (
  ctx: MountContext,
  parent: DomElement,
  bindings: MenuBindings,
): void => {
  const confirmButton = createButton(ctx, parent, {
    label: MENU_ACTION_LABEL.confirm,
    onClick: () => {
      bindings.callbacks.onCreateWorld({
        mode: bindings.box.state.draft.mode,
        name: worldNameLabel(bindings.box.state.draft),
      })
    },
    role: 'menu-action',
  })
  confirmButton.setAttribute('data-menu-action', 'confirm')
}

type NewWorldSection = {
  readonly worldNameInput: DomInputElement
  readonly modeElements: ModeButtonElements
}

const createNewWorldSection = (
  ctx: MountContext,
  parent: DomElement,
  bindings: MenuBindings,
): NewWorldSection => {
  const worldNameInput = createWorldNameField(ctx, parent, bindings)
  const modeElements = createModeButton(ctx, parent, bindings)
  createCancelButton(ctx, parent, bindings)
  createConfirmButton(ctx, parent, bindings)
  return { modeElements, worldNameInput }
}

const createSavedWorldList = (
  ctx: MountContext,
  parent: DomElement,
): { element: DomElement; listState: AttributeCell } => {
  const savedWorldList = ctx.factory.createElement('div')
  savedWorldList.setAttribute('data-mx-ui', 'menu-saved-worlds')
  parent.appendChild(savedWorldList)
  return { element: savedWorldList, listState: attributeCell(savedWorldList, 'data-region-state') }
}

const createEmptyNote = (ctx: MountContext, parent: DomElement): AttributeCell => {
  const emptyNote = ctx.factory.createElement('p')
  emptyNote.setAttribute('data-mx-ui', 'menu-note')
  emptyNote.style.setProperty('color', PALETTE_VAR.inkFaint)
  emptyNote.textContent = EMPTY_SAVE_LIST_NOTE
  parent.appendChild(emptyNote)
  return attributeCell(emptyNote, 'hidden')
}

type LoadWorldSection = {
  readonly listState: AttributeCell
  readonly emptyNoteHidden: AttributeCell
  readonly rows: Map<string, SavedWorldRow>
  readonly savedWorldList: DomElement
  readonly firstSavedWorldButton: () => DomInteractiveElement
}

const createLoadWorldSection = (
  ctx: MountContext,
  parent: DomElement,
  bindings: MenuBindings,
): LoadWorldSection => {
  const list = createSavedWorldList(ctx, parent)
  const emptyNoteHidden = createEmptyNote(ctx, list.element)
  const rows = new Map<string, SavedWorldRow>()

  const backButton = createButton(ctx, parent, {
    label: MENU_ACTION_LABEL.back,
    onClick: () => {
      bindings.transition(
        backToRoot(bindings.box.state),
        bindings.rootButtons.get('load-world') ?? backButton,
      )
    },
    role: 'menu-action',
  })
  backButton.setAttribute('data-menu-action', 'back')

  const firstSavedWorldButton = (): DomInteractiveElement => {
    const [first] = bindings.box.savedWorlds
    if (typeof first === 'undefined') {
      return backButton
    }
    return rows.get(first.sessionId)?.root ?? backButton
  }

  return {
    emptyNoteHidden,
    firstSavedWorldButton,
    listState: list.listState,
    rows,
    savedWorldList: list.element,
  }
}

type SavedWorldListDeps = {
  readonly ctx: MountContext
  readonly parent: DomElement
  readonly rows: Map<string, SavedWorldRow>
  readonly callbacks: MainMenuCallbacks
}

type SavedWorldRowLabels = {
  readonly name: DomElement
  readonly sessionId: DomElement
}

const createSavedWorldRowLabels = (ctx: MountContext, button: DomElement): SavedWorldRowLabels => {
  const name = ctx.factory.createElement('span')
  name.setAttribute('data-mx-ui', 'menu-world-name')
  button.appendChild(name)
  const sessionId = ctx.factory.createElement('span')
  sessionId.setAttribute('data-mx-ui', 'menu-world-session-id')
  button.appendChild(sessionId)
  return { name, sessionId }
}

const createSavedWorldRow = (deps: SavedWorldListDeps, world: SavedWorld): SavedWorldRow => {
  const button = createButton(deps.ctx, deps.parent, {
    label: '',
    onClick: () => {
      const current = deps.rows.get(world.sessionId)
      if (typeof current !== 'undefined') {
        deps.callbacks.onLoadWorld(current.current)
      }
    },
    role: 'menu-world-row',
  })
  button.setAttribute('data-session-id', world.sessionId)
  const labels = createSavedWorldRowLabels(deps.ctx, button)

  const row: SavedWorldRow = {
    accessibleName: attributeCell(button, 'aria-label'),
    current: world,
    hidden: attributeCell(button, 'hidden'),
    name: textCell(labels.name),
    root: button,
    sessionId: textCell(labels.sessionId),
  }
  deps.rows.set(world.sessionId, row)
  return row
}

const ensureSavedWorldRow = (deps: SavedWorldListDeps, world: SavedWorld): SavedWorldRow => {
  const existing = deps.rows.get(world.sessionId)
  if (typeof existing !== 'undefined') {
    existing.current = world
    return existing
  }
  return createSavedWorldRow(deps, world)
}

const resolveNewWorldEntryTarget = (
  entry: RootEntry,
  worldNameInput: DomInputElement,
  firstSavedWorldButton: () => DomInteractiveElement,
): DomInteractiveElement => {
  if (entry === 'new-world') {
    return worldNameInput
  }
  return firstSavedWorldButton()
}

type RootEntryContext = {
  readonly ctx: MountContext
  readonly bindings: MenuBindings
  readonly worldNameInput: DomInputElement
  readonly firstSavedWorldButton: () => DomInteractiveElement
}

const createRootEntryButton = (
  parent: DomElement,
  entry: RootEntry,
  context: RootEntryContext,
): void => {
  const button = createButton(context.ctx, parent, {
    label: ROOT_ENTRY_LABEL[entry],
    onClick: () => {
      if (entry === 'settings') {
        context.bindings.callbacks.onOpenSettings()
        return
      }
      const target = resolveNewWorldEntryTarget(
        entry,
        context.worldNameInput,
        context.firstSavedWorldButton,
      )
      context.bindings.transition(openPanel(context.bindings.box.state, entry), target)
    },
    role: 'menu-entry',
  })
  button.setAttribute('data-menu-entry', entry)
  context.bindings.rootButtons.set(entry, button)
}

const createRootEntryButtons = (parent: DomElement, context: RootEntryContext): void => {
  for (const entry of ROOT_ENTRIES) {
    createRootEntryButton(parent, entry, context)
  }
}

const applyModelState = (box: MenuStateBox, model: MainMenuViewModel): void => {
  box.state = modelState(model)
  box.savedWorlds = model.savedWorlds
}

const applyPanelVisibility = (
  panels: Record<MenuPanel, PanelElement>,
  model: MainMenuViewModel,
): void => {
  for (const panel of Object.values(panels)) {
    writeHidden(panel.hidden, panel.panel !== model.panel)
  }
}

const applyNewWorldSection = (newWorld: NewWorldSection, model: MainMenuViewModel): void => {
  if (newWorld.worldNameInput.value !== model.worldNameInput) {
    newWorld.worldNameInput.value = model.worldNameInput
  }
  writeText(newWorld.modeElements.text, GAME_MODE_LABEL[model.mode])
  writeAttribute(newWorld.modeElements.accessibleName, modeAriaLabel(model.mode))
}

const syncSavedWorldRows = (
  listDeps: SavedWorldListDeps,
  savedWorlds: ReadonlyArray<SavedWorld>,
): void => {
  const visibleSessionIds = new Set(savedWorlds.map((world) => world.sessionId))
  for (const world of savedWorlds) {
    const row = ensureSavedWorldRow(listDeps, world)
    writeHidden(row.hidden, false)
    writeText(row.name, world.name)
    writeText(row.sessionId, world.sessionId)
    writeAttribute(row.accessibleName, `Load ${world.name} (${world.sessionId})`)
  }
  for (const [sessionId, row] of listDeps.rows) {
    if (!visibleSessionIds.has(sessionId)) {
      writeHidden(row.hidden, true)
    }
  }
}

type RenderContext = {
  readonly box: MenuStateBox
  readonly listDeps: SavedWorldListDeps
  readonly loadWorld: LoadWorldSection
  readonly newWorld: NewWorldSection
  readonly panelFlag: AttributeCell
  readonly panels: Record<MenuPanel, PanelElement>
}

const createRenderModel =
  (context: RenderContext) =>
  (model: MainMenuViewModel): void => {
    applyModelState(context.box, model)
    writeAttribute(context.panelFlag, model.panel)
    applyPanelVisibility(context.panels, model)
    applyNewWorldSection(context.newWorld, model)
    writeAttribute(context.loadWorld.listState, savedWorldListState(model.savedWorlds.length))
    writeHidden(context.loadWorld.emptyNoteHidden, model.savedWorlds.length !== ZERO)
    syncSavedWorldRows(context.listDeps, model.savedWorlds)
  }

const assembleMainMenu = (
  ctx: MountContext,
  shell: MainMenuShell,
  callbacks: MainMenuCallbacks,
): ((model: MainMenuViewModel) => void) => {
  const box: MenuStateBox = { savedWorlds: [], state: initialMainMenuState }
  const rootButtons = new Map<RootEntry, DomInteractiveElement>()
  let transitionRef: MenuTransition = noop
  const bindings: MenuBindings = {
    box,
    callbacks,
    rootButtons,
    transition: (next, target) => {
      transitionRef(next, target)
    },
  }

  const newWorld = createNewWorldSection(ctx, shell.panels['new-world'].root, bindings)
  const loadWorld = createLoadWorldSection(ctx, shell.panels['load-world'].root, bindings)

  createRootEntryButtons(shell.panels.root.root, {
    bindings,
    ctx,
    firstSavedWorldButton: loadWorld.firstSavedWorldButton,
    worldNameInput: newWorld.worldNameInput,
  })

  const renderModel = createRenderModel({
    box,
    listDeps: { callbacks, ctx, parent: loadWorld.savedWorldList, rows: loadWorld.rows },
    loadWorld,
    newWorld,
    panelFlag: attributeCell(shell.root, 'data-menu-showing'),
    panels: shell.panels,
  })

  transitionRef = (next: MainMenuState, focusTarget: DomInteractiveElement): void => {
    renderModel(mainMenuViewModel(next, box.savedWorlds))
    focusTarget.focus()
    callbacks.onStateChange(next)
  }

  return renderModel
}

/** Build an operable menu without taking ownership of persistence or routing. */
export const createMainMenuView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: MainMenuCallbacks = NOOP_CALLBACKS,
): MainMenuView => {
  const ctx: MountContext = { cleanups: [], factory }
  const shell = createMainMenuShell(factory, parent)
  const renderModel = assembleMainMenu(ctx, shell, callbacks)

  return {
    destroy: (): void => {
      for (const cleanup of ctx.cleanups.splice(ZERO).reverse()) {
        cleanup()
      }
    },
    render: renderModel,
    root: shell.root,
  }
}
