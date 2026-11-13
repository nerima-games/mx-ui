import {
  CHEST_STORAGE_COLUMNS,
  CHEST_STORAGE_SLOT_COUNT,
  type ChestStorageCursorView,
  type ChestStorageSlotTarget,
  type ChestStorageSlotView,
  type ChestStorageViewModel,
} from '../domain/chest-storage-view-model.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import { HOTBAR_SLOT_COUNT, type SlotView } from '../domain/hud-view-model.js'
import {
  INVENTORY_MAIN_COLUMNS,
  INVENTORY_MAIN_SLOT_COUNT,
} from '../domain/inventory-view-model.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  setSlotFocusTarget,
  setSlotHidden,
  updateSlotElement,
} from './slot-element.js'
import { type TextCell, textCell, writeText } from './dom-write.js'
import { type UiLanguage, type UiMessageKey, type UiMessageValues } from '../domain/ui-language.js'
import { setLocalizedAttribute, setLocalizedText, uiLanguageForElement, writeLocalizedAttribute } from './ui-localization.js'
import { Result } from 'effect'
import { itemDisplayNameValue } from './item-display-name.js'

export type ChestStorageInteractionView = {
  readonly focusedSlot: ChestStorageSlotTarget
  readonly status: string
}

export type ChestStorageViewActions = {
  readonly onActivate?: (target: ChestStorageSlotTarget) => void
  readonly onClose?: () => void
  readonly onFocusChange?: (target: ChestStorageSlotTarget) => void
}

export type ChestStorageView = {
  readonly root: DomElement
  readonly render: (
    model: ChestStorageViewModel | null,
    interaction?: ChestStorageInteractionView | null,
  ) => Result.Result<void, ChestStorageViewInputFailure>
}

type ChestStorageViewInputFailure = Readonly<{
  readonly _tag: 'InvalidChestStorageViewInput'
  readonly field: string
}>

type InteractiveSlotElement = {
  readonly slot: SlotElement
  readonly target: ChestStorageSlotTarget
}

/** Cursor slot occupies index 0 of its own single-slot group — there is only one. */
const CURSOR_SLOT_INDEX = 0
const ZERO_INDEX = 0
/** Players see slots numbered from 1, not from 0. */
const SLOT_DISPLAY_OFFSET = 1
const DEFAULT_FOCUSED_TARGET: ChestStorageSlotTarget = { region: 'chest', slot: 0 }
const CHEST_STORAGE_FOCUS_GROUP = 'chest-storage-slots'
const PLAYER_INVENTORY_SLOT_COUNT = HOTBAR_SLOT_COUNT + INVENTORY_MAIN_SLOT_COUNT

const isValidSlotIndex = (slot: unknown): slot is number =>
  typeof slot === 'number' && Number.isSafeInteger(slot) && slot >= ZERO_INDEX

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const isValidItemDisplayNameFailure = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const tag = Reflect.get(input, '_tag')
  return typeof tag === 'string' && [
    'ItemDisplayNameUnavailable',
    'InvalidItemId',
    'MissingItemDisplayNameResolver',
    'InvalidItemDisplayName',
  ].includes(tag)
}

const isValidItemDisplayNameResult = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  if (Reflect.get(input, '_tag') === 'Success') {
    return typeof Reflect.get(input, 'success') === 'string'
  }
  return Reflect.get(input, '_tag') === 'Failure' &&
    isValidItemDisplayNameFailure(Reflect.get(input, 'failure'))
}

const isValidItemDisplayNameView = (input: unknown): boolean =>
  isRecord(input) &&
  (Reflect.get(input, 'language') === 'en' || Reflect.get(input, 'language') === 'ja') &&
  isValidItemDisplayNameResult(Reflect.get(input, 'result'))

