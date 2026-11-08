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
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
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
  setSlotFocusTarget,
  updateSlotElement,
} from './slot-element.js'
import type { UiLanguage, UiMessageKey, UiMessageValues } from '../domain/ui-language.js'
import { setLocalizedAttribute, setLocalizedText, uiLanguageForElement } from './ui-localization.js'
import { itemDisplayNameValue } from './item-display-name.js'

export type FurnaceInteractionView = {
  readonly focusedSlot: FurnaceSlotId
  readonly status: string
}

export type FurnaceView = {
  readonly root: DomElement
  readonly render: (model: FurnaceViewModel, interaction?: FurnaceInteractionView) => void
}

export type FurnaceViewActions = {
  readonly onActivate?: (target: FurnaceSlotId) => void
  readonly onClose?: () => void
  readonly onFocusChange?: (target: FurnaceSlotId) => void
}

type ProgressElement = {
  readonly now: AttributeCell
  readonly valueText: AttributeCell
  readonly width: PercentCell
}

const SLOT_MESSAGE_KEY: Readonly<Record<FurnaceSlotId, UiMessageKey>> = {
  fuel: 'furnace.fuel',
  input: 'furnace.input',
  output: 'furnace.output',
}

const FURNACE_COLUMNS = 3

const slotAriaLabel = (
  slot: FurnaceSlotView,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values: UiMessageValues }> => {
  // Branch on `itemId` itself, not the separate `empty` flag: `slotView` (domain/hud-view-model.ts)
  // Guarantees the two always agree. Checking the field this function actually reads lets
  // TypeScript narrow `itemId` to `string` below — which removes the `?? 'empty'` fallback that a
  // Check on `empty` alone could never let the type system prove impossible (same call as
  // `anvil-view.ts`'s `slotAriaLabel`).
  // `countLabel` stays `??`-guarded: unlike `itemId`, it is genuinely absent for a real, in-repo
  // Stack of exactly one.
  if (typeof slot.itemId === 'undefined') {
    return {
      key: 'furnace.slot-empty',
      values: { slot: { key: SLOT_MESSAGE_KEY[slot.id] } },
    }
  }
  return {
    key: 'furnace.slot-item',
    values: {
      count: slot.countLabel ?? '1',
      item: itemDisplayNameValue(slot, language),
      slot: { key: SLOT_MESSAGE_KEY[slot.id] },
    },
  }
}

const progressLabelKey = (kind: 'cook' | 'burn'): UiMessageKey => {
  if (kind === 'cook') {
    return 'furnace.cooking-progress'
  }
  return 'furnace.fuel-remaining'
}

const createProgressTrack = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: 'cook' | 'burn',
): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', `furnace-${kind}-progress`)
  root.setAttribute('role', 'progressbar')
  setLocalizedAttribute(root, 'aria-label', progressLabelKey(kind))
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
  grid.style.setProperty('grid-template-columns', `repeat(${String(FURNACE_COLUMNS)}, minmax(0, 1fr))`)
  root.appendChild(grid)
  return grid
}

const createFurnaceCloseButton = (
  factory: DomElementFactory,
  root: DomElement,
  actions: FurnaceViewActions | undefined,
): void => {
  if (typeof actions?.onClose !== 'function') {
    return
  }
  const close: DomInteractiveElement = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'furnace-close')
  setLocalizedAttribute(close, 'aria-label', 'furnace.close')
  setLocalizedText(close, 'furnace.close')
  close.addEventListener('click', actions.onClose)
  root.appendChild(close)
}

const wireFurnaceSlot = (
  slot: SlotElement,
  id: FurnaceSlotId,
  actions: FurnaceViewActions | undefined,
): void => {
  slot.root.setAttribute('data-furnace-slot', id)
  slot.root.setAttribute('data-interaction-target', 'furnace-slot')
  slot.root.setAttribute('data-interaction-slot', id)
  if (typeof actions?.onActivate === 'function') {
    slot.root.addEventListener('click', () => actions.onActivate?.(id))
  }
  if (typeof actions?.onFocusChange === 'function') {
    slot.root.addEventListener('focus', () => actions.onFocusChange?.(id))
  }
}

const createFurnaceSlots = (
  factory: DomElementFactory,
  grid: DomElement,
  actions: FurnaceViewActions | undefined,
): Array<SlotElement> => {
  const createFurnaceSlot = (id: FurnaceSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    setSlotFocusTarget(slot, { columns: FURNACE_COLUMNS, group: 'furnace', index })
    wireFurnaceSlot(slot, id, actions)
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

/** Projects furnace state and wires optional native slot actions. */
export const createFurnaceView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: FurnaceViewActions,
): FurnaceView => {
  const root = createFurnaceRoot(factory, parent)
  createFurnaceCloseButton(factory, root, actions)
  const grid = createFurnaceGrid(factory, root)
  const slots = createFurnaceSlots(factory, grid, actions)

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
          label: '',
          localizedLabel: slotAriaLabel(slot, uiLanguageForElement(slotElement.root)),
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
