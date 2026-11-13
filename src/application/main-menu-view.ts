import {
  type AttributeCell,
  type StyleCell,
  type TextCell,
  attributeCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeStyle,
  writeText,
} from './dom-write.js'
import {
  type CreateWorldRequest,
  type GameDifficulty,
  type GameMode,
  type MainMenuState,
  type MainMenuViewModel,
  type MenuPanel,
  type RootEntry,
  type SavedWorld,
  type UnreadableSave,
  type WorldTypeId,
  cycleWorldMode,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  parseWorldSeed,
  seedWorld,
  setWorldDifficulty,
  setWorldType,
  worldNameLabel,
} from '../domain/main-menu.js'
import { DEFAULT_UI_LANGUAGE, type UiLanguage, type UiMessageKey, type UiMessageValues, translateUiMessage } from '../domain/ui-language.js'
import { type DomElement, type DomElementFactory, type DomInputElement, type DomInteractiveElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { Result, Schema } from 'effect'
import { WorldNameTextSchema, WorldSeedTextSchema, WorldTypeIdSchema } from '../domain/ui3-brand-schemas.js'
import {
  inheritUiLanguage,
  setLocalizedAttribute,
  setLocalizedText,
  uiLanguageForElement,
  writeLocalizedAttribute,
  writeLocalizedText,
  writeLocalizedTextUsing,
} from './ui-localization.js'

export const MAIN_MENU_TITLE: string = translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.brand')

export const ROOT_ENTRY_LABEL: Readonly<Record<RootEntry, string>> = {
  exit: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.root.exit'),
  multiplayer: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.root.multiplayer'),
  settings: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.root.settings'),
  'single-player': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.root.single-player'),
}

export const GAME_MODE_LABEL: Readonly<Record<GameMode, string>> = {
  creative: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.mode.creative'),
  survival: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.mode.survival'),
}

export const GAME_DIFFICULTY_LABEL: Readonly<Record<GameDifficulty, string>> = {
  easy: translateUiMessage(DEFAULT_UI_LANGUAGE, 'settings.choice.difficulty.easy'),
  hard: translateUiMessage(DEFAULT_UI_LANGUAGE, 'settings.choice.difficulty.hard'),
  normal: translateUiMessage(DEFAULT_UI_LANGUAGE, 'settings.choice.difficulty.normal'),
  peaceful: translateUiMessage(DEFAULT_UI_LANGUAGE, 'settings.choice.difficulty.peaceful'),
}

export const MENU_PANEL_LABEL: Readonly<Record<MenuPanel, string>> = {
  'load-world': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.panel.load-world'),
  'new-world': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.panel.new-world'),
  root: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.panel.root'),
}

export type MenuField = 'world-name' | 'game-mode' | 'seed' | 'difficulty' | 'world-type'
export const MENU_FIELD_LABEL: Readonly<Record<MenuField, string>> = {
  difficulty: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.field.difficulty'),
  'game-mode': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.field.game-mode'),
  seed: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.field.seed'),
  'world-name': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.field.world-name'),
  'world-type': translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.field.world-type', { type: '' }),
}

export type MenuAction = 'back' | 'cancel' | 'confirm' | 'create' | 'delete' | 'export'
const MENU_ACTION_KEY: Readonly<Record<MenuAction, UiMessageKey>> = {
  back: 'menu.action.back',
  cancel: 'menu.action.cancel',
  confirm: 'menu.action.confirm',
  create: 'menu.action.create',
  delete: 'menu.action.delete',
  export: 'menu.action.export',
}
export const MENU_ACTION_LABEL: Readonly<Record<MenuAction, string>> = {
  back: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.back'),
  cancel: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.cancel'),
  confirm: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.confirm'),
  create: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.create'),
  delete: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.delete'),
  export: translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.action.export'),
}

export const EMPTY_SAVE_LIST_NOTE: string = translateUiMessage(DEFAULT_UI_LANGUAGE, 'menu.worlds.empty')
/** @deprecated Use `EMPTY_SAVE_LIST_NOTE`. */
export const NO_SAVE_LIST_NOTE: string = EMPTY_SAVE_LIST_NOTE
const NO_SAVED_WORLD_INDEX = -1

export type MainMenuCallbacks = {
  readonly onStateChange?: (state: MainMenuState) => void
  readonly onCreateWorld?: (request: CreateWorldRequest) => void
  readonly onLoadWorld?: (world: SavedWorld) => void
  readonly onDeleteWorld?: (world: SavedWorld) => void
  readonly onDeleteUnreadableSave?: (save: UnreadableSave) => void
  readonly onExportWorld?: (world: SavedWorld) => void
  readonly onOpenMultiplayer?: () => void
  readonly onOpenSettings?: () => void
  readonly onExit?: () => void
}

export type MainMenuView = {
  readonly initializationResult: Result.Result<void, MainMenuViewInputFailure>
  readonly root: DomElement
  readonly render: (model: MainMenuViewModel) => Result.Result<void, MainMenuViewInputFailure>
  readonly destroy: () => void
}

type MainMenuViewInputFailure = Readonly<{
  readonly _tag: 'InvalidMainMenuViewInput'
  readonly field: string
}>

type Button = {
  readonly element: DomInteractiveElement
  readonly label: TextCell
  readonly hidden: AttributeCell
  readonly disabled: AttributeCell
}

type SavedWorldRow = {
  world: SavedWorld
  readonly root: DomElement
  readonly rootHidden: AttributeCell
  readonly load: Button
  readonly loadAccessibleName: AttributeCell
  readonly delete: Button
  readonly export: Button
  readonly confirm: Button
  readonly cancel: Button
}

type UnreadableSaveRow = {
  save: UnreadableSave
  readonly root: DomElement
  readonly rootHidden: AttributeCell
  readonly detail: TextCell
  readonly delete: Button
  readonly confirm: Button
  readonly cancel: Button
}

type MenuPanelElement = { readonly display: StyleCell; readonly element: DomElement; readonly hidden: AttributeCell }
type MenuPanels = Record<MenuPanel, MenuPanelElement>
type StyleEntry = readonly [property: string, value: string]

type MakeElementOptions = {
  readonly factory: DomElementFactory
  readonly parent: DomElement
  readonly tag: string
  readonly marker: string
}

type MakeButtonOptions = {
  readonly factory: DomElementFactory
  readonly parent: DomElement
  readonly marker: string
  readonly action: string
  readonly key: UiMessageKey
}

type CreateMenuPanelOptions = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly panel: MenuPanel
  readonly headingKey: UiMessageKey
}

type WorldInputField = 'world-name' | 'seed'

type CreateFieldLabelOptions = {
  readonly factory: DomElementFactory
  readonly parent: DomElement
  readonly field: WorldInputField
  readonly input: DomInputElement
}

type CreateWorldInputOptions = {
  readonly factory: DomElementFactory
  readonly parent: DomElement
  readonly marker: string
  readonly field: WorldInputField
  readonly key: UiMessageKey
}

type SeedFields = {
  readonly worldNameInput: DomInputElement
  readonly seedInput: DomInputElement
  readonly seedInvalid: AttributeCell
  readonly seedErrorHidden: AttributeCell
}

type WorldForm = SeedFields & {
  readonly gameModeButton: Button
  readonly gameModeAccessibleName: AttributeCell
  readonly difficultyButton: Button
  readonly difficultyAccessibleName: AttributeCell
  readonly worldTypeLabelHidden: AttributeCell
  readonly worldTypeButton: Button
  readonly worldTypeButtonHidden: AttributeCell
  readonly worldTypeOptionsStatus: AttributeCell
  readonly backButton: Button
  readonly createButton: Button
}

