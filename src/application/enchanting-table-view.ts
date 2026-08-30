import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import {
  ENCHANTING_OFFER_IDS,
  ENCHANTING_OPERATION_TARGETS,
  ENCHANTING_SLOT_IDS,
  type EnchantingOfferId,
  type EnchantingOfferView,
  type EnchantingOperationTarget,
  type EnchantingSlotId,
  type EnchantingSlotView,
  type EnchantingTableViewModel,
} from '../domain/enchanting-table-view-model.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  updateSlotElement,
} from './slot-element.js'

export type EnchantingInteractionView = {
  readonly focusedTarget: EnchantingOperationTarget
  readonly status: string
}

export type EnchantingTableView = {
  readonly root: DomElement
  readonly render: (
    model: EnchantingTableViewModel,
    interaction?: EnchantingInteractionView,
  ) => void
}

export type EnchantingTableViewActions = {
  readonly onActivate: (target: EnchantingOperationTarget) => void
}

type OfferElement = {
  readonly root: DomInteractiveElement
  readonly label: TextCell
  readonly rejection: TextCell
  readonly rejectionHidden: AttributeCell
  readonly tabStop: AttributeCell
  readonly focused: AttributeCell
  readonly disabled: AttributeCell
  readonly ariaDisabled: AttributeCell
  readonly ariaLabel: AttributeCell
}

const SLOT_LABEL: Readonly<Record<EnchantingSlotId, string>> = {
  item: 'Enchanting item',
  lapis: 'Lapis lazuli',
}

const slotAriaLabel = (slot: EnchantingSlotView): string => {
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

const offerLabel = (offer: EnchantingOfferView): string => {
  if (typeof offer.enchantmentId === 'undefined') {
    return 'Unavailable enchantment offer'
  }
  return `${offer.enchantmentId} ${String(offer.enchantmentLevel)}; ${String(
    offer.levelCost,
  )} levels; ${String(offer.lapisCost)} lapis`
}

const resolveFocusedTarget = (
  requested: EnchantingOperationTarget,
): EnchantingOperationTarget => {
  // `EnchantingInteractionView` is a published type with no canonical constructor.
  // A host can hand `render()` a stale or round-tripped value that only claims to satisfy the
  // `EnchantingOperationTarget` union at compile time.
  // Falling back to the item slot is the inert answer.
  if (ENCHANTING_OPERATION_TARGETS.includes(requested)) {
    return requested
  }
  return 'item'
}

const tabStopValue = (tabbable: boolean): string => {
  if (tabbable) {
    return '0'
  }
  return '-1'
}

/** `'true'` when the offer genuinely holds focus, otherwise no attribute at all. */
const focusedFlagValue = (active: boolean): string | undefined => {
  if (active) {
    return 'true'
  }
  return
}

/** `''` when present, otherwise no attribute at all. */
const presenceValue = (present: boolean): string | undefined => {
  if (present) {
    return ''
  }
  return
}

const trueFalseValue = (flag: boolean): string => {
  if (flag) {
    return 'true'
  }
  return 'false'
}

const createOfferRoot = (
  factory: DomElementFactory,
  id: EnchantingOfferId,
): DomInteractiveElement => {
  const root = factory.createElement('button')
  root.setAttribute('type', 'button')
  root.setAttribute('data-mx-ui', 'enchanting-offer')
  root.setAttribute('data-interaction-target', 'enchanting-operation')
  root.setAttribute('data-operation-target', id)
  return root
}

const createOfferLabel = (
  factory: DomElementFactory,
  root: DomInteractiveElement,
): TextCell => {
  const label = factory.createElement('span')
  label.setAttribute('data-mx-ui', 'enchanting-offer-label')
  root.appendChild(label)
  return textCell(label)
}

type OfferRejection = {
  readonly text: TextCell
  readonly hidden: AttributeCell
}

const createOfferRejection = (
  factory: DomElementFactory,
  root: DomInteractiveElement,
): OfferRejection => {
  const rejection = factory.createElement('span')
  rejection.setAttribute('data-mx-ui', 'enchanting-offer-rejection')
  rejection.setAttribute('role', 'alert')
  root.appendChild(rejection)
  return {
    hidden: attributeCell(rejection, 'hidden'),
    text: textCell(rejection),
  }
}

const createOfferElement = (
  factory: DomElementFactory,
  id: EnchantingOfferId,
): OfferElement => {
  const root = createOfferRoot(factory, id)
  const label = createOfferLabel(factory, root)
  const rejection = createOfferRejection(factory, root)

  return {
    ariaDisabled: attributeCell(root, 'aria-disabled'),
    ariaLabel: attributeCell(root, 'aria-label'),
    disabled: attributeCell(root, 'disabled'),
    focused: attributeCell(root, 'data-focused'),
    label,
    rejection: rejection.text,
    rejectionHidden: rejection.hidden,
    root,
    tabStop: attributeCell(root, 'tabindex'),
  }
}

type OfferInteractionView = {
  readonly focused: boolean
  readonly interactionPresent: boolean
}

const updateOfferElement = (
  element: OfferElement,
  offer: EnchantingOfferView,
  interactionView: OfferInteractionView,
): void => {
  const label = offerLabel(offer)
  const disabled =
    typeof offer.enchantmentId === 'undefined' || typeof offer.rejectionReason !== 'undefined'
  writeText(element.label, label)
  writeText(element.rejection, offer.rejectionReason ?? '')
  writeHidden(element.rejectionHidden, typeof offer.rejectionReason === 'undefined')
  writeAttribute(element.tabStop, tabStopValue(interactionView.focused))
  writeAttribute(
    element.focused,
    focusedFlagValue(interactionView.interactionPresent && interactionView.focused),
  )
  writeAttribute(element.disabled, presenceValue(disabled))
  writeAttribute(element.ariaDisabled, trueFalseValue(disabled))
  writeAttribute(element.ariaLabel, label)
}

const createEnchantingRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'enchanting-table')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createEnchantingSlotGrid = (factory: DomElementFactory, root: DomElement): DomElement => {
  const slotGrid = factory.createElement('div')
  slotGrid.setAttribute('data-mx-ui', 'enchanting-slots')
  slotGrid.style.setProperty('display', 'grid')
  slotGrid.style.setProperty('grid-template-columns', 'repeat(2, 1fr)')
  root.appendChild(slotGrid)
  return slotGrid
}

