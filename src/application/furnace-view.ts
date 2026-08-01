import {
  FURNACE_SLOT_IDS,
  type FurnaceSlotId,
  type FurnaceSlotView,
  type FurnaceViewModel,
} from '../domain/furnace-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  percentCell,
  textCell,
  writeAttribute,
  writePercent,
  writeText,
  attributeCell,
  type AttributeCell,
  type PercentCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'
import {
  createSlotElement,
  setSlotButtonView,
  updateSlotElement,
  type SlotElement,
} from './slot-element'

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
  input: 'Furnace input',
  fuel: 'Furnace fuel',
  output: 'Furnace output',
}

const slotAriaLabel = (slot: FurnaceSlotView): string =>
  slot.empty
    ? `${SLOT_LABEL[slot.id]}, empty`
    : `${SLOT_LABEL[slot.id]}, ${slot.itemId ?? 'empty'}, ${slot.countLabel ?? '1'}`

const createProgress = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: 'cook' | 'burn',
): ProgressElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', `furnace-${kind}-progress`)
  root.setAttribute('role', 'progressbar')
  root.setAttribute('aria-label', kind === 'cook' ? 'Cooking progress' : 'Fuel remaining')
  root.setAttribute('aria-valuemin', '0')
  root.setAttribute('aria-valuemax', '100')
  root.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  parent.appendChild(root)

  const fill = factory.createElement('div')
  fill.setAttribute('data-mx-ui', `furnace-${kind}-progress-fill`)
  fill.style.setProperty('background-color', PALETTE_VAR.xpFill)
  root.appendChild(fill)

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

/** Creates a listener-free furnace projection. The host owns every interaction. */
export const createFurnaceView = (
  factory: DomElementFactory,
  parent: DomElement,
): FurnaceView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'furnace')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'furnace-slots')
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', 'repeat(3, 1fr)')
  root.appendChild(grid)

  const slots = FURNACE_SLOT_IDS.map((id, index): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-furnace-slot', id)
    slot.root.setAttribute('data-interaction-target', 'furnace-slot')
    slot.root.setAttribute('data-interaction-slot', id)
    grid.appendChild(slot.root)
    return slot
  })

  const cook = createProgress(factory, root, 'cook')
  const burn = createProgress(factory, root, 'burn')

  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'furnace-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  const statusText: TextCell = textCell(status)

  return {
    root,
    render: (model: FurnaceViewModel, interaction?: FurnaceInteractionView): void => {
      const focusedSlot = FURNACE_SLOT_IDS.includes(interaction?.focusedSlot ?? 'input')
        ? (interaction?.focusedSlot ?? 'input')
        : 'input'

      for (const [index, slotElement] of slots.entries()) {
        const slot = model.slots[index]
        if (slot === undefined) {
          continue
        }
        updateSlotElement(slotElement, slot, undefined)
        const focused = slot.id === focusedSlot
        setSlotButtonView(slotElement, {
          label: slotAriaLabel(slot),
          disabled: false,
          tabStop: focused,
          focused: interaction !== undefined && focused,
        })
      }

      renderProgress(cook, model.cookProgressPercent)
      renderProgress(burn, model.burnProgressPercent)
      writeText(statusText, interaction?.status ?? '')
    },
  }
}