type WorldList = {
  readonly createWorldButton: Button
  readonly emptyNoteHidden: AttributeCell
  readonly worldList: DomElement
  readonly unreadableSummaryText: TextCell
  readonly unreadableSummaryHidden: AttributeCell
  readonly unreadableList: DomElement
  readonly backButton: Button
}

type MainMenuElements = {
  readonly root: DomElement
  readonly rootHidden: AttributeCell
  readonly panelRoots: MenuPanels
  readonly rootButtons: Record<RootEntry, Button>
  readonly form: WorldForm
  readonly worldList: WorldList
}

type MainMenuRuntime = {
  state: MainMenuState
  model: MainMenuViewModel
  pendingDelete: string | null
  readonly savedRows: Map<string, SavedWorldRow>
  readonly unreadableRows: Map<string, UnreadableSaveRow>
}

type MainMenuRenderContext = {
  readonly dom: MainMenuElements
  readonly runtime: MainMenuRuntime
  readonly callbacks: MainMenuCallbacks
  readonly factory: DomElementFactory
  readonly listeners: Array<() => void>
}

type BindListenerOptions = {
  readonly context: MainMenuRenderContext
  readonly element: DomInteractiveElement
  readonly listener: EventListener
  readonly type: string
}

const IMAGE_SOURCE = new URL('../../assets/title-panorama.svg', import.meta.url).href
const NEXT_DIFFICULTY: Readonly<Record<GameDifficulty, GameDifficulty>> = {
  easy: 'normal',
  hard: 'peaceful',
  normal: 'hard',
  peaceful: 'easy',
}
const EMPTY_COUNT = 0
const decodeWorldSeedText = Schema.decodeUnknownSync(WorldSeedTextSchema)
const decodeWorldNameText = Schema.decodeUnknownSync(WorldNameTextSchema)
const decodeWorldTypeId = Schema.decodeUnknownSync(WorldTypeIdSchema)
const NEXT_INDEX = 1

const FIELD_MESSAGE_KEY: Readonly<Record<MenuField, UiMessageKey>> = {
  difficulty: 'menu.field.difficulty',
  'game-mode': 'menu.field.game-mode',
  seed: 'menu.field.seed',
  'world-name': 'menu.field.world-name',
  'world-type': 'menu.field.world-type',
}

const makeElement = ({ factory, parent, tag, marker }: MakeElementOptions): DomElement => {
  const element = factory.createElement(tag)
  element.setAttribute('data-mx-ui', marker)
  inheritUiLanguage(parent, element)
  return element
}

const setStyleProperties = (element: DomElement, entries: ReadonlyArray<StyleEntry>): void => {
  for (const [property, value] of entries) {
    element.style.setProperty(property, value)
  }
}

const initializeButtonElement = (element: DomInteractiveElement, options: MakeButtonOptions): void => {
  element.setAttribute('type', 'button')
  element.setAttribute('data-mx-ui', options.marker)
  element.setAttribute('data-menu-action', options.action)
  inheritUiLanguage(options.parent, element)
}

const makeButton = ({ factory, parent, marker, action, key }: MakeButtonOptions): Button => {
  const element = factory.createElement('button')
  initializeButtonElement(element, { action, factory, key, marker, parent })
  setStyleProperties(element, [
    ['appearance', 'none'],
    ['background-color', PALETTE_VAR.surfaceRaised],
    ['border', `1px solid ${PALETTE_VAR.slotBorder}`],
    ['border-radius', '0.25rem'],
    ['color', PALETTE_VAR.ink],
    ['font-family', 'inherit'],
    ['font-size', '1rem'],
    ['min-height', '2.75rem'],
    ['opacity', '1'],
    ['padding', '0.55rem 0.85rem'],
  ])
  const label = textCell(element)
  writeLocalizedText(label, key)
  const hidden = attributeCell(element, 'hidden')
  const disabled = attributeCell(element, 'disabled')
  parent.appendChild(element)
  return { disabled, element, hidden, label }
}

const bindListener = ({ context, element, listener, type }: BindListenerOptions): void => {
  element.addEventListener(type, listener)
  context.listeners.push(() => element.removeEventListener?.(type, listener))
}

const bindButton = (context: MainMenuRenderContext, button: Button, onClick: () => void): void => {
  bindListener({ context, element: button.element, listener: onClick, type: 'click' })
}

const setButtonDisabled = (button: Button, disabled: boolean): void => {
  if (disabled) {
    writeAttribute(button.disabled, '')
    return
  }
  writeAttribute(button.disabled)
}

const setButtonHidden = (button: Button, hidden: boolean): void => {
  writeHidden(button.hidden, hidden)
}

const localizeButtonAria = (button: Button, key: UiMessageKey, values: UiMessageValues = {}): void => {
  setLocalizedAttribute(button.element, 'aria-label', key, values)
}

type InitializeMenuPanelOptions = {
  readonly element: DomElement
  readonly root: DomElement
  readonly panel: MenuPanel
  readonly headingKey: UiMessageKey
  readonly factory: DomElementFactory
}

type AppendPanelHeadingOptions = {
  readonly factory: DomElementFactory
  readonly panel: DomElement
  readonly root: DomElement
  readonly headingKey: UiMessageKey
}

const appendPanelHeading = ({ factory, panel, root, headingKey }: AppendPanelHeadingOptions): void => {
  const heading = makeElement({ factory, marker: 'menu-panel-title', parent: root, tag: 'h2' })
  writeLocalizedText(textCell(heading), headingKey)
  panel.appendChild(heading)
}

const initializeMenuPanel = ({ element, root, panel, headingKey, factory }: InitializeMenuPanelOptions): StyleCell => {
  element.setAttribute('data-menu-panel', panel)
  element.setAttribute('hidden', '')
  element.setAttribute('role', 'group')
  const display = styleCell(element, 'display')
  writeStyle(display, 'none')
  setStyleProperties(element, [
    ['justify-items', 'center'],
    ['gap', '0.75rem'],
    ['width', '100%'],
  ])
  setLocalizedAttribute(element, 'aria-label', headingKey)
  appendPanelHeading({ factory, headingKey, panel: element, root })
  root.appendChild(element)
  return display
}

const createMenuPanel = ({ factory, root, panel, headingKey }: CreateMenuPanelOptions): MenuPanelElement => {
  const element = makeElement({ factory, marker: 'menu-panel', parent: root, tag: 'section' })
  const display = initializeMenuPanel({ element, factory, headingKey, panel, root })
  const hidden = attributeCell(element, 'hidden')
  hidden.previous = ''
  return { display, element, hidden }
}

const renderFieldLabelText = (label: DomElement, key: UiMessageKey): void => setLocalizedText(label, key)

type CreateFieldLabelTextOptions = {
  readonly factory: DomElementFactory
  readonly key: UiMessageKey
  readonly parent: DomElement
}

const createFieldLabelText = ({ factory, key, parent }: CreateFieldLabelTextOptions): DomElement => {
  const text = makeElement({ factory, marker: 'menu-field-label-text', parent, tag: 'span' })
  renderFieldLabelText(text, key)
  return text
}