const createEnchantingSlots = (
  factory: DomElementFactory,
  slotGrid: DomElement,
): Array<SlotElement> => {
  const createEnchantingSlot = (id: EnchantingSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-enchanting-slot', id)
    slot.root.setAttribute('data-interaction-target', 'enchanting-operation')
    slot.root.setAttribute('data-operation-target', id)
    slotGrid.appendChild(slot.root)
    return slot
  }
  return ENCHANTING_SLOT_IDS.map(createEnchantingSlot)
}

const createEnchantingOfferList = (factory: DomElementFactory, root: DomElement): DomElement => {
  const offerList = factory.createElement('div')
  offerList.setAttribute('data-mx-ui', 'enchanting-offers')
  root.appendChild(offerList)
  return offerList
}

const createEnchantingOffers = (
  factory: DomElementFactory,
  offerList: DomElement,
  actions: EnchantingTableViewActions | undefined,
): Array<OfferElement> => {
  const createOffer = (id: EnchantingOfferId): OfferElement => {
    const offer = createOfferElement(factory, id)
    if (typeof actions !== 'undefined') {
      offer.root.addEventListener('click', () => {
        actions.onActivate(id)
      })
    }
    offerList.appendChild(offer.root)
    return offer
  }
  return ENCHANTING_OFFER_IDS.map(createOffer)
}

const createEnchantingStatus = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'enchanting-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  root.appendChild(status)
  return textCell(status)
}

/** Projects enchanting state; optional actions connect its native offer buttons. */
export const createEnchantingTableView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: EnchantingTableViewActions,
): EnchantingTableView => {
  const root = createEnchantingRoot(factory, parent)
  const slotGrid = createEnchantingSlotGrid(factory, root)
  const slots = createEnchantingSlots(factory, slotGrid)

  const offerList = createEnchantingOfferList(factory, root)
  const offers = createEnchantingOffers(factory, offerList, actions)

  const statusText = createEnchantingStatus(factory, root)

  const renderSlots = (
    model: EnchantingTableViewModel,
    focusedTarget: EnchantingOperationTarget,
    interaction: EnchantingInteractionView | undefined,
  ): void => {
    const renderEnchantingSlot = (slotElement: SlotElement, slot: EnchantingSlotView): void => {
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
        renderEnchantingSlot(slotElement, slot)
      }
    }
  }

  const renderOffers = (
    model: EnchantingTableViewModel,
    focusedTarget: EnchantingOperationTarget,
    interaction: EnchantingInteractionView | undefined,
  ): void => {
    for (const [index, offerElement] of offers.entries()) {
      const offer = model.offers[index]
      if (typeof offer !== 'undefined') {
        updateOfferElement(offerElement, offer, {
          focused: offer.id === focusedTarget,
          interactionPresent: typeof interaction !== 'undefined',
        })
      }
    }
  }

  return {
    render: (model: EnchantingTableViewModel, interaction?: EnchantingInteractionView): void => {
      const focusedTarget = resolveFocusedTarget(interaction?.focusedTarget ?? 'item')
      renderSlots(model, focusedTarget, interaction)
      renderOffers(model, focusedTarget, interaction)
      writeText(statusText, interaction?.status ?? '')
    },
    root,
  }
}
