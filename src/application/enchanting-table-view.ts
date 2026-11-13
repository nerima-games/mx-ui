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
  SUPPORTED_VANILLA_ENCHANTMENT_IDS,
  type SupportedVanillaEnchantmentId,
} from '@nerima-games/mc-kernel/domain/enchantment'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  setSlotFocusTarget,
  updateSlotElement,
} from './slot-element.js'
import type { UiLanguage, UiMessageKey, UiMessageValues } from '../domain/ui-language.js'
import { setLocalizedAttribute, setLocalizedText, uiLanguageForElement, writeLocalizedAttribute, writeLocalizedText } from './ui-localization.js'
import { Result } from 'effect'
import { itemDisplayNameValue } from './item-display-name.js'

export type EnchantingInteractionView = {
  readonly focusedTarget: EnchantingOperationTarget
  readonly status: string
}

export type EnchantingTableView = {
  readonly root: DomElement
  readonly render: (
    model: EnchantingTableViewModel | null,
    interaction?: EnchantingInteractionView | null,
  ) => Result.Result<void, EnchantingTableViewInputFailure>
}

type EnchantingTableViewInputFailure = Readonly<{
  readonly _tag: 'InvalidEnchantingTableViewInput'
  readonly field: string
}>

const invalidEnchantingTableModelField = (model: EnchantingTableViewModel): string | undefined => {
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
  if (model.offers.some((offer) =>
    typeof offer !== 'undefined' && Reflect.get(offer, 'rejectionReason') === null,
  )) {
    return 'offers[].rejectionReason'
  }
  return
}

const invalidEnchantingInteractionField = (
  interaction: EnchantingInteractionView | undefined,
): string | undefined => {
  if (typeof interaction !== 'undefined') {
    const focusedTarget = Reflect.get(interaction, 'focusedTarget')
    if (
      typeof focusedTarget !== 'undefined' &&
      !ENCHANTING_OPERATION_TARGETS.some((target) => target === focusedTarget)
    ) {
      return 'interaction.focusedTarget'
    }
  }
  if (typeof interaction !== 'undefined' && Reflect.get(interaction, 'status') === null) {
    return 'interaction.status'
  }
  return
}

const invalidEnchantingTableViewInputField = (
  model: EnchantingTableViewModel,
  interaction: EnchantingInteractionView | undefined,
): string | undefined => {
  const invalidModelField = invalidEnchantingTableModelField(model)
  if (typeof invalidModelField !== 'undefined') {
    return invalidModelField
  }
  return invalidEnchantingInteractionField(interaction)
}