const appendFieldLabelText = (factory: DomElementFactory, field: WorldInputField, parent: DomElement): UiMessageKey => {
  const key = FIELD_MESSAGE_KEY[field]
  parent.appendChild(createFieldLabelText({ factory, key, parent }))
  return key
}

const createFieldLabel = ({ factory, parent, field, input }: CreateFieldLabelOptions): DomElement => {
  const label = makeElement({ factory, marker: 'menu-field-label', parent, tag: 'label' })
  label.setAttribute('data-menu-field', field)
  setStyleProperties(label, [
    ['align-items', 'center'],
    ['display', 'grid'],
    ['gap', '0.75rem'],
    ['grid-template-columns', 'minmax(7rem, 1fr) minmax(0, 1.5fr)'],
    ['text-align', 'left'],
    ['width', 'min(100%, 28rem)'],
  ])
  const key = appendFieldLabelText(factory, field, label)
  setLocalizedAttribute(input, 'aria-label', key)
  label.appendChild(input)
  parent.appendChild(label)
  return label
}

const createWorldInput = ({ factory, parent, marker, field, key }: CreateWorldInputOptions): DomInputElement => {
  const input = factory.createElement('input')
  input.setAttribute('type', 'text')
  input.setAttribute('data-mx-ui', marker)
  inheritUiLanguage(parent, input)
  setLocalizedAttribute(input, 'aria-label', key)
  setLocalizedAttribute(input, 'placeholder', key)
  setStyleProperties(input, [
    ['background-color', PALETTE_VAR.surfaceRaised],
    ['border', `1px solid ${PALETTE_VAR.slotBorder}`],
    ['border-radius', '0.25rem'],
    ['box-sizing', 'border-box'],
    ['color', PALETTE_VAR.ink],
    ['min-height', '2.75rem'],
    ['min-width', '0'],
    ['padding', '0.5rem 0.65rem'],
    ['width', '100%'],
  ])
  createFieldLabel({ factory, field, input, parent })
  return input
}

const createMenuRoot = (factory: DomElementFactory, parent: DomElement): { readonly root: DomElement; readonly rootHidden: AttributeCell } => {
  const root = factory.createElement('main')
  inheritUiLanguage(parent, root)
  root.setAttribute('data-mx-ui', 'main-menu')
  root.setAttribute('role', 'main')
  setStyleProperties(root, [
    ['position', 'relative'],
    ['display', 'grid'],
    ['place-items', 'center'],
    ['min-height', 'calc(100vh - var(--mx-ui-safe-area-top, env(safe-area-inset-top, 0px)) - var(--mx-ui-safe-area-bottom, env(safe-area-inset-bottom, 0px)))'],
    ['overflow', 'hidden'],
    ['background-color', PALETTE_VAR.scrim],
  ])
  declarePalette(root)
  parent.appendChild(root)
  return { root, rootHidden: attributeCell(root, 'hidden') }
}

const createMenuPanorama = (factory: DomElementFactory, root: DomElement): DomElement => {
  const panorama = makeElement({ factory, marker: 'menu-panorama', parent: root, tag: 'img' })
  panorama.setAttribute('src', IMAGE_SOURCE)
  panorama.setAttribute('alt', '')
  panorama.setAttribute('aria-hidden', 'true')
  setStyleProperties(panorama, [
    ['position', 'absolute'],
    ['inset', '0'],
    ['width', '100%'],
    ['height', '100%'],
    ['object-fit', 'cover'],
    ['opacity', '0.82'],
  ])
  root.appendChild(panorama)
  return panorama
}

const createMenuContent = (factory: DomElementFactory, root: DomElement): DomElement => {
  const content = makeElement({ factory, marker: 'menu-content', parent: root, tag: 'div' })
  setStyleProperties(content, [
    ['position', 'relative'],
    ['z-index', '1'],
    ['display', 'grid'],
    ['justify-items', 'center'],
    ['gap', '1.5rem'],
    ['width', 'min(92vw, 38rem)'],
    ['max-height', 'calc(100vh - var(--mx-ui-safe-area-top, env(safe-area-inset-top, 0px)) - var(--mx-ui-safe-area-bottom, env(safe-area-inset-bottom, 0px)))'],
    ['box-sizing', 'border-box'],
    ['overflow-y', 'auto'],
    ['padding', '2rem'],
    ['background-color', PALETTE_VAR.scrim],
    ['border', `1px solid ${PALETTE_VAR.slotBorder}`],
    ['border-radius', '0.5rem'],
    ['color', PALETTE_VAR.ink],
  ])
  root.appendChild(content)
  return content
}

const appendMenuTitle = (factory: DomElementFactory, content: DomElement): void => {
  const title = makeElement({ factory, marker: 'menu-title', parent: content, tag: 'h1' })
  setStyleProperties(title, [
    ['color', PALETTE_VAR.ink],
    ['font-size', 'clamp(2.25rem, 7vw, 3.5rem)'],
    ['letter-spacing', '0.04em'],
    ['margin', '0'],
    ['text-align', 'center'],
  ])
  writeLocalizedText(textCell(title), 'menu.brand')
  content.appendChild(title)
}

const createMenuScaffold = (
  factory: DomElementFactory,
  parent: DomElement,
): { readonly root: DomElement; readonly rootHidden: AttributeCell; readonly content: DomElement } => {
  const { root, rootHidden } = createMenuRoot(factory, parent)
  createMenuPanorama(factory, root)
  const content = createMenuContent(factory, root)
  appendMenuTitle(factory, content)
  return { content, root, rootHidden }
}

const createMenuPanels = (factory: DomElementFactory, content: DomElement): MenuPanels => ({
  'load-world': createMenuPanel({ factory, headingKey: 'menu.panel.load-world', panel: 'load-world', root: content }),
  'new-world': createMenuPanel({ factory, headingKey: 'menu.panel.new-world', panel: 'new-world', root: content }),
  root: createMenuPanel({ factory, headingKey: 'menu.panel.root', panel: 'root', root: content }),
})

type BuildRootButtonsOptions = {
  readonly factory: DomElementFactory
  readonly panel: DomElement
  readonly callbacks: MainMenuCallbacks
}

const callbackOrNull = (callback: (() => void) | undefined): (() => void) | null => {
  if (typeof callback === 'undefined') {
    return null
  }
  return callback
}

const externalRootCallback = (
  callbacks: MainMenuCallbacks,
  entry: Exclude<RootEntry, 'single-player'>,
): (() => void) | null => {
  if (entry === 'multiplayer') {
    return callbackOrNull(callbacks.onOpenMultiplayer)
  }
  if (entry === 'settings') {
    return callbackOrNull(callbacks.onOpenSettings)
  }
  return callbackOrNull(callbacks.onExit)
}

type CreateRootEntryButtonOptions = BuildRootButtonsOptions & {
  readonly entry: RootEntry
  readonly key: UiMessageKey
}

const createRootEntryButton = ({ factory, panel, callbacks, entry, key }: CreateRootEntryButtonOptions): Button => {
  const button = makeButton({ action: entry, factory, key, marker: 'menu-entry', parent: panel })
  button.element.setAttribute('data-menu-entry', entry)
  setStyleProperties(button.element, [
    ['min-width', 'min(72vw, 20rem)'],
    ['padding', '0.8rem 1rem'],
    ['text-align', 'center'],
  ])
  localizeButtonAria(button, key)
  setButtonDisabled(button, entry !== 'single-player' && externalRootCallback(callbacks, entry) === null)
  return button
}