const slotBelongsToRegion = (region: unknown, slot: number): boolean => {
  if (region === 'chest') {
    return slot < CHEST_STORAGE_SLOT_COUNT
  }
  if (region === 'player') {
    return slot < PLAYER_INVENTORY_SLOT_COUNT
  }
  return false
}

const isChestStorageSlotTarget = (input: unknown): input is ChestStorageSlotTarget => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const region = Reflect.get(input, 'region')
  const slot = Reflect.get(input, 'slot')
  if (!isValidSlotIndex(slot)) {
    return false
  }
  return slotBelongsToRegion(region, slot)
}

const focusIndexForTarget = (target: ChestStorageSlotTarget, chestSlotCount: number): number => {
  const playerMainOffset = Math.ceil(chestSlotCount / CHEST_STORAGE_COLUMNS) * CHEST_STORAGE_COLUMNS
  if (target.region === 'chest') {
    return target.slot
  }
  if (target.slot < HOTBAR_SLOT_COUNT) {
    return playerMainOffset + INVENTORY_MAIN_SLOT_COUNT + target.slot
  }
  return playerMainOffset + target.slot - HOTBAR_SLOT_COUNT
}

const sameTarget = (left: ChestStorageSlotTarget, right: ChestStorageSlotTarget): boolean =>
  left.region === right.region && left.slot === right.slot

const ownerMessageKey = (region: ChestStorageSlotTarget['region']): UiMessageKey => {
  if (region === 'chest') {
    return 'container.chest'
  }
  return 'container.player-inventory'
}

const ariaLabel = (
  view: ChestStorageSlotView,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values: UiMessageValues }> => {
  const displaySlot = String(view.target.slot + SLOT_DISPLAY_OFFSET)
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts) guarantees the two always agree.
  // Checking the field this function actually reads lets TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a check on `empty` alone could never let the type system prove impossible.
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo stack of exactly one (`slotCountLabel`, hud-view-model.ts).
  if (typeof view.itemId === 'undefined') {
    return {
      key: 'container.slot-empty',
      values: { owner: { key: ownerMessageKey(view.target.region) }, slot: displaySlot },
    }
  }
  return {
    key: 'container.slot-item',
    values: {
      count: view.countLabel ?? '1',
      item: itemDisplayNameValue(view, language),
      owner: { key: ownerMessageKey(view.target.region) },
      slot: displaySlot,
    },
  }
}

type GridSpec = {
  readonly id: string
  readonly columns: number
  readonly targets: ReadonlyArray<ChestStorageSlotTarget>
}

type GridContext = Readonly<{
  factory: DomElementFactory
  parent: DomElement
  spec: GridSpec
  actions: ChestStorageViewActions | undefined
}>

const setInteractiveSlotAttributes = (
  slot: SlotElement,
  target: ChestStorageSlotTarget,
): void => {
  slot.root.setAttribute('data-interaction-target', 'chest-storage-slot')
  slot.root.setAttribute('data-interaction-region', target.region)
  slot.root.setAttribute('data-interaction-slot', String(target.slot))
}

const wireInteractiveSlot = (
  slot: SlotElement,
  target: ChestStorageSlotTarget,
  actions: ChestStorageViewActions | undefined,
): void => {
  if (typeof actions?.onActivate === 'function') {
    slot.root.addEventListener('click', () => actions.onActivate?.(target))
  }
  if (typeof actions?.onFocusChange === 'function') {
    slot.root.addEventListener('focus', () => actions.onFocusChange?.(target))
  }
}

const createInteractiveSlot = (context: Readonly<{
  factory: DomElementFactory
  grid: DomElement
  spec: GridSpec
  actions: ChestStorageViewActions | undefined
  target: ChestStorageSlotTarget
  index: number
}>): InteractiveSlotElement => {
  const { actions, factory, grid, index, spec, target } = context
  const slot = createSlotElement(factory, target.slot)
  setInteractiveSlotAttributes(slot, target)
  setSlotFocusTarget(slot, { columns: spec.columns, group: CHEST_STORAGE_FOCUS_GROUP, index })
  wireInteractiveSlot(slot, target, actions)
  grid.appendChild(slot.root)
  return { slot, target }
}

