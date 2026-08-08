import {
  CHEST_STORAGE_COLUMNS,
  CHEST_STORAGE_SLOT_COUNT,
  type ChestStorageCursorView,
  type ChestStorageSlotTarget,
  type ChestStorageSlotView,
  type ChestStorageViewModel,
} from '../domain/chest-storage-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import { HOTBAR_SLOT_COUNT, type SlotView } from '../domain/hud-view-model'
import {
  INVENTORY_MAIN_COLUMNS,
  INVENTORY_MAIN_SLOT_COUNT,
} from '../domain/inventory-view-model'
import { PALETTE_VAR, declarePalette } from './palette-css'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  setSlotHidden,
  updateSlotElement,
} from './slot-element'
import { type TextCell, textCell, writeText } from './dom-write'

export type ChestStorageInteractionView = {
  readonly focusedSlot: ChestStorageSlotTarget
  readonly status: string
}

export type ChestStorageView = {
  readonly root: DomElement
  readonly render: (
    model: ChestStorageViewModel,
    interaction?: ChestStorageInteractionView,
  ) => void
}

type InteractiveSlotElement = {
  readonly slot: SlotElement
  readonly target: ChestStorageSlotTarget
}

/** Cursor slot occupies index 0 of its own single-slot group — there is only one. */
const CURSOR_SLOT_INDEX = 0
/** Players see slots numbered from 1, not from 0. */
const SLOT_DISPLAY_OFFSET = 1
const DEFAULT_FOCUSED_TARGET: ChestStorageSlotTarget = { region: 'chest', slot: 0 }

const sameTarget = (left: ChestStorageSlotTarget, right: ChestStorageSlotTarget): boolean =>
  left.region === right.region && left.slot === right.slot

const ownerLabel = (region: ChestStorageSlotTarget['region']): string => {
  if (region === 'chest') {
    return 'Chest'
  }
  return 'Player inventory'
}

const ariaLabel = (view: ChestStorageSlotView): string => {
  const owner = ownerLabel(view.target.region)
  const displaySlot = String(view.target.slot + SLOT_DISPLAY_OFFSET)
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts) guarantees the two always agree.
  // Checking the field this function actually reads lets TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a check on `empty` alone could never let the type system prove impossible.
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo stack of exactly one (`slotCountLabel`, hud-view-model.ts).
  if (typeof view.itemId === 'undefined') {
    return `${owner} slot ${displaySlot}, empty`
  }
  return `${owner} slot ${displaySlot}, ${view.itemId}, ${view.countLabel ?? '1'}`
}

type GridSpec = {
  readonly id: string
  readonly columns: number
  readonly targets: ReadonlyArray<ChestStorageSlotTarget>
}

const createGrid = (
  factory: DomElementFactory,
  parent: DomElement,
  spec: GridSpec,
): ReadonlyArray<InteractiveSlotElement> => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', spec.id)
  grid.setAttribute('data-region', spec.id)
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', `repeat(${String(spec.columns)}, 1fr)`)
  parent.appendChild(grid)

  return spec.targets.map((target) => {
    const slot = createSlotElement(factory, target.slot)
    slot.root.setAttribute('data-interaction-target', 'chest-storage-slot')
    slot.root.setAttribute('data-interaction-region', target.region)
    slot.root.setAttribute('data-interaction-slot', String(target.slot))
    grid.appendChild(slot.root)
    return { slot, target }
  })
}

type GridFocus = {
  readonly target: ChestStorageSlotTarget
  readonly active: boolean
}

const updateGrid = (
  elements: ReadonlyArray<InteractiveSlotElement>,
  views: ReadonlyArray<ChestStorageSlotView>,
  focus: GridFocus,
): void => {
  for (const [index, element] of elements.entries()) {
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
        label: ariaLabel(view),
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

const createChestStorageCloseButton = (factory: DomElementFactory, root: DomElement): void => {
  const close = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'chest-storage-close')
  close.setAttribute('data-interaction-target', 'chest-storage-close')
  close.setAttribute('aria-label', 'Close chest')
  close.textContent = 'Close'
  root.appendChild(close)
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
): ChestStorageGrids => {
  const chest = createGrid(factory, root, {
    columns: CHEST_STORAGE_COLUMNS,
    id: 'chest',
    targets: chestTargets(),
  })
  const playerMain = createGrid(factory, root, {
    columns: INVENTORY_MAIN_COLUMNS,
    id: 'player-main',
    targets: playerMainTargets(),
  })
  const playerHotbar = createGrid(factory, root, {
    columns: INVENTORY_MAIN_COLUMNS,
    id: 'player-hotbar',
    targets: playerHotbarTargets(),
  })
  return { chest, playerHotbar, playerMain }
}

const createChestStorageCursor = (factory: DomElementFactory, root: DomElement): SlotElement => {
  const cursorRoot = factory.createElement('div')
  cursorRoot.setAttribute('data-mx-ui', 'chest-storage-cursor')
  cursorRoot.setAttribute('role', 'status')
  cursorRoot.setAttribute('aria-label', 'Carried item')
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

/** Creates a listener-free chest projection. The host owns click and close dispatch. */
export const createChestStorageView = (
  factory: DomElementFactory,
  parent: DomElement,
): ChestStorageView => {
  const root = createChestStorageRoot(factory, parent)
  createChestStorageCloseButton(factory, root)

  const grids = createChestStorageGrids(factory, root)
  const cursor = createChestStorageCursor(factory, root)
  const statusText = createChestStorageStatus(factory, root)

  return {
    render: (model, interaction): void => {
      const focused = interaction?.focusedSlot ?? DEFAULT_FOCUSED_TARGET
      const active = typeof interaction !== 'undefined'
      updateGrid(grids.chest, model.chest, { active, target: focused })
      updateGrid(grids.playerMain, model.playerMain, { active, target: focused })
      updateGrid(grids.playerHotbar, model.playerHotbar, { active, target: focused })
      updateCursor(cursor, model.cursor)
      writeText(statusText, interaction?.status ?? '')
    },
    root,
  }
}
