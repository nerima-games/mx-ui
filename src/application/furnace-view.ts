import {
  type AttributeCell,
  type PercentCell,
  type TextCell,
  attributeCell,
  percentCell,
  textCell,
  writeAttribute,
  writePercent,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  FURNACE_SLOT_IDS,
  type FurnaceSlotId,
  type FurnaceSlotView,
  type FurnaceViewModel,
} from '../domain/furnace-view-model.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  updateSlotElement,
} from './slot-element.js'

export type FurnaceInteractionView = {
  readonly focusedSlot: FurnaceSlotId
  readonly status: string
}

export type FurnaceView = {
  readonly root: DomElement
  readonly render: (model: FurnaceViewModel, interaction?: FurnaceInteractionView) => void
}

type ProgressElement = {
  readonly now: AttributeCell
  readonly valueText: AttributeCell
  readonly width: PercentCell
}

const SLOT_LABEL: Readonly<Record<FurnaceSlotId, string>> = {
  fuel: 'Furnace fuel',
  input: 'Furnace input',
  output: 'Furnace output',
}

const slotAriaLabel = (slot: FurnaceSlotView): string => {
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts)
  // Guarantees the two always agree. Checking the field this function actually reads lets
  // TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a
  // Check on `empty` alone could never let the type system prove impossible (same call as
  // `anvil-view.ts`'s `slotAriaLabel`).
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo
  // Stack of exactly one.
  if (typeof slot.itemId === 'undefined') {
    return `${SLOT_LABEL[slot.id]}, empty`
  }
  return `${SLOT_LABEL[slot.id]}, ${slot.itemId}, ${slot.countLabel ?? '1'}`
}

const progressLabel = (kind: 'cook' | 'burn'): string => {
  if (kind === 'cook') {
    return 'Cooking progress'
  }
  return 'Fuel remaining'
}

const createProgressTrack = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: 'cook' | 'burn',
): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', `furnace-${kind}-progress`)
  root.setAttribute('role', 'progressbar')
  root.setAttribute('aria-label', progressLabel(kind))
  root.setAttribute('aria-valuemin', '0')
  root.setAttribute('aria-valuemax', '100')
  root.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  parent.appendChild(root)
  return root
}

const createProgressFillElement = (
  factory: DomElementFactory,
  root: DomElement,
  kind: 'cook' | 'burn',
): DomElement => {
  const fill = factory.createElement('div')
  fill.setAttribute('data-mx-ui', `furnace-${kind}-progress-fill`)
  fill.style.setProperty('background-color', PALETTE_VAR.xpFill)
  root.appendChild(fill)
  return fill
}

const createProgress = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: 'cook' | 'burn',
): ProgressElement => {
  const root = createProgressTrack(factory, parent, kind)
  const fill = createProgressFillElement(factory, root, kind)
  return {
    now: attributeCell(root, 'aria-valuenow'),
    valueText: attributeCell(root, 'aria-valuetext'),
    width: percentCell(fill, 'width'),
  }
}

const renderProgress = (element: ProgressElement, percent: number): void => {
  const label = `${String(percent)}%`
  writeAttribute(element.now, String(percent))
  writeAttribute(element.valueText, label)
  writePercent(element.width, percent)
}

const createFurnaceRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'furnace')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createFurnaceGrid = (factory: DomElementFactory, root: DomElement): DomElement => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'furnace-slots')
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', 'repeat(3, 1fr)')
  root.appendChild(grid)
  return grid
}

const createFurnaceSlots = (
  factory: DomElementFactory,
  grid: DomElement,
): Array<SlotElement> => {
  const createFurnaceSlot = (id: FurnaceSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-furnace-slot', id)
    slot.root.setAttribute('data-interaction-target', 'furnace-slot')
    slot.root.setAttribute('data-interaction-slot', id)
    grid.appendChild(slot.root)
    return slot
  }
  return FURNACE_SLOT_IDS.map(createFurnaceSlot)
}

const createFurnaceStatus = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'furnace-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  return textCell(status)
}

const resolveFocusedSlot = (requested: FurnaceSlotId): FurnaceSlotId => {
  // `FurnaceInteractionView` is a published type with no canonical constructor.
  // A host can hand `render()` a stale or round-tripped value that only claims to satisfy the
  // `FurnaceSlotId` union at compile time.
  // Falling back to the input slot is the inert answer.
  if (FURNACE_SLOT_IDS.includes(requested)) {
    return requested
  }
  return 'input'
}

/** Creates a listener-free furnace projection. The host owns every interaction. */
export const createFurnaceView = (
  factory: DomElementFactory,
  parent: DomElement,
): FurnaceView => {
  const root = createFurnaceRoot(factory, parent)
  const grid = createFurnaceGrid(factory, root)
  const slots = createFurnaceSlots(factory, grid)

  const cook = createProgress(factory, root, 'cook')
  const burn = createProgress(factory, root, 'burn')

  const statusText = createFurnaceStatus(factory, root)

  return {
    render: (model: FurnaceViewModel, interaction?: FurnaceInteractionView): void => {
      const focusedSlot = resolveFocusedSlot(interaction?.focusedSlot ?? 'input')

      const renderFurnaceSlot = (slotElement: SlotElement, slot: FurnaceSlotView): void => {
        updateSlotElement(slotElement, slot)
        const focused = slot.id === focusedSlot
        setSlotButtonView(slotElement, {
          disabled: false,
          focused: typeof interaction !== 'undefined' && focused,
          label: slotAriaLabel(slot),
          tabStop: focused,
        })
      }

      for (const [index, slotElement] of slots.entries()) {
        const slot = model.slots[index]
        if (typeof slot !== 'undefined') {
          renderFurnaceSlot(slotElement, slot)
        }
      }

      renderProgress(cook, model.cookProgressPercent)
      renderProgress(burn, model.burnProgressPercent)
      writeText(statusText, interaction?.status ?? '')
    },
    root,
  }
}