const createGrid = (context: GridContext): ReadonlyArray<InteractiveSlotElement> => {
  const { actions, factory, parent, spec } = context
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', spec.id)
  grid.setAttribute('data-region', spec.id)
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', `repeat(${String(spec.columns)}, minmax(0, 1fr))`)
  parent.appendChild(grid)

  return spec.targets.map((target, index) =>
    createInteractiveSlot({ actions, factory, grid, index, spec, target }),
  )
}

type GridFocus = {
  readonly target: ChestStorageSlotTarget
  readonly active: boolean
  readonly chestSlotCount: number
}

const updateGrid = (
  elements: ReadonlyArray<InteractiveSlotElement>,
  views: ReadonlyArray<ChestStorageSlotView>,
  focus: GridFocus,
): void => {
  for (const [index, element] of elements.entries()) {
    setSlotFocusTarget(element.slot, {
      columns: CHEST_STORAGE_COLUMNS,
      group: CHEST_STORAGE_FOCUS_GROUP,
      index: focusIndexForTarget(element.target, focus.chestSlotCount),
    })
    const view = views[index]
    if (typeof view === 'undefined') {
      setSlotHidden(element.slot, true)
      setSlotButtonView(element.slot)
    } else {
      setSlotHidden(element.slot, false)
      updateSlotElement(element.slot, view)
      const hasFocus = sameTarget(element.target, focus.target)
      setSlotButtonView(element.slot, {
        disabled: false,
        focused: focus.active && hasFocus,
        label: '',
        localizedLabel: ariaLabel(view, uiLanguageForElement(element.slot.root)),
        tabStop: hasFocus,
      })
    }
  }
}

/** A field the caller never supplied — read rather than spelled, so absence never writes the word. */
type AbsentSlotFields = {
  readonly itemId?: string
  readonly countLabel?: string
  readonly durabilityPercent?: number
}
const ABSENT_SLOT_FIELDS: AbsentSlotFields = {}

/** The cursor's rest state: nothing carried, every optional field genuinely absent. */
const EMPTY_CURSOR_VIEW: SlotView = {
  countLabel: ABSENT_SLOT_FIELDS.countLabel,
  durabilityPercent: ABSENT_SLOT_FIELDS.durabilityPercent,
  empty: true,
  index: CURSOR_SLOT_INDEX,
  itemId: ABSENT_SLOT_FIELDS.itemId,
  selected: false,
}

const cursorStateValue = (cursor: ChestStorageCursorView | undefined): string => {
  if (typeof cursor === 'undefined') {
    return 'empty'
  }
  return 'stack'
}

const updateCursor = (element: SlotElement, cursor: ChestStorageCursorView | undefined): void => {
  element.root.setAttribute('data-cursor-state', cursorStateValue(cursor))
  updateSlotElement(element, cursor ?? EMPTY_CURSOR_VIEW)
  if (typeof cursor === 'undefined' || typeof cursor.itemId === 'undefined') {
    writeLocalizedAttribute(element.ariaLabel, 'inventory.carried-empty')
    return
  }
  writeLocalizedAttribute(element.ariaLabel, 'inventory.carried-item', {
    count: cursor.countLabel ?? '1',
    item: itemDisplayNameValue(cursor, uiLanguageForElement(element.root)),
  })
}

const invalidGridSlotItemDisplayNameField = (
  region: string,
  slot: Record<string, unknown>,
): string | undefined => {
  const itemDisplayName = Reflect.get(slot, 'itemDisplayName')
  if (typeof itemDisplayName !== 'undefined' && !isValidItemDisplayNameView(itemDisplayName)) {
    return `${region}.itemDisplayName`
  }
  return
}