const buildRootButtons = ({ factory, panel, callbacks }: BuildRootButtonsOptions): Record<RootEntry, Button> => {
  const singlePlayer = createRootEntryButton({ callbacks, entry: 'single-player', factory, key: 'menu.root.single-player', panel })
  const multiplayer = createRootEntryButton({ callbacks, entry: 'multiplayer', factory, key: 'menu.root.multiplayer', panel })
  const settings = createRootEntryButton({ callbacks, entry: 'settings', factory, key: 'menu.root.settings', panel })
  const exit = createRootEntryButton({ callbacks, entry: 'exit', factory, key: 'menu.root.exit', panel })
  return { exit, multiplayer, settings, 'single-player': singlePlayer }
}

const createSeedError = (
  factory: DomElementFactory,
  panel: DomElement,
  seedInput: DomInputElement,
): { readonly invalid: AttributeCell; readonly hidden: AttributeCell } => {
  const invalid = attributeCell(seedInput, 'aria-invalid')
  const error = makeElement({ factory, marker: 'menu-seed-error', parent: panel, tag: 'p' })
  setLocalizedText(error, 'menu.seed.invalid')
  error.setAttribute('hidden', '')
  panel.appendChild(error)
  const hidden = attributeCell(error, 'hidden')
  hidden.previous = ''
  return { hidden, invalid }
}

const createSeedFields = (factory: DomElementFactory, panel: DomElement): SeedFields => {
  const worldNameInput = createWorldInput({
    factory,
    field: 'world-name',
    key: 'menu.field.world-name',
    marker: 'menu-world-name',
    parent: panel,
  })
  const seedInput = createWorldInput({
    factory,
    field: 'seed',
    key: 'menu.field.seed',
    marker: 'menu-world-seed',
    parent: panel,
  })
  const seed = createSeedError(factory, panel, seedInput)
  return {
    seedErrorHidden: seed.hidden,
    seedInput,
    seedInvalid: seed.invalid,
    worldNameInput,
  }
}

const appendFieldHeading = (factory: DomElementFactory, panel: DomElement, field: MenuField): DomElement => {
  const heading = makeElement({ factory, marker: 'menu-field-label', parent: panel, tag: 'p' })
  heading.setAttribute('data-menu-field', field)
  if (field === 'world-type') {
    setLocalizedText(heading, FIELD_MESSAGE_KEY[field], { type: '' })
  } else {
    setLocalizedText(heading, FIELD_MESSAGE_KEY[field])
  }
  panel.appendChild(heading)
  return heading
}

type CreateChoiceControlOptions = {
  readonly factory: DomElementFactory
  readonly panel: DomElement
  readonly field: MenuField
  readonly marker: string
  readonly action: string
  readonly key: UiMessageKey
}

const createChoiceControl = ({ factory, panel, field, marker, action, key }: CreateChoiceControlOptions): {
  readonly button: Button
  readonly accessibleName: AttributeCell
} => {
  appendFieldHeading(factory, panel, field)
  const button = makeButton({ action, factory, key, marker, parent: panel })
  return { accessibleName: attributeCell(button.element, 'aria-label'), button }
}

const createWorldTypeControl = (factory: DomElementFactory, panel: DomElement): Pick<WorldForm, 'worldTypeLabelHidden' | 'worldTypeButton' | 'worldTypeButtonHidden' | 'worldTypeOptionsStatus'> => {
  const label = appendFieldHeading(factory, panel, 'world-type')
  const button = makeButton({ action: 'world-type', factory, key: 'menu.field.world-type', marker: 'menu-world-type', parent: panel })
  writeLocalizedText(button.label, 'menu.field.world-type', { type: '' })
  const labelHidden = attributeCell(label, 'hidden')
  writeHidden(labelHidden, true)
  writeHidden(button.hidden, true)
  return {
    worldTypeButton: button,
    worldTypeButtonHidden: button.hidden,
    worldTypeLabelHidden: labelHidden,
    worldTypeOptionsStatus: attributeCell(button.element, 'data-world-type-options'),
  }
}

type BuildWorldFormOptions = {
  readonly factory: DomElementFactory
  readonly panel: DomElement
}

const buildWorldForm = ({ factory, panel }: BuildWorldFormOptions): WorldForm => {
  const fields = createSeedFields(factory, panel)
  const gameMode = createChoiceControl({ action: 'mode', factory, field: 'game-mode', key: 'menu.mode.survival', marker: 'menu-game-mode', panel })
  const difficulty = createChoiceControl({ action: 'difficulty', factory, field: 'difficulty', key: 'settings.choice.difficulty.normal', marker: 'menu-difficulty', panel })
  const worldType = createWorldTypeControl(factory, panel)
  const backButton = makeButton({ action: 'back', factory, key: MENU_ACTION_KEY.back, marker: 'menu-back-worlds', parent: panel })
  const createButton = makeButton({ action: 'confirm', factory, key: MENU_ACTION_KEY.create, marker: 'menu-create-world', parent: panel })
  setButtonDisabled(createButton, true)
  return {
    ...fields,
    backButton,
    createButton,
    difficultyAccessibleName: difficulty.accessibleName,
    difficultyButton: difficulty.button,
    gameModeAccessibleName: gameMode.accessibleName,
    gameModeButton: gameMode.button,
    ...worldType,
  }
}

type BuildWorldListOptions = {
  readonly factory: DomElementFactory
  readonly panel: DomElement
}

const createEmptySaveNote = (factory: DomElementFactory, panel: DomElement): AttributeCell => {
  const emptyNote = makeElement({ factory, marker: 'menu-note', parent: panel, tag: 'p' })
  setLocalizedText(emptyNote, 'menu.worlds.empty')
  panel.appendChild(emptyNote)
  const hidden = attributeCell(emptyNote, 'hidden')
  return hidden
}

const createUnreadableSummary = (factory: DomElementFactory, panel: DomElement): { readonly text: TextCell; readonly hidden: AttributeCell } => {
  const summary = makeElement({ factory, marker: 'menu-unreadable-summary', parent: panel, tag: 'p' })
  panel.appendChild(summary)
  const hidden = attributeCell(summary, 'hidden')
  return { hidden, text: textCell(summary) }
}

const createUnreadableList = (factory: DomElementFactory, panel: DomElement): DomElement => {
  const list = makeElement({ factory, marker: 'menu-unreadable-list', parent: panel, tag: 'div' })
  panel.appendChild(list)
  return list
}

const buildWorldList = ({ factory, panel }: BuildWorldListOptions): WorldList => {
  const createWorldButton = makeButton({ action: 'new-world', factory, key: 'menu.root.new-world', marker: 'menu-new-world', parent: panel })
  localizeButtonAria(createWorldButton, 'menu.root.new-world')
  const emptyNoteHidden = createEmptySaveNote(factory, panel)
  const worldList = makeElement({ factory, marker: 'menu-world-list', parent: panel, tag: 'div' })
  panel.appendChild(worldList)
  const summary = createUnreadableSummary(factory, panel)
  const unreadableList = createUnreadableList(factory, panel)
  const backButton = makeButton({ action: 'back', factory, key: MENU_ACTION_KEY.back, marker: 'menu-back', parent: panel })
  return {
    backButton,
    createWorldButton,
    emptyNoteHidden,
    unreadableList,
    unreadableSummaryHidden: summary.hidden,
    unreadableSummaryText: summary.text,
    worldList,
  }
}

type BuildMenuElementsOptions = {
  readonly factory: DomElementFactory
  readonly parent: DomElement
  readonly callbacks: MainMenuCallbacks
}

