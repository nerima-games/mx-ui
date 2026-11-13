import {
  ANVIL_OPERATION_TARGETS,
  ANVIL_SLOT_IDS,
  type AnvilOperationTarget,
  type AnvilSlotId,
  type AnvilSlotView,
  type AnvilViewModel,
} from '../domain/anvil-view-model.js'
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory, DomInputElement, DomInteractiveElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  setSlotFocusTarget,
  updateSlotElement,
} from './slot-element.js'
import type { UiLanguage, UiMessageKey, UiMessageValues } from '../domain/ui-language.js'
import { setLocalizedAttribute, setLocalizedText, uiLanguageForElement, writeLocalizedText } from './ui-localization.js'
import { Result } from 'effect'
import { itemDisplayNameValue } from './item-display-name.js'

export type AnvilInteractionView = {
  readonly focusedTarget: AnvilOperationTarget
  readonly status: string
}

export type AnvilView = {
  readonly root: DomElement
  readonly render: (
    model: AnvilViewModel | null,
    interaction?: AnvilInteractionView | null,
  ) => Result.Result<void, AnvilViewInputFailure>
}

type AnvilViewInputFailure = Readonly<{
  readonly _tag: 'InvalidAnvilViewInput'
  readonly field: string
}>

const invalidAnvilModelField = (model: AnvilViewModel): string | undefined => {
  if (Reflect.get(model, 'rejectionReason') === null) {
    return 'rejectionReason'
  }
  if (model.slots.some((slot) =>
    typeof slot !== 'undefined' && Reflect.get(slot, 'itemDisplayName') === null,
  )) {
    return 'slots[].itemDisplayName'
  }
  if (model.slots.some((slot) =>
    typeof slot !== 'undefined' && Reflect.get(slot, 'countLabel') === null,
  )) {
    return 'slots[].countLabel'
  }
  return
}

const invalidAnvilInteractionField = (interaction: AnvilInteractionView | undefined): string | undefined => {
  if (typeof interaction !== 'undefined' && Reflect.get(interaction, 'status') === null) {
    return 'interaction.status'
  }
  if (typeof interaction !== 'undefined' && Reflect.get(interaction, 'focusedTarget') === null) {
    return 'interaction.focusedTarget'
  }
  return
}

const invalidAnvilViewInputField = (
  model: AnvilViewModel,
  interaction: AnvilInteractionView | undefined,
): string | undefined => invalidAnvilModelField(model) ?? invalidAnvilInteractionField(interaction)

export type AnvilViewActions = {
  readonly onActivate?: (target: AnvilOperationTarget) => void
  readonly onClose?: () => void
  readonly onFocusChange?: (target: AnvilOperationTarget) => void
  readonly onNameChange?: (value: AnvilViewModel['name']) => void
}

const SLOT_MESSAGE_KEY: Readonly<Record<AnvilSlotId, UiMessageKey>> = {
  output: 'anvil.output',
  'primary-input': 'anvil.primary-input',
  'secondary-input': 'anvil.secondary-input',
}

const ANVIL_OPERATION_COLUMNS = 4

const slotAriaLabel = (
  slot: AnvilSlotView,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values: UiMessageValues }> => {
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts) guarantees the two always agree.
  // Checking the field this function actually reads lets TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a check on `empty` alone could never let the type system prove impossible.
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo stack of exactly one (`slotCountLabel`, same file).
  if (typeof slot.itemId === 'undefined') {
    return { key: 'anvil.slot-empty', values: { slot: { key: SLOT_MESSAGE_KEY[slot.id] } } }
  }
  return {
    key: 'anvil.slot-item',
    values: { count: slot.countLabel ?? '1', item: itemDisplayNameValue(slot, language), slot: { key: SLOT_MESSAGE_KEY[slot.id] } },
  }
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
  grid.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))')
  root.appendChild(grid)
  return grid
}

const createAnvilCloseButton = (
  factory: DomElementFactory,
  root: DomElement,
  actions: AnvilViewActions | undefined,
): void => {
  if (typeof actions?.onClose !== 'function') {
    return
  }
  const close: DomInteractiveElement = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'anvil-close')
  setLocalizedAttribute(close, 'aria-label', 'anvil.close')
  setLocalizedText(close, 'anvil.close')
  close.addEventListener('click', actions.onClose)
  root.appendChild(close)
}

const createAnvilRootWithCloseButton = (
  factory: DomElementFactory,
  parent: DomElement,
  actions: AnvilViewActions | undefined,
): DomElement => {
  const root = createAnvilRoot(factory, parent)
  createAnvilCloseButton(factory, root, actions)
  return root
}

const configureAnvilSlot = (slot: SlotElement, id: AnvilSlotId): void => {
  const focusIndex = ANVIL_OPERATION_TARGETS.indexOf(id)
  setSlotFocusTarget(slot, {
    columns: ANVIL_OPERATION_COLUMNS,
    group: 'anvil-operation',
    index: focusIndex,
  })
  slot.root.setAttribute('data-anvil-slot', id)
  slot.root.setAttribute('data-interaction-target', 'anvil-operation')
  slot.root.setAttribute('data-operation-target', id)
}

const wireAnvilSlot = (slot: SlotElement, id: AnvilSlotId, actions: AnvilViewActions | undefined): void => {
  if (typeof actions?.onActivate === 'function') {
    slot.root.addEventListener('click', () => actions.onActivate?.(id))
  }
  if (typeof actions?.onFocusChange === 'function') {
    slot.root.addEventListener('focus', () => actions.onFocusChange?.(id))
  }
}