const invalidGridSlotCountLabelField = (region: string, slot: Record<string, unknown>): string | undefined => {
  const countLabel = Reflect.get(slot, 'countLabel')
  if (typeof countLabel !== 'undefined' && typeof countLabel !== 'string') {
    return `${region}.countLabel`
  }
  return
}

const invalidGridSlotValueField = (region: string, slot: unknown): string | undefined => {
  if (slot === null) {
    return `${region}.slot`
  }
  if (typeof slot === 'undefined') {
    return
  }
  if (!isRecord(slot)) {
    return `${region}.slot`
  }
  return invalidGridSlotItemDisplayNameField(region, slot) ?? invalidGridSlotCountLabelField(region, slot)
}

const invalidGridRegionField = (region: string, slots: unknown): string | undefined => {
  if (!Array.isArray(slots)) {
    return region
  }
  for (const slot of slots) {
    const field = invalidGridSlotValueField(region, slot)
    if (typeof field !== 'undefined') {
      return field
    }
  }
  return
}

const invalidGridSlotField = (model: Record<string, unknown>): string | undefined => {
  const regions = [
    ['chest', Reflect.get(model, 'chest')],
    ['playerMain', Reflect.get(model, 'playerMain')],
    ['playerHotbar', Reflect.get(model, 'playerHotbar')],
  ] as const
  for (const [region, slots] of regions) {
    const field = invalidGridRegionField(region, slots)
    if (typeof field !== 'undefined') {
      return field
    }
  }
  return
}

const invalidChestStorageCursorStackField = (cursor: Record<string, unknown>): string | undefined => {
  const stack = Reflect.get(cursor, 'stack')
  if (!isRecord(stack)) {
    return 'cursor'
  }
  if (typeof Reflect.get(stack, 'item') !== 'string' || typeof Reflect.get(stack, 'count') !== 'number') {
    return 'cursor.stack'
  }
  const stackDurability = Reflect.get(stack, 'durability')
  if (typeof stackDurability !== 'undefined' && typeof stackDurability !== 'number') {
    return 'cursor.stack.durability'
  }
  return
}

const invalidChestStorageCursorDisplayField = (cursor: Record<string, unknown>): string | undefined => {
  const countLabel = Reflect.get(cursor, 'countLabel')
  if (typeof countLabel !== 'undefined' && typeof countLabel !== 'string') {
    return 'cursor.countLabel'
  }
  const itemDisplayName = Reflect.get(cursor, 'itemDisplayName')
  if (typeof itemDisplayName !== 'undefined' && !isValidItemDisplayNameView(itemDisplayName)) {
    return 'cursor.itemDisplayName'
  }
  const itemId = Reflect.get(cursor, 'itemId')
  if (typeof itemId !== 'undefined' && typeof itemId !== 'string') {
    return 'cursor.itemId'
  }
  return
}

const invalidChestStorageCursorDurabilityField = (cursor: Record<string, unknown>): string | undefined => {
  const durabilityPercent = Reflect.get(cursor, 'durabilityPercent')
  if (typeof durabilityPercent !== 'undefined' && (typeof durabilityPercent !== 'number' || !Number.isFinite(durabilityPercent))) {
    return 'cursor.durabilityPercent'
  }
  return
}

const invalidChestStorageCursorStateField = (cursor: Record<string, unknown>): string | undefined => {
  if (typeof Reflect.get(cursor, 'empty') !== 'boolean') {
    return 'cursor.empty'
  }
  if (typeof Reflect.get(cursor, 'index') !== 'number') {
    return 'cursor.index'
  }
  if (typeof Reflect.get(cursor, 'selected') !== 'boolean') {
    return 'cursor.selected'
  }
  return
}