const buildMenuElements = ({ factory, parent, callbacks }: BuildMenuElementsOptions): MainMenuElements => {
  const scaffold = createMenuScaffold(factory, parent)
  const panelRoots = createMenuPanels(factory, scaffold.content)
  const rootButtons = buildRootButtons({ callbacks, factory, panel: panelRoots.root.element })
  const form = buildWorldForm({ factory, panel: panelRoots['new-world'].element })
  const worldList = buildWorldList({ factory, panel: panelRoots['load-world'].element })
  return { form, panelRoots, root: scaffold.root, rootButtons, rootHidden: scaffold.rootHidden, worldList }
}

const createRuntime = (): MainMenuRuntime => ({
  model: mainMenuViewModel(initialMainMenuState),
  pendingDelete: null,
  savedRows: new Map(),
  state: initialMainMenuState,
  unreadableRows: new Map(),
})

type MainMenuButtonFailure = { readonly _tag: 'MissingMainMenuButton'; readonly entry: string }

export const requireRootButton = <Entry extends string, ButtonElement>(
  buttons: Readonly<Record<Entry, ButtonElement>>,
  entry: Entry,
): Result.Result<ButtonElement, MainMenuButtonFailure> => {
  const button = buttons[entry]
  if (typeof button === 'undefined') {
    return Result.fail({ _tag: 'MissingMainMenuButton', entry })
  }
  return Result.succeed(button)
}

const focusForPanel = (
  dom: MainMenuElements,
  panel: MenuPanel,
): DomInteractiveElement => {
  if (panel === 'root') {
    return dom.rootButtons['single-player'].element
  }
  if (panel === 'new-world') {
    return dom.form.worldNameInput
  }
  return dom.worldList.createWorldButton.element
}

const stateFromModel = (model: MainMenuViewModel): MainMenuState => ({
  draft: {
    difficulty: model.difficulty,
    mode: model.mode,
    name: model.worldNameInput,
    seed: model.seedInput,
    worldType: model.worldType,
  },
  panel: model.panel,
})

const modeMessageKey = (mode: GameMode): UiMessageKey => {
  if (mode === 'survival') {
    return 'menu.mode.survival'
  }
  return 'menu.mode.creative'
}

const difficultyMessageKey = (difficulty: GameDifficulty): UiMessageKey => `settings.choice.difficulty.${difficulty}`

const renderInputValue = (input: DomInputElement, value: string): void => {
  if (input.value !== value) {
    input.value = value
  }
}

const renderWorldType = (form: WorldForm, model: MainMenuViewModel): void => {
  const selected = model.worldTypes.find((option) => typeof option !== 'undefined' && option.value === model.worldType)
  if (typeof selected === 'undefined') {
    writeLocalizedText(form.worldTypeButton.label, 'menu.field.world-type', { type: '' })
    writeHidden(form.worldTypeLabelHidden, true)
    writeHidden(form.worldTypeButtonHidden, true)
    return
  }
  writeLocalizedTextUsing(form.worldTypeButton.label, (language: UiLanguage) =>
    translateUiMessage(language, 'menu.field.world-type', { type: selected.label[language] }),
  )
  writeHidden(form.worldTypeLabelHidden, false)
  writeHidden(form.worldTypeButtonHidden, false)
  setButtonDisabled(form.worldTypeButton, false)
}

const renderWorldChoices = (form: WorldForm, model: MainMenuViewModel): void => {
  const modeKey = modeMessageKey(model.mode)
  const difficultyKey = difficultyMessageKey(model.difficulty)
  writeLocalizedText(form.gameModeButton.label, modeKey)
  writeLocalizedText(form.difficultyButton.label, difficultyKey)
  writeLocalizedAttribute(form.gameModeAccessibleName, 'menu.mode.aria', { mode: { key: modeKey } })
  writeLocalizedAttribute(form.difficultyAccessibleName, 'settings.choice-aria', {
    choice: { key: difficultyKey },
    setting: { key: 'menu.field.difficulty' },
  })
  renderWorldType(form, model)
}

const renderExternalActionAvailability = (context: MainMenuRenderContext): void => {
  setButtonDisabled(context.dom.rootButtons.multiplayer, typeof context.callbacks.onOpenMultiplayer !== 'function')
  setButtonDisabled(context.dom.rootButtons.settings, typeof context.callbacks.onOpenSettings !== 'function')
  setButtonDisabled(context.dom.rootButtons.exit, typeof context.callbacks.onExit !== 'function')
}

const renderSaveListSummary = (context: MainMenuRenderContext, model: MainMenuViewModel): void => {
  writeHidden(context.dom.worldList.emptyNoteHidden, model.savedWorlds.length !== EMPTY_COUNT)
  writeLocalizedText(context.dom.worldList.unreadableSummaryText, 'menu.worlds.unreadable', {
    count: String(model.unreadableSaves.length),
  })
  writeHidden(context.dom.worldList.unreadableSummaryHidden, model.unreadableSaves.length === EMPTY_COUNT)
}

const renderMenuAvailability = (context: MainMenuRenderContext, model: MainMenuViewModel): void => {
  let optionsStatus = 'available'
  if (model.worldTypes.length === EMPTY_COUNT) {
    optionsStatus = 'empty'
  }
  writeAttribute(context.dom.form.worldTypeOptionsStatus, optionsStatus)
  setButtonDisabled(context.dom.form.createButton, typeof context.callbacks.onCreateWorld !== 'function')
  renderExternalActionAvailability(context)
  renderSaveListSummary(context, model)
}

const renderWorldForm = (context: MainMenuRenderContext, model: MainMenuViewModel): void => {
  const { form } = context.dom
  renderInputValue(form.worldNameInput, model.worldNameInput)
  renderInputValue(form.seedInput, model.seedInput)
  renderWorldChoices(form, model)
  renderMenuAvailability(context, model)
}

const pendingEntityKey = (pending: string | null, kind: 'world' | 'unreadable'): string | null => {
  if (pending === null) {
    return null
  }
  const waitingPrefix = `waiting:${kind}:`
  if (pending.startsWith(waitingPrefix)) {
    return pending.slice(waitingPrefix.length)
  }
  const activePrefix = `${kind}:`
  if (pending.startsWith(activePrefix)) {
    return pending.slice(activePrefix.length)
  }
  return null
}

const clearMissingPendingEntity = (
  runtime: MainMenuRuntime,
  keys: ReadonlySet<string>,
  kind: 'world' | 'unreadable',
): void => {
  const pending = pendingEntityKey(runtime.pendingDelete, kind)
  if (pending !== null && !keys.has(pending)) {
    runtime.pendingDelete = null
  }
}

const renderSavedWorldButtonAvailability = (context: MainMenuRenderContext, row: SavedWorldRow, waiting: boolean): void => {
  setButtonDisabled(row.load, typeof context.callbacks.onLoadWorld !== 'function' || waiting)
  setButtonDisabled(row.delete, typeof context.callbacks.onDeleteWorld !== 'function' || waiting)
  setButtonDisabled(row.export, typeof context.callbacks.onExportWorld !== 'function' || waiting)
  setButtonDisabled(row.confirm, typeof context.callbacks.onDeleteWorld !== 'function' || waiting)
}

const renderSavedWorldButtonVisibility = (row: SavedWorldRow, confirming: boolean, waiting: boolean): void => {
  setButtonHidden(row.delete, confirming || waiting)
  setButtonHidden(row.confirm, !confirming && !waiting)
  setButtonHidden(row.cancel, !confirming || waiting)
  setButtonHidden(row.export, confirming || waiting)
}

