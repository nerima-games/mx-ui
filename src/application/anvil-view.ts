import {
  ANVIL_OPERATION_TARGETS,
  ANVIL_SLOT_IDS,
  type AnvilOperationTarget,
  type AnvilSlotId,
  type AnvilSlotView,
  type AnvilViewModel,
} from '../domain/anvil-view-model'
import type { DomElement, DomElementFactory, DomInputElement } from './dom-surface'
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write'
import { PALETTE_VAR, declarePalette } from './palette-css'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  updateSlotElement,
} from './slot-element'

export type AnvilInteractionView = {
  readonly focusedTarget: AnvilOperationTarget
  readonly status: string
}

export type AnvilView = {
  readonly root: DomElement
  readonly render: (model: AnvilViewModel, interaction?: AnvilInteractionView) => void
}

const SLOT_LABEL: Readonly<Record<AnvilSlotId, string>> = {
  output: 'Anvil output',
  'primary-input': 'Anvil primary input',
  'secondary-input': 'Anvil secondary input',
}

const slotAriaLabel = (slot: AnvilSlotView): string =>
  slot.empty
    ? `${SLOT_LABEL[slot.id]}, empty`
    : `${SLOT_LABEL[slot.id]}, ${slot.itemId ?? 'empty'}, ${slot.countLabel ?? '1'}`

/** Creates a listener-free anvil projection. The host owns every interaction. */
export const createAnvilView = (factory: DomElementFactory, parent: DomElement): AnvilView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'anvil')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'anvil-slots')
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', 'repeat(3, 1fr)')
  root.appendChild(grid)

  const slots = ANVIL_SLOT_IDS.map((id, index): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-anvil-slot', id)
    slot.root.setAttribute('data-interaction-target', 'anvil-operation')
    slot.root.setAttribute('data-operation-target', id)
    grid.appendChild(slot.root)
    return slot
  })

  const nameInput: DomInputElement = factory.createElement('input')
  nameInput.setAttribute('type', 'text')
  nameInput.setAttribute('data-mx-ui', 'anvil-name')
  nameInput.setAttribute('data-interaction-target', 'anvil-operation')
  nameInput.setAttribute('data-operation-target', 'name')
  nameInput.setAttribute('aria-label', 'Item name')
  root.appendChild(nameInput)
  const nameTabStop = attributeCell(nameInput, 'tabindex')
  const nameFocused = attributeCell(nameInput, 'data-focused')
  let previousName = ''

  const levelCost = factory.createElement('div')
  levelCost.setAttribute('data-mx-ui', 'anvil-level-cost')
  levelCost.setAttribute('aria-label', 'Level cost')
  root.appendChild(levelCost)
  const levelCostText: TextCell = textCell(levelCost)

  const rejection = factory.createElement('div')
  rejection.setAttribute('data-mx-ui', 'anvil-rejection')
  rejection.setAttribute('role', 'alert')
  rejection.setAttribute('aria-atomic', 'true')
  root.appendChild(rejection)
  const rejectionText: TextCell = textCell(rejection)
  const rejectionHidden: AttributeCell = attributeCell(rejection, 'hidden')

  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'anvil-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  const statusText: TextCell = textCell(status)

  return {
    render: (model: AnvilViewModel, interaction?: AnvilInteractionView): void => {
      const requestedTarget = interaction?.focusedTarget ?? 'primary-input'
      const focusedTarget = ANVIL_OPERATION_TARGETS.includes(requestedTarget)
        ? requestedTarget
        : 'primary-input'

      for (const [index, slotElement] of slots.entries()) {
        const slot = model.slots[index]
        if (slot === undefined) {
          continue
        }
        updateSlotElement(slotElement, slot, undefined)
        const focused = slot.id === focusedTarget
        setSlotButtonView(slotElement, {
          label: slotAriaLabel(slot),
          disabled: false,
          tabStop: focused,
          focused: interaction !== undefined && focused,
        })
      }

      if (previousName !== model.name) {
        previousName = model.name
        nameInput.value = model.name
      }
      const nameIsFocused = focusedTarget === 'name'
      writeAttribute(nameTabStop, nameIsFocused ? '0' : '-1')
      writeAttribute(nameFocused, interaction !== undefined && nameIsFocused ? 'true' : undefined)
      writeText(levelCostText, `Level cost: ${String(model.levelCost)}`)
      writeText(rejectionText, model.rejectionReason ?? '')
      writeHidden(rejectionHidden, model.rejectionReason === undefined)
      writeText(statusText, interaction?.status ?? '')
    },
    root,
  }
}