const invalidChestStorageCursorField = (model: Record<string, unknown>): string | undefined => {
  const cursor = Reflect.get(model, 'cursor')
  if (typeof cursor === 'undefined') {
    return
  }
  if (!isRecord(cursor)) {
    return 'cursor'
  }
  return (
    invalidChestStorageCursorStackField(cursor) ??
    invalidChestStorageCursorDisplayField(cursor) ??
    invalidChestStorageCursorDurabilityField(cursor) ??
    invalidChestStorageCursorStateField(cursor)
  )
}

const invalidChestStorageInteractionRecordField = (
  interaction: Record<string, unknown>,
): string | undefined => {
  const focusedSlot = Reflect.get(interaction, 'focusedSlot')
  if (typeof focusedSlot !== 'undefined' && !isChestStorageSlotTarget(focusedSlot)) {
    return 'interaction.focusedSlot'
  }
  const status = Reflect.get(interaction, 'status')
  if (typeof status !== 'undefined' && typeof status !== 'string') {
    return 'interaction.status'
  }
  return
}

const invalidChestStorageInteractionField = (
  interaction: unknown,
): string | undefined => {
  if (typeof interaction === 'undefined') {
    return
  }
  if (!isRecord(interaction)) {
    return 'interaction'
  }
  return invalidChestStorageInteractionRecordField(interaction)
}

const invalidChestStorageViewInputField = (
  model: unknown,
  interaction: unknown,
): string | undefined => {
  if (!isRecord(model)) {
    return 'model'
  }
  const invalidSlotField = invalidGridSlotField(model)
  if (typeof invalidSlotField !== 'undefined') {
    return invalidSlotField
  }
  const invalidCursorField = invalidChestStorageCursorField(model)
  if (typeof invalidCursorField !== 'undefined') {
    return invalidCursorField
  }
  return invalidChestStorageInteractionField(interaction)
}

const createChestStorageRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'chest-storage')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const configureChestStorageCloseButton = (close: DomElement): void => {
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'chest-storage-close')
  close.setAttribute('data-interaction-target', 'chest-storage-close')
  close.setAttribute('data-focus-group', 'chest-storage-actions')
  close.setAttribute('data-focus-index', '0')
  close.setAttribute('data-focus-columns', '1')
  setLocalizedAttribute(close, 'aria-label', 'container.close-chest')
  setLocalizedText(close, 'brewing.close')
}

const wireChestStorageCloseButton = (
  close: DomInteractiveElement,
  actions: ChestStorageViewActions | undefined,
): void => {
  if (typeof actions?.onClose === 'function') {
    close.addEventListener('click', () => actions.onClose?.())
  }
}

const createChestStorageCloseButtonElement = (
  factory: DomElementFactory,
  actions: ChestStorageViewActions | undefined,
): DomElement => {
  const close: DomInteractiveElement = factory.createElement('button')
  configureChestStorageCloseButton(close)
  wireChestStorageCloseButton(close, actions)
  return close
}

const createChestStorageCloseButton = (
  factory: DomElementFactory,
  root: DomElement,
  actions: ChestStorageViewActions | undefined,
): void => {
  root.appendChild(createChestStorageCloseButtonElement(factory, actions))
}

const chestTargets = (): ReadonlyArray<ChestStorageSlotTarget> =>
  Array.from({ length: CHEST_STORAGE_SLOT_COUNT }, (_element, slot) => ({
    region: 'chest' as const,
    slot,
  }))

const playerMainTargets = (): ReadonlyArray<ChestStorageSlotTarget> =>
  Array.from({ length: INVENTORY_MAIN_SLOT_COUNT }, (_element, offset) => ({
    region: 'player' as const,
    slot: offset + HOTBAR_SLOT_COUNT,
  }))

const playerHotbarTargets = (): ReadonlyArray<ChestStorageSlotTarget> =>
  Array.from({ length: HOTBAR_SLOT_COUNT }, (_element, slot) => ({
    region: 'player' as const,
    slot,
  }))