const renderSavedWorldRowButtons = (context: MainMenuRenderContext, row: SavedWorldRow, key: string): void => {
  const confirming = context.runtime.pendingDelete === key
  const waiting = context.runtime.pendingDelete === `waiting:${key}`
  renderSavedWorldButtonAvailability(context, row, waiting)
  renderSavedWorldButtonVisibility(row, confirming, waiting)
}

const hideRemovedSavedWorldRows = (runtime: MainMenuRuntime, ids: ReadonlySet<string>): void => {
  for (const [sessionId, row] of runtime.savedRows) {
    if (!ids.has(sessionId)) {
      writeHidden(row.rootHidden, true)
    }
  }
}

const renderUnreadableRowButtons = (
  context: MainMenuRenderContext,
  row: UnreadableSaveRow,
  key: string,
): void => {
  const isConfirming = context.runtime.pendingDelete === key
  const isWaiting = context.runtime.pendingDelete === `waiting:${key}`
  const unavailable = typeof context.callbacks.onDeleteUnreadableSave !== 'function' || isWaiting
  setButtonDisabled(row.delete, unavailable)
  setButtonDisabled(row.confirm, unavailable)
  setButtonHidden(row.delete, isConfirming || isWaiting)
  setButtonHidden(row.confirm, !isConfirming && !isWaiting)
  setButtonHidden(row.cancel, !isConfirming || isWaiting)
}

const hideRemovedUnreadableRows = (runtime: MainMenuRuntime, keys: ReadonlySet<string>): void => {
  for (const [key, row] of runtime.unreadableRows) {
    if (!keys.has(key)) {
      writeHidden(row.rootHidden, true)
    }
  }
}

type SavedWorldButtons = {
  readonly load: Button
  readonly loadAccessibleName: AttributeCell
  readonly remove: Button
  readonly exportButton: Button
  readonly confirm: Button
  readonly cancel: Button
}

const createSavedWorldButtons = (factory: DomElementFactory, parent: DomElement): SavedWorldButtons => {
  const load = makeButton({ action: 'load', factory, key: 'menu.world-row.aria', marker: 'menu-world-row', parent })
  const loadAccessibleName = attributeCell(load.element, 'aria-label')
  const remove = makeButton({ action: 'delete', factory, key: MENU_ACTION_KEY.delete, marker: 'menu-world-delete', parent })
  const exportButton = makeButton({ action: 'export', factory, key: MENU_ACTION_KEY.export, marker: 'menu-world-export', parent })
  const confirm = makeButton({ action: 'confirm-delete', factory, key: MENU_ACTION_KEY.confirm, marker: 'menu-world-delete-confirm', parent })
  const cancel = makeButton({ action: 'cancel-delete', factory, key: MENU_ACTION_KEY.cancel, marker: 'menu-world-delete-cancel', parent })
  return { cancel, confirm, exportButton, load, loadAccessibleName, remove }
}

const showSavedWorldDeleteConfirmation = (context: MainMenuRenderContext, row: SavedWorldRow): void => {
  const key = `world:${row.world.sessionId}`
  context.runtime.pendingDelete = key
  renderSavedWorldRowButtons(context, row, key)
}

const confirmSavedWorldDeletion = (
  context: MainMenuRenderContext,
  row: SavedWorldRow,
  onDeleteWorld: (world: SavedWorld) => void,
): void => {
  const key = `world:${row.world.sessionId}`
  if (context.runtime.pendingDelete !== key) {
    return
  }
  onDeleteWorld(row.world)
  context.runtime.pendingDelete = `waiting:${key}`
  renderSavedWorldRowButtons(context, row, key)
}

const cancelSavedWorldDeletion = (context: MainMenuRenderContext, row: SavedWorldRow): void => {
  const key = `world:${row.world.sessionId}`
  if (context.runtime.pendingDelete === key) {
    context.runtime.pendingDelete = null
  }
  renderSavedWorldRowButtons(context, row, key)
}

const bindSavedWorldRow = (context: MainMenuRenderContext, row: SavedWorldRow): void => {
  const { onDeleteWorld, onExportWorld, onLoadWorld } = context.callbacks
  if (typeof onLoadWorld === 'function') {
    bindButton(context, row.load, () => onLoadWorld(row.world))
  }
  if (typeof onExportWorld === 'function') {
    bindButton(context, row.export, () => onExportWorld(row.world))
  }
  if (typeof onDeleteWorld === 'function') {
    bindButton(context, row.delete, () => showSavedWorldDeleteConfirmation(context, row))
    bindButton(context, row.confirm, () => confirmSavedWorldDeletion(context, row, onDeleteWorld))
  }
  bindButton(context, row.cancel, () => cancelSavedWorldDeletion(context, row))
}

const createSavedWorldRow = (context: MainMenuRenderContext, world: SavedWorld): SavedWorldRow => {
  const { dom } = context
  const root = makeElement({ factory: context.factory, marker: 'menu-world-row-container', parent: dom.root, tag: 'article' })
  root.setAttribute('data-session-id', world.sessionId)
  const buttons = createSavedWorldButtons(context.factory, root)
  buttons.load.element.setAttribute('data-session-id', world.sessionId)
  dom.worldList.worldList.appendChild(root)
  const row: SavedWorldRow = {
    cancel: buttons.cancel,
    confirm: buttons.confirm,
    delete: buttons.remove,
    export: buttons.exportButton,
    load: buttons.load,
    loadAccessibleName: buttons.loadAccessibleName,
    root,
    rootHidden: attributeCell(root, 'hidden'),
    world,
  }
  context.runtime.savedRows.set(world.sessionId, row)
  bindSavedWorldRow(context, row)
  return row
}

const ensureSavedWorldRow = (context: MainMenuRenderContext, world: SavedWorld): SavedWorldRow => {
  const existing = context.runtime.savedRows.get(world.sessionId)
  if (typeof existing !== 'undefined') {
    existing.world = world
    return existing
  }
  return createSavedWorldRow(context, world)
}

const renderSavedWorldRow = (context: MainMenuRenderContext, world: SavedWorld): void => {
  const row = ensureSavedWorldRow(context, world)
  writeHidden(row.rootHidden, false)
  let name: UiMessageValues['name'] = world.name
  if (world.name === '') {
    name = { key: 'menu.worlds.unnamed' }
  }
  const values: UiMessageValues = {
    name,
    sessionId: world.sessionId,
  }
  writeLocalizedText(row.load.label, 'menu.world-row.aria', values)
  writeLocalizedAttribute(row.loadAccessibleName, 'menu.world-row.aria', values)
  renderSavedWorldRowButtons(context, row, `world:${world.sessionId}`)
}

const renderSavedWorlds = (context: MainMenuRenderContext, worlds: ReadonlyArray<SavedWorld>): void => {
  const ids = new Set(worlds.map((world) => world.sessionId))
  clearMissingPendingEntity(context.runtime, ids, 'world')
  for (const world of worlds) {
    renderSavedWorldRow(context, world)
  }
  hideRemovedSavedWorldRows(context.runtime, ids)
}

type UnreadableSaveButtons = {
  readonly deleteButton: Button
  readonly confirm: Button
  readonly cancel: Button
}