const createAnvilSlots = (
  factory: DomElementFactory,
  grid: DomElement,
  actions: AnvilViewActions | undefined,
): Array<SlotElement> => {
  const createAnvilSlot = (id: AnvilSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    configureAnvilSlot(slot, id)
    wireAnvilSlot(slot, id, actions)
    grid.appendChild(slot.root)
    return slot
  }
  return ANVIL_SLOT_IDS.map(createAnvilSlot)
}

type AnvilNameInput = {
  readonly input: DomInputElement
  readonly tabStop: AttributeCell
  readonly focused: AttributeCell
  readonly title: AttributeCell
}

const configureAnvilNameInput = (nameInput: DomInputElement): void => {
  nameInput.setAttribute('type', 'text')
  nameInput.setAttribute('data-mx-ui', 'anvil-name')
  nameInput.setAttribute('data-interaction-target', 'anvil-operation')
  nameInput.setAttribute('data-operation-target', 'name')
  nameInput.setAttribute('data-focus-group', 'anvil-operation')
  nameInput.setAttribute('data-focus-index', String(ANVIL_OPERATION_TARGETS.indexOf('name')))
  nameInput.setAttribute('data-focus-columns', String(ANVIL_OPERATION_COLUMNS))
  setLocalizedAttribute(nameInput, 'aria-label', 'anvil.item-name')
}

const wireAnvilNameInput = (nameInput: DomInputElement, actions: AnvilViewActions | undefined): void => {
  if (typeof actions?.onNameChange === 'function') {
    nameInput.addEventListener('input', () => actions.onNameChange?.(nameInput.value))
  }
  if (typeof actions?.onFocusChange === 'function') {
    nameInput.addEventListener('focus', () => actions.onFocusChange?.('name'))
  }
}

const createAnvilNameInput = (
  factory: DomElementFactory,
  root: DomElement,
  actions: AnvilViewActions | undefined,
): AnvilNameInput => {
  const nameInput: DomInputElement = factory.createElement('input')
  configureAnvilNameInput(nameInput)
  wireAnvilNameInput(nameInput, actions)
  root.appendChild(nameInput)
  return {
    focused: attributeCell(nameInput, 'data-focused'),
    input: nameInput,
    tabStop: attributeCell(nameInput, 'tabindex'),
    title: attributeCell(nameInput, 'title'),
  }
}

const createAnvilLevelCost = (factory: DomElementFactory, root: DomElement): TextCell => {
  const levelCost = factory.createElement('div')
  levelCost.setAttribute('data-mx-ui', 'anvil-level-cost')
  setLocalizedAttribute(levelCost, 'aria-label', 'anvil.level-cost')
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

const createAnvilSlotElements = (
  factory: DomElementFactory,
  parent: DomElement,
  actions: AnvilViewActions | undefined,
): Readonly<{ root: DomElement; slots: ReadonlyArray<SlotElement> }> => {
  const root = createAnvilRootWithCloseButton(factory, parent, actions)
  const grid = createAnvilGrid(factory, root)
  const slots = createAnvilSlots(factory, grid, actions)
  return { root, slots }
}

/** Projects anvil state and wires optional native operation actions. */
export const createAnvilView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: AnvilViewActions,
): AnvilView => {
  const { root, slots } = createAnvilSlotElements(factory, parent, actions)

  const name = createAnvilNameInput(factory, root, actions)
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
        label: '',
        localizedLabel: slotAriaLabel(slot, uiLanguageForElement(slotElement.root)),
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

  const renderAnvilName = (value: string): void => {
    if (previousName === value) {
      return
    }
    previousName = value
    name.input.value = value
    writeAttribute(name.title, value)
  }

  const renderAnvilDetails = (
    model: AnvilViewModel,
    focusedTarget: AnvilOperationTarget,
    interaction: AnvilInteractionView | undefined,
  ): void => {
    renderAnvilName(model.name)
    const nameIsFocused = focusedTarget === 'name'
    writeAttribute(name.tabStop, tabStopValue(nameIsFocused))
    writeAttribute(
      name.focused,
      focusedFlagValue(typeof interaction !== 'undefined' && nameIsFocused),
    )
    writeLocalizedText(statusElements.levelCostText, 'anvil.level-cost-value', {
      cost: model.levelCost,
    })
    writeText(statusElements.rejection.text, model.rejectionReason ?? '')
    writeHidden(statusElements.rejection.hidden, typeof model.rejectionReason === 'undefined')
    writeText(statusElements.statusText, interaction?.status ?? '')
  }

  const projectAnvilModel = (model: AnvilViewModel, interaction: AnvilInteractionView | undefined): void => {
    const focusedTarget = resolveFocusedTarget(interaction?.focusedTarget ?? 'primary-input')
    renderSlots(model, focusedTarget, interaction)
    renderAnvilDetails(model, focusedTarget, interaction)
  }

  return {
    render: (model: AnvilViewModel | null, interaction?: AnvilInteractionView | null) => {
      if (model === null) {
        return Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'model' })
      }
      if (interaction === null) {
        return Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'interaction' })
      }
      const invalidField = invalidAnvilViewInputField(model, interaction)
      if (typeof invalidField !== 'undefined') {
        return Result.fail({ _tag: 'InvalidAnvilViewInput', field: invalidField })
      }
      projectAnvilModel(model, interaction)
      return Result.void
    },
    root,
  }
}