type ChestStorageGrids = {
  readonly chest: ReadonlyArray<InteractiveSlotElement>
  readonly playerMain: ReadonlyArray<InteractiveSlotElement>
  readonly playerHotbar: ReadonlyArray<InteractiveSlotElement>
}

const createChestStorageGrids = (
  factory: DomElementFactory,
  root: DomElement,
  actions: ChestStorageViewActions | undefined,
): ChestStorageGrids => {
  const chest = createGrid({
    actions,
    factory,
    parent: root,
    spec: { columns: CHEST_STORAGE_COLUMNS, id: 'chest', targets: chestTargets() },
  })
  const playerMain = createGrid({
    actions,
    factory,
    parent: root,
    spec: { columns: INVENTORY_MAIN_COLUMNS, id: 'player-main', targets: playerMainTargets() },
  })
  const playerHotbar = createGrid({
    actions,
    factory,
    parent: root,
    spec: { columns: INVENTORY_MAIN_COLUMNS, id: 'player-hotbar', targets: playerHotbarTargets() },
  })
  return { chest, playerHotbar, playerMain }
}

const createChestStorageCursor = (factory: DomElementFactory, root: DomElement): SlotElement => {
  const cursorRoot = factory.createElement('div')
  cursorRoot.setAttribute('data-mx-ui', 'chest-storage-cursor')
  cursorRoot.setAttribute('role', 'status')
  setLocalizedAttribute(cursorRoot, 'aria-label', 'container.carried-item')
  root.appendChild(cursorRoot)
  const cursor = createSlotElement(factory, CURSOR_SLOT_INDEX)
  cursorRoot.appendChild(cursor.root)
  return cursor
}

const createChestStorageStatus = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'chest-storage-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  root.appendChild(status)
  return textCell(status)
}

type ChestStorageViewElements = Readonly<{
  cursor: SlotElement
  grids: ChestStorageGrids
  statusText: TextCell
}>

const projectChestStorageView = (
  elements: ChestStorageViewElements,
  model: ChestStorageViewModel,
  interaction: ChestStorageInteractionView | null | undefined,
): void => {
  const focused = interaction?.focusedSlot ?? DEFAULT_FOCUSED_TARGET
  const active = typeof interaction !== 'undefined'
  const chestSlotCount = model.chest.length
  updateGrid(elements.grids.chest, model.chest, { active, chestSlotCount, target: focused })
  updateGrid(elements.grids.playerMain, model.playerMain, { active, chestSlotCount, target: focused })
  updateGrid(elements.grids.playerHotbar, model.playerHotbar, { active, chestSlotCount, target: focused })
  updateCursor(elements.cursor, model.cursor)
  writeText(elements.statusText, interaction?.status ?? '')
}

const renderChestStorageView = (
  elements: ChestStorageViewElements,
  model: ChestStorageViewModel | null,
  interaction: ChestStorageInteractionView | null | undefined,
): Result.Result<void, ChestStorageViewInputFailure> => {
  if (model === null) {
    return Result.fail({ _tag: 'InvalidChestStorageViewInput', field: 'model' })
  }
  const invalidField = invalidChestStorageViewInputField(model, interaction)
  if (typeof invalidField !== 'undefined') {
    return Result.fail({ _tag: 'InvalidChestStorageViewInput', field: invalidField })
  }
  projectChestStorageView(elements, model, interaction)
  return Result.void
}

/** Creates a listener-free chest projection. The host owns click and close dispatch. */
export const createChestStorageView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: ChestStorageViewActions,
): ChestStorageView => {
  const root = createChestStorageRoot(factory, parent)
  createChestStorageCloseButton(factory, root, actions)

  const grids = createChestStorageGrids(factory, root, actions)
  const cursor = createChestStorageCursor(factory, root)
  const statusText = createChestStorageStatus(factory, root)

  return {
    render: (model, interaction) => renderChestStorageView({ cursor, grids, statusText }, model, interaction),
    root,
  }
}