const createUnreadableSaveButtons = (factory: DomElementFactory, parent: DomElement): UnreadableSaveButtons => ({
  cancel: makeButton({ action: 'cancel-delete-unreadable', factory, key: MENU_ACTION_KEY.cancel, marker: 'menu-unreadable-delete-cancel', parent }),
  confirm: makeButton({ action: 'confirm-delete-unreadable', factory, key: MENU_ACTION_KEY.confirm, marker: 'menu-unreadable-delete-confirm', parent }),
  deleteButton: makeButton({ action: 'delete-unreadable', factory, key: MENU_ACTION_KEY.delete, marker: 'menu-unreadable-delete', parent }),
})

const showUnreadableDeleteConfirmation = (context: MainMenuRenderContext, row: UnreadableSaveRow): void => {
  const key = `unreadable:${row.save.key}`
  context.runtime.pendingDelete = key
  renderUnreadableRowButtons(context, row, key)
}

const confirmUnreadableDeletion = (
  context: MainMenuRenderContext,
  row: UnreadableSaveRow,
  onDeleteUnreadableSave: (save: UnreadableSave) => void,
): void => {
  const key = `unreadable:${row.save.key}`
  if (context.runtime.pendingDelete !== key) {
    return
  }
  onDeleteUnreadableSave(row.save)
  context.runtime.pendingDelete = `waiting:${key}`
  renderUnreadableRowButtons(context, row, key)
}

const cancelUnreadableDeletion = (context: MainMenuRenderContext, row: UnreadableSaveRow): void => {
  const key = `unreadable:${row.save.key}`
  if (context.runtime.pendingDelete === key) {
    context.runtime.pendingDelete = null
  }
  renderUnreadableRowButtons(context, row, key)
}

const bindUnreadableSaveRow = (context: MainMenuRenderContext, row: UnreadableSaveRow): void => {
  const { onDeleteUnreadableSave } = context.callbacks
  if (typeof onDeleteUnreadableSave === 'function') {
    bindButton(context, row.delete, () => showUnreadableDeleteConfirmation(context, row))
    bindButton(context, row.confirm, () => confirmUnreadableDeletion(context, row, onDeleteUnreadableSave))
  }
  bindButton(context, row.cancel, () => cancelUnreadableDeletion(context, row))
}

type UnreadableSaveRowElements = { readonly root: DomElement; readonly detail: DomElement }

const createUnreadableSaveRowElements = (context: MainMenuRenderContext, save: UnreadableSave): UnreadableSaveRowElements => {
  const { dom } = context
  const root = makeElement({ factory: context.factory, marker: 'menu-unreadable-row', parent: dom.root, tag: 'article' })
  root.setAttribute('data-save-key', save.key)
  const detail = makeElement({ factory: context.factory, marker: 'menu-unreadable-detail', parent: dom.root, tag: 'p' })
  return { detail, root }
}

const createUnreadableSaveRow = (context: MainMenuRenderContext, save: UnreadableSave): UnreadableSaveRow => {
  const { detail, root } = createUnreadableSaveRowElements(context, save)
  const buttons = createUnreadableSaveButtons(context.factory, root)
  root.appendChild(detail)
  context.dom.worldList.unreadableList.appendChild(root)
  const row: UnreadableSaveRow = {
    cancel: buttons.cancel,
    confirm: buttons.confirm,
    delete: buttons.deleteButton,
    detail: textCell(detail),
    root,
    rootHidden: attributeCell(root, 'hidden'),
    save,
  }
  context.runtime.unreadableRows.set(save.key, row)
  bindUnreadableSaveRow(context, row)
  return row
}

const ensureUnreadableRow = (context: MainMenuRenderContext, save: UnreadableSave): UnreadableSaveRow => {
  const existing = context.runtime.unreadableRows.get(save.key)
  if (typeof existing !== 'undefined') {
    existing.save = save
    return existing
  }
  return createUnreadableSaveRow(context, save)
}

const renderUnreadableRow = (context: MainMenuRenderContext, save: UnreadableSave): void => {
  const row = ensureUnreadableRow(context, save)
  writeHidden(row.rootHidden, false)
  writeText(row.detail, `${save.key} · ${save.format} ${String(save.version)} · ${save.reason}`)
  renderUnreadableRowButtons(context, row, `unreadable:${save.key}`)
}

const renderUnreadableSaves = (context: MainMenuRenderContext, saves: ReadonlyArray<UnreadableSave>): void => {
  const keys = new Set(saves.map((save) => save.key))
  clearMissingPendingEntity(context.runtime, keys, 'unreadable')
  for (const save of saves) {
    renderUnreadableRow(context, save)
  }
  hideRemovedUnreadableRows(context.runtime, keys)
}

const renderPanelVisibility = (dom: MainMenuElements, panel: MenuPanel): void => {
  for (const key of ['root', 'load-world', 'new-world'] as const) {
    const visible = panel === key
    const panelRoot = dom.panelRoots[key]
    writeHidden(panelRoot.hidden, !visible)
    if (visible) {
      writeStyle(panelRoot.display, 'grid')
    } else {
      writeStyle(panelRoot.display, 'none')
    }
  }
}

const renderMainMenu = (context: MainMenuRenderContext, model: MainMenuViewModel): void => {
  context.runtime.model = model
  context.runtime.state = stateFromModel(model)
  renderPanelVisibility(context.dom, model.panel)
  renderWorldForm(context, model)
  renderSavedWorlds(context, model.savedWorlds)
  renderUnreadableSaves(context, model.unreadableSaves)
}

const updateMainMenuState = (context: MainMenuRenderContext, nextState: MainMenuState): void => {
  context.runtime.state = nextState
  context.runtime.model = mainMenuViewModel(
    nextState,
    context.runtime.model.savedWorlds,
    context.runtime.model.worldTypes,
    context.runtime.model.unreadableSaves,
  )
  context.callbacks.onStateChange?.(nextState)
  renderMainMenu(context, context.runtime.model)
}

const transitionMainMenuPanel = (
  context: MainMenuRenderContext,
  panel: MenuPanel,
): void => {
  updateMainMenuState(context, openPanel(context.runtime.state, panel))
  focusForPanel(context.dom, panel).focus()
}

const readWorldSeed = (context: MainMenuRenderContext): CreateWorldRequest['seed'] | null => {
  const seed = parseWorldSeed(decodeWorldSeedText(context.dom.form.seedInput.value))
  if (Result.isFailure(seed)) {
    writeAttribute(context.dom.form.seedInvalid, 'true')
    writeHidden(context.dom.form.seedErrorHidden, false)
    return null
  }
  writeAttribute(context.dom.form.seedInvalid)
  writeHidden(context.dom.form.seedErrorHidden, true)
  return seed.success
}

type WorldTypeSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'selected'; readonly value: WorldTypeId }
  | { readonly kind: 'unavailable' }

const selectedWorldTypeForRequest = (model: MainMenuViewModel): WorldTypeSelection => {
  const selected = model.worldTypes.find((option) => typeof option !== 'undefined' && option.value === model.worldType)
  if (typeof selected !== 'undefined') {
    return { kind: 'selected', value: decodeWorldTypeId(selected.value) }
  }
  if (model.worldTypes.length === EMPTY_COUNT) {
    return { kind: 'none' }
  }
  return { kind: 'unavailable' }
}