export type EnchantingTableViewActions = {
  readonly onActivate: (target: EnchantingOperationTarget) => void
  readonly onClose?: () => void
  readonly onFocusChange?: (target: EnchantingOperationTarget) => void
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

const SLOT_MESSAGE_KEY: Readonly<Record<EnchantingSlotId, UiMessageKey>> = {
  item: 'enchanting.item',
  lapis: 'enchanting.lapis',
}

const ENCHANTING_FOCUS_COLUMNS = 2
const LAST_ENCHANTMENT_ID_PART = -1

const ENCHANTMENT_MESSAGE_KEY: Readonly<Record<SupportedVanillaEnchantmentId, UiMessageKey>> = {
  aqua_affinity: 'enchanting.name.aqua-affinity',
  bane_of_arthropods: 'enchanting.name.bane-of-arthropods',
  binding_curse: 'enchanting.name.binding-curse',
  blast_protection: 'enchanting.name.blast-protection',
  breach: 'enchanting.name.breach',
  channeling: 'enchanting.name.channeling',
  density: 'enchanting.name.density',
  depth_strider: 'enchanting.name.depth-strider',
  efficiency: 'enchanting.name.efficiency',
  feather_falling: 'enchanting.name.feather-falling',
  fire_aspect: 'enchanting.name.fire-aspect',
  fire_protection: 'enchanting.name.fire-protection',
  flame: 'enchanting.name.flame',
  fortune: 'enchanting.name.fortune',
  frost_walker: 'enchanting.name.frost-walker',
  impaling: 'enchanting.name.impaling',
  infinity: 'enchanting.name.infinity',
  knockback: 'enchanting.name.knockback',
  looting: 'enchanting.name.looting',
  loyalty: 'enchanting.name.loyalty',
  luck_of_the_sea: 'enchanting.name.luck-of-the-sea',
  lunge: 'enchanting.name.lunge',
  lure: 'enchanting.name.lure',
  mending: 'enchanting.name.mending',
  multishot: 'enchanting.name.multishot',
  piercing: 'enchanting.name.piercing',
  power: 'enchanting.name.power',
  projectile_protection: 'enchanting.name.projectile-protection',
  protection: 'enchanting.name.protection',
  punch: 'enchanting.name.punch',
  quick_charge: 'enchanting.name.quick-charge',
  respiration: 'enchanting.name.respiration',
  riptide: 'enchanting.name.riptide',
  sharpness: 'enchanting.name.sharpness',
  silk_touch: 'enchanting.name.silk-touch',
  smite: 'enchanting.name.smite',
  soul_speed: 'enchanting.name.soul-speed',
  sweeping_edge: 'enchanting.name.sweeping-edge',
  swift_sneak: 'enchanting.name.swift-sneak',
  thorns: 'enchanting.name.thorns',
  unbreaking: 'enchanting.name.unbreaking',
  vanishing_curse: 'enchanting.name.vanishing-curse',
  wind_burst: 'enchanting.name.wind-burst',
}

const isSupportedEnchantmentId = (value: string): value is SupportedVanillaEnchantmentId =>
  SUPPORTED_VANILLA_ENCHANTMENT_IDS.some((id) => id === value)

const enchantmentNameValue = (id: string): UiMessageValues[string] => {
  const unnamespacedId = id.split(':').at(LAST_ENCHANTMENT_ID_PART)
  if (typeof unnamespacedId !== 'undefined' && isSupportedEnchantmentId(unnamespacedId)) {
    return { key: ENCHANTMENT_MESSAGE_KEY[unnamespacedId] }
  }
  return id
}

const slotAriaLabel = (
  slot: EnchantingSlotView,
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
    return { key: 'enchanting.slot-empty', values: { slot: { key: SLOT_MESSAGE_KEY[slot.id] } } }
  }
  return {
    key: 'enchanting.slot-item',
    values: { count: slot.countLabel ?? '1', item: itemDisplayNameValue(slot, language), slot: { key: SLOT_MESSAGE_KEY[slot.id] } },
  }
}

const offerLabel = (offer: EnchantingOfferView): Readonly<{ key: UiMessageKey; values?: UiMessageValues }> => {
  if (typeof offer.enchantmentId === 'undefined') {
    return { key: 'enchanting.offer-unavailable' }
  }
  return {
    key: 'enchanting.offer',
    values: {
      cost: offer.levelCost,
      enchantment: enchantmentNameValue(offer.enchantmentId),
      lapis: offer.lapisCost,
      level: offer.enchantmentLevel,
    },
  }
}

type PreparedEnchantingRender = Readonly<{
  model: EnchantingTableViewModel
  interaction: EnchantingInteractionView | undefined
  focusedTarget: EnchantingOperationTarget
}>

