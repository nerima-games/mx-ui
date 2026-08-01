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
} from '../domain/enchanting-table-view-model'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface'
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

const slotAriaLabel = (slot: EnchantingSlotView): string =>
  slot.empty
    ? `${SLOT_LABEL[slot.id]}, empty`
    : `${SLOT_LABEL[slot.id]}, ${slot.itemId ?? 'empty'}, ${slot.countLabel ?? '1'}`

const offerLabel = (offer: EnchantingOfferView): string => {
  if (offer.enchantmentId === undefined) {
    return 'Unavailable enchantment offer'
  }
  return `${offer.enchantmentId} ${String(offer.enchantmentLevel)}; ${String(
    offer.levelCost,
  )} levels; ${String(offer.lapisCost)} lapis`
}

const createOfferElement = (
  factory: DomElementFactory,
  id: EnchantingOfferId,
): OfferElement => {
  const root = factory.createElement('button')
  root.setAttribute('type', 'button')
  root.setAttribute('data-mx-ui', 'enchanting-offer')
  root.setAttribute('data-interaction-target', 'enchanting-operation')
  root.setAttribute('data-operation-target', id)

  const label = factory.createElement('span')
  label.setAttribute('data-mx-ui', 'enchanting-offer-label')
  root.appendChild(label)

  const rejection = factory.createElement('span')
  rejection.setAttribute('data-mx-ui', 'enchanting-offer-rejection')
  rejection.setAttribute('role', 'alert')
  root.appendChild(rejection)

  return {
    ariaDisabled: attributeCell(root, 'aria-disabled'),
    ariaLabel: attributeCell(root, 'aria-label'),
    disabled: attributeCell(root, 'disabled'),
    focused: attributeCell(root, 'data-focused'),
    label: textCell(label),
    rejection: textCell(rejection),
    rejectionHidden: attributeCell(rejection, 'hidden'),
    root,
    tabStop: attributeCell(root, 'tabindex'),
  }
}

const updateOfferElement = (
  element: OfferElement,
  offer: EnchantingOfferView,
  focused: boolean,
  interactionPresent: boolean,
): void => {
  const label = offerLabel(offer)
  const disabled = offer.enchantmentId === undefined || offer.rejectionReason !== undefined
  writeText(element.label, label)
  writeText(element.rejection, offer.rejectionReason ?? '')
  writeHidden(element.rejectionHidden, offer.rejectionReason === undefined)
  writeAttribute(element.tabStop, focused ? '0' : '-1')
  writeAttribute(element.focused, interactionPresent && focused ? 'true' : undefined)
  writeAttribute(element.disabled, disabled ? '' : undefined)
  writeAttribute(element.ariaDisabled, disabled ? 'true' : 'false')
  writeAttribute(element.ariaLabel, label)
}

/** Projects enchanting state; optional actions connect its native offer buttons. */
export const createEnchantingTableView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: EnchantingTableViewActions,
): EnchantingTableView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'enchanting-table')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const slotGrid = factory.createElement('div')
  slotGrid.setAttribute('data-mx-ui', 'enchanting-slots')
  slotGrid.style.setProperty('display', 'grid')
  slotGrid.style.setProperty('grid-template-columns', 'repeat(2, 1fr)')
  root.appendChild(slotGrid)

  const slots = ENCHANTING_SLOT_IDS.map((id, index): SlotElement => {
    const slot = createSlotElement(factory, index)
    slot.root.setAttribute('data-enchanting-slot', id)
    slot.root.setAttribute('data-interaction-target', 'enchanting-operation')
    slot.root.setAttribute('data-operation-target', id)
    slotGrid.appendChild(slot.root)
    return slot
  })

  const offerList = factory.createElement('div')
  offerList.setAttribute('data-mx-ui', 'enchanting-offers')
  root.appendChild(offerList)
  const offers = ENCHANTING_OFFER_IDS.map((id) => {
    const offer = createOfferElement(factory, id)
    if (actions !== undefined) {
      offer.root.addEventListener('click', () => actions.onActivate(id))
    }
    offerList.appendChild(offer.root)
    return offer
  })

  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'enchanting-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  root.appendChild(status)
  const statusText = textCell(status)

  return {
    render: (model: EnchantingTableViewModel, interaction?: EnchantingInteractionView): void => {
      const requestedTarget = interaction?.focusedTarget ?? 'item'
      const focusedTarget = ENCHANTING_OPERATION_TARGETS.includes(requestedTarget)
        ? requestedTarget
        : 'item'

      for (const [index, slotElement] of slots.entries()) {
        const slot = model.slots[index]
        if (slot === undefined) {
          continue
        }
        updateSlotElement(slotElement, slot, undefined)
        const focused = slot.id === focusedTarget
        setSlotButtonView(slotElement, {
          disabled: false,
          focused: interaction !== undefined && focused,
          label: slotAriaLabel(slot),
          tabStop: focused,
        })
      }

      for (const [index, offerElement] of offers.entries()) {
        const offer = model.offers[index]
        if (offer !== undefined) {
          updateOfferElement(
            offerElement,
            offer,
            offer.id === focusedTarget,
            interaction !== undefined,
          )
        }
      }
      writeText(statusText, interaction?.status ?? '')
    },
    root,
  }
}