const buildCreateWorldRequest = (
  context: MainMenuRenderContext,
  seed: CreateWorldRequest['seed'],
  worldType: WorldTypeId | null,
): CreateWorldRequest => {
  const request: CreateWorldRequest = {
    difficulty: context.runtime.state.draft.difficulty,
    mode: context.runtime.state.draft.mode,
    name: worldNameLabel(
      context.runtime.state.draft,
      translateUiMessage(uiLanguageForElement(context.dom.root), 'menu.world-name.default'),
    ),
    seed,
  }
  if (worldType === null) {
    return request
  }
  return { ...request, worldType }
}

const dispatchWorldCreation = (
  context: MainMenuRenderContext,
  onCreateWorld: (request: CreateWorldRequest) => void,
  seed: CreateWorldRequest['seed'],
): void => {
  const selectedWorldType = selectedWorldTypeForRequest(context.runtime.model)
  if (selectedWorldType.kind === 'unavailable') {
    return
  }
  let worldType: WorldTypeId | null = null
  if (selectedWorldType.kind === 'selected') {
    worldType = selectedWorldType.value
  }
  onCreateWorld(buildCreateWorldRequest(context, seed, worldType))
}

const submitWorldCreation = (
  context: MainMenuRenderContext,
  onCreateWorld: (request: CreateWorldRequest) => void,
): void => {
  const seed = readWorldSeed(context)
  if (seed === null) {
    return
  }
  dispatchWorldCreation(context, onCreateWorld, seed)
}

const bindRootActions = (context: MainMenuRenderContext): void => {
  bindButton(context, context.dom.rootButtons['single-player'], () => transitionMainMenuPanel(context, 'load-world'))
  const multiplayer = context.callbacks.onOpenMultiplayer
  if (typeof multiplayer === 'function') {
    bindButton(context, context.dom.rootButtons.multiplayer, multiplayer)
  }
  const settings = context.callbacks.onOpenSettings
  if (typeof settings === 'function') {
    bindButton(context, context.dom.rootButtons.settings, settings)
  }
  const exit = context.callbacks.onExit
  if (typeof exit === 'function') {
    bindButton(context, context.dom.rootButtons.exit, exit)
  }
}

const cycleDifficulty = (context: MainMenuRenderContext): void => {
  const next = NEXT_DIFFICULTY[context.runtime.state.draft.difficulty]
  updateMainMenuState(context, setWorldDifficulty(context.runtime.state, next))
}

const cycleWorldType = (context: MainMenuRenderContext): void => {
  const options = context.runtime.model.worldTypes
  if (options.length === EMPTY_COUNT) {
    return
  }
  const currentIndex = options.findIndex((option) =>
    typeof option !== 'undefined' && option.value === context.runtime.model.worldType,
  )
  const next = options[(currentIndex + NEXT_INDEX) % options.length]
  if (typeof next === 'undefined') {
    return
  }
  updateMainMenuState(context, setWorldType(context.runtime.state, next.value))
}

const bindWorldFormActions = (context: MainMenuRenderContext): void => {
  const { form } = context.dom
  bindButton(context, form.gameModeButton, () => updateMainMenuState(context, cycleWorldMode(context.runtime.state)))
  bindButton(context, form.difficultyButton, () => cycleDifficulty(context))
  bindButton(context, form.worldTypeButton, () => cycleWorldType(context))
  bindButton(context, form.backButton, () => transitionMainMenuPanel(context, 'load-world'))
  const { onCreateWorld } = context.callbacks
  if (typeof onCreateWorld === 'function') {
    bindButton(context, form.createButton, () => submitWorldCreation(context, onCreateWorld))
  }
  bindListener({
    context,
    element: form.worldNameInput,
    listener: () => updateMainMenuState(context, nameWorld(context.runtime.state, decodeWorldNameText(form.worldNameInput.value))),
    type: 'input',
  })
  bindListener({
    context,
    element: form.seedInput,
    listener: () => {
    writeAttribute(form.seedInvalid)
    writeHidden(form.seedErrorHidden, true)
    updateMainMenuState(context, seedWorld(context.runtime.state, decodeWorldSeedText(form.seedInput.value)))
    },
    type: 'input',
  })
}

const bindWorldListActions = (context: MainMenuRenderContext): void => {
  bindButton(context, context.dom.worldList.createWorldButton, () => transitionMainMenuPanel(context, 'new-world'))
  bindButton(context, context.dom.worldList.backButton, () => transitionMainMenuPanel(context, 'root'))
}

const bindMainMenuActions = (context: MainMenuRenderContext): void => {
  bindRootActions(context)
  bindWorldFormActions(context)
  bindWorldListActions(context)
}

const MAIN_MENU_CALLBACK_FIELDS: ReadonlyArray<keyof MainMenuCallbacks> = [
  'onStateChange',
  'onCreateWorld',
  'onLoadWorld',
  'onDeleteWorld',
  'onDeleteUnreadableSave',
  'onExportWorld',
  'onOpenMultiplayer',
  'onOpenSettings',
  'onExit',
]

const invalidMainMenuCallbackField = (callbacks: unknown): string | undefined => {
  if (callbacks === null || typeof callbacks !== 'object') {
    return 'callbacks'
  }
  for (const field of MAIN_MENU_CALLBACK_FIELDS) {
    const callback = Reflect.get(callbacks, field)
    if (typeof callback !== 'undefined' && typeof callback !== 'function') {
      return `callbacks.${field}`
    }
  }
  return
}

const initializeMainMenuCallbacks = (
  callbacks: MainMenuCallbacks,
): Readonly<{
  callbacks: MainMenuCallbacks
  result: Result.Result<void, MainMenuViewInputFailure>
}> => {
  const invalidCallbackField = invalidMainMenuCallbackField(callbacks)
  if (typeof invalidCallbackField === 'undefined') {
    return { callbacks, result: Result.void }
  }
  return {
    callbacks: {},
    result: Result.fail({ _tag: 'InvalidMainMenuViewInput', field: invalidCallbackField }),
  }
}

export const createMainMenuView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: MainMenuCallbacks = {},
): MainMenuView => {
  const { callbacks: effectiveCallbacks, result: initializationResult } = initializeMainMenuCallbacks(callbacks)
  const dom = buildMenuElements({ callbacks: effectiveCallbacks, factory, parent })
  const runtime = createRuntime()
  const context: MainMenuRenderContext = { callbacks: effectiveCallbacks, dom, factory, listeners: [], runtime }
  const render = (model: MainMenuViewModel): Result.Result<void, MainMenuViewInputFailure> => {
    if (Result.isFailure(initializationResult)) {
      return initializationResult
    }
    if (model === null || typeof model !== 'object') {
      return Result.fail({ _tag: 'InvalidMainMenuViewInput', field: 'model' })
    }
    if (!Array.isArray(model.savedWorlds)) {
      return Result.fail({ _tag: 'InvalidMainMenuViewInput', field: 'savedWorlds' })
    }
    if (model.savedWorlds.findIndex((world) =>
      world === null || typeof world === 'undefined' || typeof world.name !== 'string',
    ) !== NO_SAVED_WORLD_INDEX) {
      return Result.fail({ _tag: 'InvalidMainMenuViewInput', field: 'savedWorlds.name' })
    }
    renderMainMenu(context, model)
    return Result.void
  }
  bindMainMenuActions(context)
  return {
    destroy: (): void => {
      while (context.listeners.length > EMPTY_COUNT) {
        context.listeners.pop()?.()
      }
      writeHidden(dom.rootHidden, true)
      dom.root.style.setProperty('display', 'none')
    },
    initializationResult,
    render,
    root: dom.root,
  }
}
