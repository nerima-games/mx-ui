import {
  CHEST_STORAGE_COLUMNS,
  CHEST_STORAGE_SLOT_COUNT,
  type ChestStorageCursorView,
  type ChestStorageSlotTarget,
  type ChestStorageSlotView,
  type ChestStorageViewModel,
} from '../domain/chest-storage-view-model'
import {
  INVENTORY_MAIN_COLUMNS,
  INVENTORY_MAIN_SLOT_COUNT,
} from '../domain/inventory-view-model'
import { HOTBAR_SLOT_COUNT } from '../domain/hud-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import { textCell, writeText } from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'
import {
  createSlotElement,
  setSlotButtonView,
  setSlotHidden,
  updateSlotElement,
  type SlotElement,
} from './slot-element'

export type ChestStorageInteractionView = {
  readonly focusedSlot: ChestStorageSlotTarget
  readonly status: string
}

export type ChestStorageView = {
  readonly root: DomElement
  readonly render: (model: ChestStorageViewModel, interaction?: ChestStorageInteractionView) => void
}

type InteractiveSlotElement = {
  readonly slot: SlotElement
  readonly target: ChestStorageSlotTarget
}

const sameTarget = (left: ChestStorageSlotTarget, right: ChestStorageSlotTarget): boolean =>
  left.region === right.region && left.slot === right.slot

const ariaLabel = (view: ChestStorageSlotView): string => {
  const owner = view.target.region === 'chest' ? 'Chest' : 'Player inventory'
  return view.empty
    ? `${owner} slot ${String(view.target.slot + 1)}, empty`
    : `${owner} slot ${String(view.target.slot + 1)}, ${view.itemId ?? 'empty'}, ${view.countLabel ?? '1'}`
}

const createGrid = (
  factory: DomElementFactory,
  parent: DomElement,
  id: string,
  columns: number,
  targets: ReadonlyArray<ChestStorageSlotTarget>,
): ReadonlyArray<InteractiveSlotElement> => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', id)
  grid.setAttribute('data-region', id)
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', `repeat(${String(columns)}, 1fr)`)
  parent.appendChild(grid)

  return targets.map((target) => {
    const slot = createSlotElement(factory, target.slot)
    slot.root.setAttribute('data-interaction-target', 'chest-storage-slot')
    slot.root.setAttribute('data-interaction-region', target.region)
    slot.root.setAttribute('data-interaction-slot', String(target.slot))
    grid.appendChild(slot.root)
    return { slot, target }
  })
}

const updateGrid = (
  elements: ReadonlyArray<InteractiveSlotElement>,
  views: ReadonlyArray<ChestStorageSlotView>,
  focused: ChestStorageSlotTarget,
  showFocus: boolean,
): void => {
  for (const [index, element] of elements.entries()) {
    const view = views[index]
    if (view === undefined) {
      setSlotHidden(element.slot, true)
      setSlotButtonView(element.slot, undefined)
      continue
    }
    setSlotHidden(element.slot, false)
    updateSlotElement(element.slot, view, undefined)
    const hasFocus = sameTarget(element.target, focused)
    setSlotButtonView(element.slot, {
      label: ariaLabel(view),
      disabled: false,
      tabStop: hasFocus,
      focused: showFocus && hasFocus,
    })
  }
}

const updateCursor = (element: SlotElement, cursor: ChestStorageCursorView | undefined): void => {
  element.root.setAttribute('data-cursor-state', cursor === undefined ? 'empty' : 'stack')
  updateSlotElement(
    element,
    cursor ?? {
      index: 0,
      itemId: undefined,
      countLabel: undefined,
      durabilityPercent: undefined,
      selected: false,
      empty: true,
    },
    undefined,
  )
}

/** Creates a listener-free chest projection. The host owns click and close dispatch. */
export const createChestStorageView = (
  factory: DomElementFactory,
  parent: DomElement,
): ChestStorageView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'chest-storage')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const close = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'chest-storage-close')
  close.setAttribute('data-interaction-target', 'chest-storage-close')
  close.setAttribute('aria-label', 'Close chest')
  close.textContent = 'Close'
  root.appendChild(close)

  const chestTargets = Array.from({ length: CHEST_STORAGE_SLOT_COUNT }, (_, slot) => ({
    region: 'chest' as const,
    slot,
  }))
  const playerMainTargets = Array.from({ length: INVENTORY_MAIN_SLOT_COUNT }, (_, offset) => ({
    region: 'player' as const,
    slot: offset + HOTBAR_SLOT_COUNT,
  }))
  const playerHotbarTargets = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => ({
    region: 'player' as const,
    slot,
  }))
  const chest = createGrid(factory, root, 'chest', CHEST_STORAGE_COLUMNS, chestTargets)
  const playerMain = createGrid(factory, root, 'player-main', INVENTORY_MAIN_COLUMNS, playerMainTargets)
  const playerHotbar = createGrid(factory, root, 'player-hotbar', INVENTORY_MAIN_COLUMNS, playerHotbarTargets)

  const cursorRoot = factory.createElement('div')
  cursorRoot.setAttribute('data-mx-ui', 'chest-storage-cursor')
  cursorRoot.setAttribute('role', 'status')
  cursorRoot.setAttribute('aria-label', 'Carried item')
  root.appendChild(cursorRoot)
  const cursor = createSlotElement(factory, 0)
  cursorRoot.appendChild(cursor.root)

  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'chest-storage-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  root.appendChild(status)
  const statusText = textCell(status)

  return {
    root,
    render: (model, interaction): void => {
      const focused = interaction?.focusedSlot ?? { region: 'chest', slot: 0 }
      updateGrid(chest, model.chest, focused, interaction !== undefined)
      updateGrid(playerMain, model.playerMain, focused, interaction !== undefined)
      updateGrid(playerHotbar, model.playerHotbar, focused, interaction !== undefined)
      updateCursor(cursor, model.cursor)
      writeText(statusText, interaction?.status ?? '')
    },
  }
}