const prepareEnchantingRender = (
  model: EnchantingTableViewModel | null,
  interaction: EnchantingInteractionView | null | undefined,
): Result.Result<PreparedEnchantingRender, EnchantingTableViewInputFailure> => {
  if (model === null) {
    return Result.fail({ _tag: 'InvalidEnchantingTableViewInput', field: 'model' })
  }
  if (interaction === null) {
    return Result.fail({ _tag: 'InvalidEnchantingTableViewInput', field: 'interaction' })
  }
  const invalidField = invalidEnchantingTableViewInputField(model, interaction)
  if (typeof invalidField !== 'undefined') {
    return Result.fail({ _tag: 'InvalidEnchantingTableViewInput', field: invalidField })
  }
  return Result.succeed({
    focusedTarget: interaction?.focusedTarget ?? 'item',
    interaction,
    model,
  })
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
  root.setAttribute('data-focus-group', 'enchanting-operation')
  root.setAttribute('data-focus-index', String(ENCHANTING_OPERATION_TARGETS.indexOf(id)))
  root.setAttribute('data-focus-columns', String(ENCHANTING_FOCUS_COLUMNS))
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
  writeLocalizedText(element.label, label.key, label.values)
  writeText(element.rejection, offer.rejectionReason ?? '')
  writeHidden(element.rejectionHidden, typeof offer.rejectionReason === 'undefined')
  writeAttribute(element.tabStop, tabStopValue(interactionView.focused))
  writeAttribute(
    element.focused,
    focusedFlagValue(interactionView.interactionPresent && interactionView.focused),
  )
  writeAttribute(element.disabled, presenceValue(disabled))
  writeAttribute(element.ariaDisabled, trueFalseValue(disabled))
  writeLocalizedAttribute(element.ariaLabel, label.key, label.values)
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

const createEnchantingCloseButton = (
  factory: DomElementFactory,
  root: DomElement,
  actions: EnchantingTableViewActions | undefined,
): void => {
  if (typeof actions?.onClose !== 'function') {
    return
  }
  const close: DomInteractiveElement = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'enchanting-close')
  setLocalizedAttribute(close, 'aria-label', 'enchanting.close')
  setLocalizedText(close, 'enchanting.close')
  close.addEventListener('click', actions.onClose)
  root.appendChild(close)
}

const configureEnchantingSlot = (slot: SlotElement, id: EnchantingSlotId): void => {
  const focusIndex = ENCHANTING_OPERATION_TARGETS.indexOf(id)
  setSlotFocusTarget(slot, {
    columns: ENCHANTING_FOCUS_COLUMNS,
    group: 'enchanting-operation',
    index: focusIndex,
  })
  slot.root.setAttribute('data-enchanting-slot', id)
  slot.root.setAttribute('data-interaction-target', 'enchanting-operation')
  slot.root.setAttribute('data-operation-target', id)
}

const wireEnchantingSlot = (
  slot: SlotElement,
  id: EnchantingSlotId,
  actions: EnchantingTableViewActions | undefined,
): void => {
  if (typeof actions !== 'undefined') {
    slot.root.addEventListener('click', () => actions.onActivate(id))
  }
  if (typeof actions?.onFocusChange === 'function') {
    slot.root.addEventListener('focus', () => actions.onFocusChange?.(id))
  }
}

const createEnchantingSlots = (
  factory: DomElementFactory,
  slotGrid: DomElement,
  actions: EnchantingTableViewActions | undefined,
): Array<SlotElement> => {
  const createEnchantingSlot = (id: EnchantingSlotId, index: number): SlotElement => {
    const slot = createSlotElement(factory, index)
    configureEnchantingSlot(slot, id)
    wireEnchantingSlot(slot, id, actions)
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
    if (typeof actions?.onFocusChange === 'function') {
      offer.root.addEventListener('focus', () => actions.onFocusChange?.(id))
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
  createEnchantingCloseButton(factory, root, actions)
  const slotGrid = createEnchantingSlotGrid(factory, root)
  const slots = createEnchantingSlots(factory, slotGrid, actions)

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
        label: '',
        localizedLabel: slotAriaLabel(slot, uiLanguageForElement(slotElement.root)),
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
    render: (model: EnchantingTableViewModel | null, interaction?: EnchantingInteractionView | null) => {
      const prepared = prepareEnchantingRender(model, interaction)
      if (Result.isFailure(prepared)) {
        return Result.fail(prepared.failure)
      }
      renderSlots(prepared.success.model, prepared.success.focusedTarget, prepared.success.interaction)
      renderOffers(prepared.success.model, prepared.success.focusedTarget, prepared.success.interaction)
      writeText(statusText, prepared.success.interaction?.status ?? '')
      return Result.void
    },
    root,
  }
}
