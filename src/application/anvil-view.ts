import {
  ANVIL_OPERATION_TARGETS,
  ANVIL_SLOT_IDS,
  type AnvilOperationTarget,
  type AnvilSlotId,
  type AnvilSlotView,
  type AnvilViewModel,
} from '../domain/anvil-view-model'
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write'
import type { DomElement, DomElementFactory, DomInputElement } from './dom-surface'
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

const slotAriaLabel = (slot: AnvilSlotView): string => {
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts) guarantees the two always agree.
  // Checking the field this function actually reads lets TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a check on `empty` alone could never let the type system prove impossible.
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo stack of exactly one (`slotCountLabel`, same file).
  if (typeof slot.itemId === 'undefined') {
    return `${SLOT_LABEL[slot.id]}, empty`
  }
  return `${SLOT_LABEL[slot.id]}, ${slot.itemId}, ${slot.countLabel ?? '1'}`
}

const resolveFocusedTarget = (requested: AnvilOperationTarget): AnvilOperationTarget => {
  // `AnvilInteractionView` is a published type with no canonical constructor, unlike `AnvilViewModel`.
  // A host assembles `focusedTarget` itself.
  // A stale or round-tripped value can disagree with the type it claims to satisfy at compile time.
  // Falling back to the default target is the inert answer.
  if (ANVIL_OPERATION_TARGETS.includes(requested)) {
    return requested
  }
  return 'primary-input'
}

const tabStopValue = (tabbable: boolean): string => {
  if (tabbable) {
    return '0'
  }
  return '-1'
}

/** `'true'` when the field genuinely holds focus, otherwise no attribute at all. */
const focusedFlagValue = (active: boolean): string | undefined => {
  if (active) {
    return 'true'
  }
  return
}

const createAnvilRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'anvil')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createAnvilGrid = (factory: DomElementFactory, root: DomElement): DomElement => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'anvil-slots')
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', 'repeat(3, 1fr)')
  root.appendChild(grid)
  return grid
}

const createAnvilSlots = (factory: DomElementFactory, grid: DomElement): Array<SlotElement> => {
  const createAnvilSlot = (id: AnvilSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-anvil-slot', id)
    slot.root.setAttribute('data-interaction-target', 'anvil-operation')
    slot.root.setAttribute('data-operation-target', id)
    grid.appendChild(slot.root)
    return slot
  }
  return ANVIL_SLOT_IDS.map(createAnvilSlot)
}

type AnvilNameInput = {
  readonly input: DomInputElement
  readonly tabStop: AttributeCell
  readonly focused: AttributeCell
}

const createAnvilNameInput = (factory: DomElementFactory, root: DomElement): AnvilNameInput => {
  const nameInput: DomInputElement = factory.createElement('input')
  nameInput.setAttribute('type', 'text')
  nameInput.setAttribute('data-mx-ui', 'anvil-name')
  nameInput.setAttribute('data-interaction-target', 'anvil-operation')
  nameInput.setAttribute('data-operation-target', 'name')
  nameInput.setAttribute('aria-label', 'Item name')
  root.appendChild(nameInput)
  return {
    focused: attributeCell(nameInput, 'data-focused'),
    input: nameInput,
    tabStop: attributeCell(nameInput, 'tabindex'),
  }
}

const createAnvilLevelCost = (factory: DomElementFactory, root: DomElement): TextCell => {
  const levelCost = factory.createElement('div')
  levelCost.setAttribute('data-mx-ui', 'anvil-level-cost')
  levelCost.setAttribute('aria-label', 'Level cost')
  root.appendChild(levelCost)
  return textCell(levelCost)
}

type AnvilRejection = {
  readonly text: TextCell
  readonly hidden: AttributeCell
}

const createAnvilRejection = (factory: DomElementFactory, root: DomElement): AnvilRejection => {
  const rejection = factory.createElement('div')
  rejection.setAttribute('data-mx-ui', 'anvil-rejection')
  rejection.setAttribute('role', 'alert')
  rejection.setAttribute('aria-atomic', 'true')
  root.appendChild(rejection)
  return {
    hidden: attributeCell(rejection, 'hidden'),
    text: textCell(rejection),
  }
}

const createAnvilStatus = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'anvil-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  return textCell(status)
}

type AnvilStatusElements = {
  readonly levelCostText: TextCell
  readonly rejection: AnvilRejection
  readonly statusText: TextCell
}

const createAnvilStatusElements = (
  factory: DomElementFactory,
  root: DomElement,
): AnvilStatusElements => {
  const levelCostText = createAnvilLevelCost(factory, root)
  const rejection = createAnvilRejection(factory, root)
  const statusText = createAnvilStatus(factory, root)
  return { levelCostText, rejection, statusText }
}

/** Creates a listener-free anvil projection. The host owns every interaction. */
export const createAnvilView = (factory: DomElementFactory, parent: DomElement): AnvilView => {
  const root = createAnvilRoot(factory, parent)
  const grid = createAnvilGrid(factory, root)
  const slots = createAnvilSlots(factory, grid)

  const name = createAnvilNameInput(factory, root)
  let previousName = ''

  const statusElements = createAnvilStatusElements(factory, root)

  const renderSlots = (
    model: AnvilViewModel,
    focusedTarget: AnvilOperationTarget,
    interaction: AnvilInteractionView | undefined,
  ): void => {
    const renderAnvilSlot = (slotElement: SlotElement, slot: AnvilSlotView): void => {
      updateSlotElement(slotElement, slot)
      const focused = slot.id === focusedTarget
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
        renderAnvilSlot(slotElement, slot)
      }
    }
  }

  const renderAnvilDetails = (
    model: AnvilViewModel,
    focusedTarget: AnvilOperationTarget,
    interaction: AnvilInteractionView | undefined,
  ): void => {
    if (previousName !== model.name) {
      previousName = model.name
      name.input.value = model.name
    }
    const nameIsFocused = focusedTarget === 'name'
    writeAttribute(name.tabStop, tabStopValue(nameIsFocused))
    writeAttribute(
      name.focused,
      focusedFlagValue(typeof interaction !== 'undefined' && nameIsFocused),
    )
    writeText(statusElements.levelCostText, `Level cost: ${String(model.levelCost)}`)
    writeText(statusElements.rejection.text, model.rejectionReason ?? '')
    writeHidden(statusElements.rejection.hidden, typeof model.rejectionReason === 'undefined')
    writeText(statusElements.statusText, interaction?.status ?? '')
  }

  return {
    render: (model: AnvilViewModel, interaction?: AnvilInteractionView): void => {
      const focusedTarget = resolveFocusedTarget(interaction?.focusedTarget ?? 'primary-input')
      renderSlots(model, focusedTarget, interaction)
      renderAnvilDetails(model, focusedTarget, interaction)
    },
    root,
  }
}
