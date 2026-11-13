/**
 * The inventory and crafting screen.
 *
 * ---------------------------------------------------------------------------
 * The load-bearing case is `unknown`
 * ---------------------------------------------------------------------------
 *
 * `domain/inventory-view-model.ts` is emphatic about it: 「An armour rack drawn
 * as four empty squares tells the player they are wearing nothing; mc-sim has
 * not said that, and has in fact said nothing at all, because it has no armour
 * slots. Those are different screens and only one of them is true」.
 *
 * A DOM layer is where that distinction is easiest to lose, because an empty
 * grid and an absent grid look almost the same in code and not at all the same
 * on screen. So an `unknown` region draws NO SLOTS AT ALL — the grid is hidden
 * and a note carrying the model's own `why` string takes its place. The
 * `data-region-state` attribute records which of the two a region is in, so the
 * difference is assertable rather than eyeballed.
 *
 * Same for crafting: `no-match` and `unknown` are separate states with separate
 * attribute values, because 「mc-sim has not answered」 is not 「this grid makes
 * nothing」.
 *
 * ---------------------------------------------------------------------------
 * A gap this file found, and did not paper over
 * ---------------------------------------------------------------------------
 *
 * `MergeTargets` carries ABSOLUTE inventory indices — mc-sim's answer to "where
 * may this stack go" — while `SlotView.index` is REGION-LOCAL: `projectRegion`
 * passes each slot its `offset`, not `firstIndex + offset`, and `SlotRegion` does
 * not publish `firstIndex`. So the mapping from a highlighted index to a drawn
 * square is not stated by the view model, and this file cannot perform it.
 *
 * The tempting fix is four lines here — hotbar is 0–8, main is 9–44 — and it is
 * the exact mistake DN-UI-7c is the record of: a second copy of a derivation,
 * silently divergent, in a highlight the player reads as a promise. So this
 * renderer highlights NOTHING, `test/inventory-view.test.ts` pins that, and the
 * fix belongs in `domain/inventory-view-model.ts` (publish `firstIndex` on a
 * `slots` region) rather than here.
 */
import {
  type AttributeCell,
  type StyleCell,
  type TextCell,
  attributeCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeStyle,
  writeText,
} from './dom-write.js'
import type {
  CraftingOutcomeView,
  InventoryViewModel,
  RegionId,
  SlotRegion,
} from '../domain/inventory-view-model.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotButtonView,
  type SlotElement,
  createSlotElement,
  hideSlotElementAtMount,
  setSlotButtonView,
  setSlotFocusTarget,
  setSlotHidden,
  updateSlotElement,
} from './slot-element.js'
import { UI_MESSAGES, type UiLanguage, type UiMessageKey, type UiMessageValues } from '../domain/ui-language.js'
import { inheritUiLanguage, uiLanguageForElement, writeLocalizedAttribute, writeLocalizedText } from './ui-localization.js'
import { Result } from 'effect'
import type { SlotView } from '../domain/hud-view-model.js'
import { itemDisplayNameValue } from './item-display-name.js'

type RegionElement = {
  readonly id: RegionId
  readonly root: DomElement
  readonly grid: DomElement
  readonly hidden: AttributeCell
  readonly stateFlag: AttributeCell
  readonly gridHidden: AttributeCell
  readonly noteHidden: AttributeCell
  readonly noteText: TextCell
  readonly columns: StyleCell
  readonly slots: Array<SlotElement>
}

export type InventoryView = {
  readonly root: DomElement
  readonly render: (
    model: InventoryViewModel,
    interaction?: InventoryInteractionView,
  ) => Result.Result<void, InvalidInventoryViewInput>
}

export type InventoryInteractionTarget =
  | { readonly kind: 'slot'; readonly region: RegionId; readonly index: number }
  | { readonly kind: 'crafting-output' }

/** Host-owned input state that mx-ui projects without attaching listeners. */
export type InventoryInteractionView = {
  readonly focused: InventoryInteractionTarget
  readonly status: string
}

export type InventoryViewActions = {
  readonly onActivate?: (target: InventoryInteractionTarget, shiftKey: boolean) => void
  readonly onFocusChange?: (target: InventoryInteractionTarget) => void
}

const CRAFTING_STATE: Readonly<Record<CraftingOutcomeView['kind'], string>> = {
  match: 'match',
  'no-match': 'no-match',
  unknown: 'unknown',
}

/** Ordinary values reused across this file so the constant names carry the meaning. */
const ZERO = 0
/** How many places a 0-based slot index is shifted for the 1-based label a player reads. */
const ONE = 1
/** The carried stack and the crafting output are each the only slot in their own row. */
const SOLE_SLOT_INDEX = 0
const REGION_MESSAGE_KEY: Readonly<Record<RegionId, UiMessageKey>> = {
  armour: 'inventory.region.armour',
  'crafting-grid': 'inventory.region.crafting-grid',
  hotbar: 'hud.hotbar',
  main: 'inventory.region.main',
  offhand: 'inventory.region.offhand',
}

/**
 * Set (or clear) a slot's interactive affordance in one place, so every call
 * site can OMIT `view` for "not interactive right now" instead of spelling the
 * absence out — `setSlotButtonView`'s `view` parameter is a required part of
 * `slot-element.ts`'s contract, so the omission has to happen at this boundary.
 */
const applyButtonView = (slot: SlotElement, view?: SlotButtonView): void => {
  setSlotButtonView(slot, view)
}

/**
 * Write (or clear) an attribute, letting the caller OMIT `value` for "remove
 * it" instead of passing an explicit absence — mirrors `applyButtonView` for
 * `writeAttribute`'s equally required `value` parameter.
 */
const writeOptionalAttribute = (cell: AttributeCell, value?: string): void => {
  writeAttribute(cell, value)
}

/** The three item-shaped fields of `SlotView`, all absent by omission. */
const noItemFields = (
  itemId?: string,
  countLabel?: string,
  durabilityPercent?: number,
): Pick<SlotView, 'itemId' | 'countLabel' | 'durabilityPercent'> => ({
  countLabel,
  durabilityPercent,
  itemId,
})

const EMPTY_OUTPUT: SlotView = {
  ...noItemFields(),
  empty: true,
  index: SOLE_SLOT_INDEX,
  selected: false,
}

const buildRegionRoot = (factory: DomElementFactory, parent: DomElement, id: RegionId): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'region')
  root.setAttribute('data-region', id)
  parent.appendChild(root)
  return root
}

const buildRegionGrid = (factory: DomElementFactory, root: DomElement): DomElement => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'region-grid')
  grid.style.setProperty('display', 'grid')
  root.appendChild(grid)
  return grid
}

const buildRegionNote = (factory: DomElementFactory, root: DomElement): DomElement => {
  const note = factory.createElement('p')
  note.setAttribute('data-mx-ui', 'region-note')
  note.setAttribute('hidden', '')
  // INK_FAINT: the note is for the developer, not the player
  // (`SlotRegion.why`: 「Shown to the developer, not to the player」). It is still
  // A guarded text token, so "for the developer" does not mean "unreadable".
  note.style.setProperty('color', PALETTE_VAR.inkFaint)
  root.appendChild(note)
  return note
}

const createRegion = (
  factory: DomElementFactory,
  parent: DomElement,
  id: RegionId,
): RegionElement => {
  const root = buildRegionRoot(factory, parent, id)
  inheritUiLanguage(parent, root)
  const grid = buildRegionGrid(factory, root)
  inheritUiLanguage(root, grid)
  const note = buildRegionNote(factory, root)
  inheritUiLanguage(root, note)

  const region: RegionElement = {
    columns: styleCell(grid, 'grid-template-columns'),
    grid,
    gridHidden: attributeCell(grid, 'hidden'),
    hidden: attributeCell(root, 'hidden'),
    id,
    noteHidden: attributeCell(note, 'hidden'),
    noteText: textCell(note),
    root,
    slots: [],
    stateFlag: attributeCell(root, 'data-region-state'),
  }
  region.noteHidden.previous = ''
  return region
}

const renderUnknownRegion = (region: RegionElement, model: Extract<SlotRegion, { readonly kind: 'unknown' }>): void => {
  writeHidden(region.gridHidden, true)
  writeHidden(region.noteHidden, false)
  if (typeof model.whyMessage === 'undefined') {
    writeText(region.noteText, model.why)
  } else {
    writeLocalizedText(region.noteText, model.whyMessage.key, model.whyMessage.values)
  }
  for (const slot of region.slots) {
    applyButtonView(slot)
  }
}

type RegionElements = {
  readonly factory: DomElementFactory
  readonly region: RegionElement
}

const wireRegionSlot = (
  slot: SlotElement,
  target: InventoryInteractionTarget,
  actions: InventoryViewActions | undefined,
): void => {
  if (typeof actions?.onActivate === 'function') {
    slot.root.addEventListener('click', (event) => {
      actions.onActivate?.(target, 'shiftKey' in event && event.shiftKey === true)
    })
  }
  if (typeof actions?.onFocusChange === 'function') {
    slot.root.addEventListener('focus', () => actions.onFocusChange?.(target))
  }
}

const ensureRegionSlotCount = (
  elements: RegionElements,
  slotCount: number,
  actions: InventoryViewActions | undefined,
): void => {
  const { factory, region } = elements
  while (region.slots.length < slotCount) {
    const index = region.slots.length
    const slot = createSlotElement(factory, index)
    inheritUiLanguage(region.grid, slot.root)
    const target: InventoryInteractionTarget = { index, kind: 'slot', region: region.id }
    wireRegionSlot(slot, target, actions)
    region.grid.appendChild(slot.root)
    region.slots.push(slot)
  }
}

const slotLabel = ({
  region,
  index,
  item,
  language,
}: Readonly<{
  region: RegionId
  index: number
  item: Pick<SlotView, 'itemId' | 'countLabel' | 'itemDisplayName'>
  language: UiLanguage
}>): Readonly<{ key: UiMessageKey; values: UiMessageValues }> => {
  const displayIndex = String(index + ONE)
  if (typeof item.itemId === 'undefined') {
    return {
      key: 'inventory.slot-empty',
      values: { region: { key: REGION_MESSAGE_KEY[region] }, slot: displayIndex },
    }
  }
  return {
    key: 'inventory.slot-item',
    values: {
      count: item.countLabel ?? '1',
      item: itemDisplayNameValue(item, language),
      region: { key: REGION_MESSAGE_KEY[region] },
      slot: displayIndex,
    },
  }
}

type SlotIdentity = {
  readonly regionId: RegionId
  readonly index: number
  readonly view: SlotView
}

const buildFocusedSlotButtonView = (
  identity: SlotIdentity,
  focused: InventoryInteractionTarget,
  language: UiLanguage,
): SlotButtonView => {
  const { regionId, index, view } = identity
  const isFocused = focused?.kind === 'slot' && focused.region === regionId && focused.index === index
  return {
    disabled: false,
    focused: isFocused,
    label: '',
    localizedLabel: slotLabel({ index, item: view, language, region: regionId }),
    tabStop: isFocused,
  }
}

type SlotRenderContext = {
  readonly index: number
  readonly columns: number
  readonly view: SlotView | undefined
  readonly regionId: RegionId
  readonly focused: InventoryInteractionTarget | undefined
}

const renderRegionSlotFocus = (
  slot: SlotElement,
  context: Readonly<{
    columns: number
    focused: InventoryInteractionTarget | undefined
    index: number
    regionId: RegionId
    view: SlotView
  }>,
): void => {
  if (typeof context.focused === 'undefined') {
    if (slot.role.previous === 'button') {
      applyButtonView(slot)
    }
    const language = uiLanguageForElement(slot.root)
    const label = slotLabel({ index: context.index, item: context.view, language, region: context.regionId })
    writeLocalizedAttribute(slot.ariaLabel, label.key, label.values)
    return
  }
  applyButtonView(
    slot,
    buildFocusedSlotButtonView(
      { index: context.index, regionId: context.regionId, view: context.view },
      context.focused,
      uiLanguageForElement(slot.root),
    ),
  )
  setSlotFocusTarget(slot, {
    columns: context.columns,
    group: context.regionId,
    index: context.index,
  })
}

const renderKnownRegionSlot = (slot: SlotElement, context: SlotRenderContext): void => {
  const { index, columns, view, regionId, focused } = context
  if (typeof view === 'undefined') {
    setSlotHidden(slot, true)
    applyButtonView(slot)
    return
  }
  setSlotHidden(slot, false)
  // `undefined`, always — see the header. The mapping from mc-sim's absolute
  // Indices to these region-local ones is not published, and inventing it here
  // Is the one thing this repository must not do.
  updateSlotElement(slot, view)
  renderRegionSlotFocus(slot, { columns, focused, index, regionId, view })
}

type KnownRegionRenderContext = Readonly<{
  elements: RegionElements
  model: Extract<SlotRegion, { readonly kind: 'slots' }>
  focused: InventoryInteractionTarget | undefined
  actions: InventoryViewActions | undefined
}>

const renderKnownRegion = ({ elements, focused, model, actions }: KnownRegionRenderContext): void => {
  const { region } = elements
  writeHidden(region.gridHidden, false)
  writeHidden(region.noteHidden, true)
  writeStyle(region.columns, `repeat(${String(model.columns)}, 1fr)`)
  ensureRegionSlotCount(elements, model.slots.length, actions)

  // Over the array; see `caption-view.ts`'s note. `model.slots` keeps its check
  // Because it is the other array and is routinely SHORTER — `region.slots` only
  // Ever grows, so a model with fewer slots than a previous one leaves surplus
  // Squares that have to be hidden rather than left showing stale items.
  for (const [index, slot] of region.slots.entries()) {
    renderKnownRegionSlot(slot, { columns: model.columns, focused, index, regionId: model.id, view: model.slots[index] })
  }
}

type RegionRenderContext = Readonly<{
  elements: RegionElements
  model: SlotRegion
  focused: InventoryInteractionTarget | undefined
  actions: InventoryViewActions | undefined
}>

const renderRegion = ({ elements, focused, model, actions }: RegionRenderContext): void => {
  const { region } = elements
  writeHidden(region.hidden, false)
  writeAttribute(region.stateFlag, model.kind)

  if (model.kind === 'unknown') {
    renderUnknownRegion(region, model)
    return
  }
  renderKnownRegion({ actions, elements, focused, model })
}

const inventoryItemName = (item: SlotView | undefined, language: UiLanguage): UiMessageValues[string] => {
  if (typeof item === 'undefined' || typeof item.itemId === 'undefined') {
    return { key: 'inventory.empty' }
  }
  return itemDisplayNameValue(item, language)
}

type InteractiveCraftingOutcome = Extract<CraftingOutcomeView, { readonly kind: 'match' | 'no-match' }>

const outputLabel = (
  crafting: InteractiveCraftingOutcome,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values?: UiMessageValues }> => {
  if (crafting.kind === 'match') {
    // `InventoryViewModel` is a published type with no canonical constructor.
    // `inventoryViewModel` always upholds this invariant: `empty` false implies `itemId` defined.
    // A hand-built `crafting.output` can disagree with it.
    // `countLabel`'s own `?? '1'` fallback is genuinely reachable for a match of one.
    return {
      key: 'inventory.crafting-output-item',
      values: {
        count: crafting.output.countLabel ?? '1',
        item: inventoryItemName(crafting.output, language),
      },
    }
  }
  return { key: 'inventory.crafting-output-no-match' }
}

const carriedItemLabel = (
  carriedView: SlotView | undefined,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values?: UiMessageValues }> => {
  if (typeof carriedView === 'undefined') {
    return { key: 'inventory.carried-empty' }
  }
  // Same published-type reasoning as `outputLabel` above.
  // A hand-built `InventoryViewModel` can hand this a `carriedView` whose `itemId` disagrees with
  // `empty`. `countLabel`'s own `?? '1'` fallback is genuinely reachable for a carried stack of one.
  return {
    key: 'inventory.carried-item',
    values: {
      count: carriedView.countLabel ?? '1',
      item: inventoryItemName(carriedView, language),
    },
  }
}

const validFocusTarget = (
  model: InventoryViewModel,
  requested: InventoryInteractionTarget,
): InventoryInteractionTarget => {
  if (requested.kind === 'crafting-output') {
    if (model.crafting.kind !== 'unknown') {
      return requested
    }
  } else {
    const region = model.regions.find((candidate) => candidate.id === requested.region)
    if (
      region?.kind === 'slots' &&
      Number.isInteger(requested.index) &&
      requested.index >= ZERO &&
      requested.index < region.slots.length
    ) {
      return requested
    }
  }

  const firstRegion = model.regions.find(
    (region): region is Extract<SlotRegion, { readonly kind: 'slots' }> =>
      region.kind === 'slots' && region.slots.length > ZERO,
  )
  // `inventoryViewModel` (domain/inventory-view-model.ts) always emits `hotbar` and `main` as
  // `kind: 'slots'`. So `firstRegion` is never `undefined` for a model built the only real way.
  // But `InventoryViewModel` is a published type with no canonical constructor.
  // A hand-built model (or one round-tripped through persistence) can still leave every region in
  // `regions` empty or unknown.
  if (typeof firstRegion === 'undefined') {
    return { kind: 'crafting-output' }
  }
  return { index: ZERO, kind: 'slot', region: firstRegion.id }
}

const resolveFocusedTarget = (
  model: InventoryViewModel,
  interaction: InventoryInteractionView | undefined,
): InventoryInteractionTarget | undefined => {
  if (typeof interaction === 'undefined') {
    return interaction
  }
  return validFocusTarget(model, interaction.focused)
}

const buildCarriedSlot = (factory: DomElementFactory, root: DomElement): SlotElement => {
  const carried = createSlotElement(factory, SOLE_SLOT_INDEX)
  carried.root.setAttribute('data-mx-ui', 'carried')
  root.appendChild(carried.root)
  hideSlotElementAtMount(carried)
  return carried
}

type CraftingElements = {
  readonly craftingState: AttributeCell
  readonly output: SlotElement
}

const buildCraftingOutput = (factory: DomElementFactory, root: DomElement): CraftingElements => {
  const crafting = factory.createElement('div')
  crafting.setAttribute('data-mx-ui', 'crafting-outcome')
  // SURFACE_RAISED — a panel on a panel, which is what the output square is.
  crafting.style.setProperty('background-color', PALETTE_VAR.surfaceRaised)
  root.appendChild(crafting)
  const craftingState = attributeCell(crafting, 'data-crafting-state')

  const output = createSlotElement(factory, SOLE_SLOT_INDEX)
  output.root.setAttribute('data-mx-ui', 'crafting-output')
  crafting.appendChild(output.root)
  hideSlotElementAtMount(output)

  return { craftingState, output }
}

const buildStatusText = (factory: DomElementFactory, root: DomElement): TextCell => {
  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'inventory-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  return textCell(status)
}

type InventoryViewElements = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly regions: Map<RegionId, RegionElement>
  readonly carried: SlotElement
  readonly craftingState: AttributeCell
  readonly output: SlotElement
  readonly statusText: TextCell
}

type RenderContext = {
  readonly elements: InventoryViewElements
  readonly actions: InventoryViewActions | undefined
  readonly model: InventoryViewModel
  readonly interaction: InventoryInteractionView | undefined
  readonly focused: InventoryInteractionTarget | undefined
}

type InventoryRenderInput = Omit<RenderContext, 'focused'>

type InvalidInventoryViewInput = Readonly<{
  _tag: 'InvalidInventoryViewInput'
  field:
    | 'carried.countLabel'
    | 'carried.itemDisplayName'
    | 'crafting.output.countLabel'
    | 'crafting.output.itemDisplayName'
    | 'interaction'
    | 'interaction.focused'
    | 'interaction.status'
    | 'model'
    | 'regions.countLabel'
    | 'regions.itemDisplayName'
}>

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const isOptionalString = (input: unknown): boolean =>
  typeof input === 'undefined' || typeof input === 'string'

const isOptionalNumber = (input: unknown): boolean =>
  typeof input === 'undefined' || typeof input === 'number'

const isDenseArray = (input: unknown, isElement: (value: unknown) => boolean): boolean => {
  if (!Array.isArray(input)) {
    return false
  }
  for (let index = 0; index < input.length; index += ONE) {
    if (!Object.hasOwn(input, index) || !isElement(input[index])) {
      return false
    }
  }
  return true
}

const isSlotViewShape = (input: unknown): boolean =>
  isRecord(input) &&
  Object.hasOwn(input, 'index') && typeof Reflect.get(input, 'index') === 'number' &&
  Object.hasOwn(input, 'itemId') && isOptionalString(Reflect.get(input, 'itemId')) &&
  Object.hasOwn(input, 'countLabel') &&
  Object.hasOwn(input, 'durabilityPercent') && isOptionalNumber(Reflect.get(input, 'durabilityPercent')) &&
  Object.hasOwn(input, 'selected') && typeof Reflect.get(input, 'selected') === 'boolean' &&
  Object.hasOwn(input, 'empty') && typeof Reflect.get(input, 'empty') === 'boolean'

const isMessageKey = (input: unknown): input is UiMessageKey =>
  typeof input === 'string' && Object.hasOwn(UI_MESSAGES, input)

const isMessageValuesShape = (input: unknown): boolean =>
  isRecord(input) && Object.values(input).every((value) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (isRecord(value) && isMessageKey(Reflect.get(value, 'key'))),
  )

const isUnknownRegionShape = (input: Record<string, unknown>): boolean => {
  const whyMessage = Reflect.get(input, 'whyMessage')
  return typeof Reflect.get(input, 'why') === 'string' &&
    (typeof whyMessage === 'undefined' || (
      isRecord(whyMessage) &&
      isMessageKey(Reflect.get(whyMessage, 'key')) &&
      (typeof Reflect.get(whyMessage, 'values') === 'undefined' ||
        isMessageValuesShape(Reflect.get(whyMessage, 'values')))
    ))
}

const isRegionId = (input: unknown): input is RegionId =>
  input === 'armour' || input === 'crafting-grid' || input === 'hotbar' || input === 'main' || input === 'offhand'

const isSlotRegionShape = (input: Record<string, unknown>): boolean =>
  isRegionId(Reflect.get(input, 'id')) &&
  typeof Reflect.get(input, 'columns') === 'number' &&
  isDenseArray(Reflect.get(input, 'slots'), isSlotViewShape)

const isRegionShape = (input: unknown): boolean => {
  if (!isRecord(input) || !isRegionId(Reflect.get(input, 'id'))) {
    return false
  }
  const kind = Reflect.get(input, 'kind')
  if (kind === 'slots') {
    return isSlotRegionShape(input)
  }
  return kind === 'unknown' && isUnknownRegionShape(input)
}

const isCraftingOutcomeShape = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const kind = Reflect.get(input, 'kind')
  if (kind === 'match') {
    return isSlotViewShape(Reflect.get(input, 'output'))
  }
  return kind === 'no-match' || kind === 'unknown'
}

const isMergeTargetsShape = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const kind = Reflect.get(input, 'kind')
  return kind === 'unknown' || (
    kind === 'known' &&
    isRecord(Reflect.get(input, 'indices')) &&
    typeof Reflect.get(Reflect.get(input, 'indices'), 'has') === 'function'
  )
}

const isInventoryViewModelShape = (input: unknown): boolean =>
  isRecord(input) &&
  Object.hasOwn(input, 'regions') &&
  isDenseArray(Reflect.get(input, 'regions'), isRegionShape) &&
  Object.hasOwn(input, 'carried') &&
  (typeof Reflect.get(input, 'carried') === 'undefined' || isSlotViewShape(Reflect.get(input, 'carried'))) &&
  Object.hasOwn(input, 'crafting') &&
  isCraftingOutcomeShape(Reflect.get(input, 'crafting')) &&
  Object.hasOwn(input, 'mergeTargets') &&
  isMergeTargetsShape(Reflect.get(input, 'mergeTargets'))

const isItemDisplayNameFailure = (input: unknown): boolean =>
  isRecord(input) && [
    'InvalidItemDisplayName',
    'InvalidItemId',
    'ItemDisplayNameUnavailable',
    'MissingItemDisplayNameResolver',
  ].some((failureTag) => Reflect.get(input, '_tag') === failureTag)

const isItemDisplayNameResult = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const tag = Reflect.get(input, '_tag')
  if (tag === 'Success') {
    return typeof Reflect.get(input, 'success') === 'string'
  }
  return tag === 'Failure' && isItemDisplayNameFailure(Reflect.get(input, 'failure'))
}

const isItemDisplayNameView = (input: unknown): boolean =>
  typeof input === 'undefined' || (
    isRecord(input) &&
    (Reflect.get(input, 'language') === 'en' || Reflect.get(input, 'language') === 'ja') &&
    isItemDisplayNameResult(Reflect.get(input, 'result'))
  )

const hasInvalidCountLabel = (slot: unknown): boolean => {
  if (typeof slot === 'undefined') {
    return false
  }
  return !isRecord(slot) || !isOptionalString(Reflect.get(slot, 'countLabel'))
}

const hasInvalidItemDisplayName = (slot: unknown): boolean => {
  if (typeof slot === 'undefined') {
    return false
  }
  return !isRecord(slot) || !isItemDisplayNameView(Reflect.get(slot, 'itemDisplayName'))
}

const isInventoryInteractionTarget = (input: unknown): input is InventoryInteractionTarget => {
  if (!isRecord(input)) {
    return false
  }
  const kind = Reflect.get(input, 'kind')
  if (kind === 'crafting-output') {
    return true
  }
  if (kind !== 'slot') {
    return false
  }
  const region = Reflect.get(input, 'region')
  const index = Reflect.get(input, 'index')
  return ['armour', 'crafting-grid', 'hotbar', 'main', 'offhand'].some((candidate) => candidate === region) &&
    typeof index === 'number' && Number.isSafeInteger(index) && index >= ZERO
}

const invalidInventoryInteractionRecordField = (
  interaction: Record<string, unknown>,
): InvalidInventoryViewInput | undefined => {
  if (!isInventoryInteractionTarget(Reflect.get(interaction, 'focused'))) {
    return { _tag: 'InvalidInventoryViewInput', field: 'interaction.focused' }
  }
  if (!isOptionalString(Reflect.get(interaction, 'status'))) {
    return { _tag: 'InvalidInventoryViewInput', field: 'interaction.status' }
  }
  return
}

const invalidInventoryInteractionField = (
  interaction: InventoryInteractionView | undefined,
): InvalidInventoryViewInput | undefined => {
  if (Object.is(interaction, null)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'interaction' }
  }
  if (typeof interaction === 'undefined') {
    return
  }
  if (!isRecord(interaction)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'interaction' }
  }
  return invalidInventoryInteractionRecordField(interaction)
}

const invalidInventoryCountLabelField = (model: InventoryViewModel): InvalidInventoryViewInput | undefined => {
  if (hasInvalidCountLabel(model.carried)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'carried.countLabel' }
  }
  if (model.crafting.kind === 'match' && hasInvalidCountLabel(model.crafting.output)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'crafting.output.countLabel' }
  }
  for (const region of model.regions) {
    if (region.kind === 'slots' && region.slots.some(hasInvalidCountLabel)) {
      return { _tag: 'InvalidInventoryViewInput', field: 'regions.countLabel' }
    }
  }
  return
}

const invalidInventoryItemDisplayNameField = (
  model: InventoryViewModel,
): InvalidInventoryViewInput | undefined => {
  if (hasInvalidItemDisplayName(model.carried)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'carried.itemDisplayName' }
  }
  if (model.crafting.kind === 'match' && hasInvalidItemDisplayName(model.crafting.output)) {
    return { _tag: 'InvalidInventoryViewInput', field: 'crafting.output.itemDisplayName' }
  }
  for (const region of model.regions) {
    if (region.kind === 'slots' && region.slots.some(hasInvalidItemDisplayName)) {
      return { _tag: 'InvalidInventoryViewInput', field: 'regions.itemDisplayName' }
    }
  }
  return
}

const invalidInventoryViewInput = (
  model: InventoryViewModel,
  interaction: InventoryInteractionView | undefined,
): InvalidInventoryViewInput | undefined => {
  const interactionField = invalidInventoryInteractionField(interaction)
  if (typeof interactionField !== 'undefined') {
    return interactionField
  }
  const itemDisplayNameField = invalidInventoryItemDisplayNameField(model)
  if (typeof itemDisplayNameField !== 'undefined') {
    return itemDisplayNameField
  }
  return invalidInventoryCountLabelField(model)
}

type RegionSyncContext = Readonly<{
  elements: Pick<InventoryViewElements, 'factory' | 'root' | 'regions'>
  model: InventoryViewModel
  focused: InventoryInteractionTarget | undefined
  actions: InventoryViewActions | undefined
}>

const syncModelRegions = ({ elements, model, focused, actions }: RegionSyncContext): ReadonlySet<RegionId> => {
  const { factory, root, regions } = elements
  const seen = new Set<RegionId>()
  for (const regionModel of model.regions) {
    seen.add(regionModel.id)
    const existing = regions.get(regionModel.id)
    const element = existing ?? createRegion(factory, root, regionModel.id)
    if (typeof existing === 'undefined') {
      regions.set(regionModel.id, element)
    }
    renderRegion({ actions, elements: { factory, region: element }, focused, model: regionModel })
  }
  return seen
}

const hideUnseenRegions = (
  regions: Map<RegionId, RegionElement>,
  seen: ReadonlySet<RegionId>,
): void => {
  for (const [id, element] of regions) {
    if (!seen.has(id)) {
      writeHidden(element.hidden, true)
      for (const slot of element.slots) {
        applyButtonView(slot)
      }
    }
  }
}

const renderRegions = (
  elements: Pick<InventoryViewElements, 'factory' | 'root' | 'regions'>,
  context: Pick<RenderContext, 'model' | 'focused' | 'actions'>,
): void => {
  const { actions, model, focused } = context
  const seen = syncModelRegions({ actions, elements, focused, model })
  hideUnseenRegions(elements.regions, seen)
}

const updateCarriedSlot = (carried: SlotElement, carriedView: SlotView | undefined): void => {
  setSlotHidden(carried, typeof carriedView === 'undefined')
  if (typeof carriedView !== 'undefined') {
    updateSlotElement(carried, carriedView)
  }
}

const writeCarriedLabel = (carried: SlotElement, carriedView: SlotView | undefined): void => {
  const label = carriedItemLabel(carriedView, uiLanguageForElement(carried.root))
  writeLocalizedAttribute(carried.ariaLabel, label.key, label.values)
}

const writeCarriedAttributes = (
  carried: SlotElement,
  interaction: InventoryInteractionView | undefined,
  carriedView: SlotView | undefined,
): void => {
  const isInteractive = typeof interaction !== 'undefined'
  if (isInteractive) {
    writeOptionalAttribute(carried.role, 'status')
    writeOptionalAttribute(carried.ariaLive, 'polite')
  } else {
    writeOptionalAttribute(carried.role)
    writeOptionalAttribute(carried.ariaLive)
  }
  writeCarriedLabel(carried, carriedView)
}

const renderCarriedSlot = (
  carried: SlotElement,
  context: Pick<RenderContext, 'model' | 'interaction'>,
): void => {
  const { model, interaction } = context
  const carriedView = model.carried
  updateCarriedSlot(carried, carriedView)
  writeCarriedAttributes(carried, interaction, carriedView)
}

const updateCraftingOutputSlot = (
  craftingState: AttributeCell,
  output: SlotElement,
  context: Pick<RenderContext, 'model' | 'interaction'>,
): void => {
  const { model, interaction } = context
  writeAttribute(craftingState, CRAFTING_STATE[model.crafting.kind])
  // Read-only projection draws an output square only for `match`. Interactive
  // Projection also exposes `no-match` as a disabled target; `unknown` stays
  // Absent because an empty square would incorrectly claim a definitive answer.
  const showOutput =
    model.crafting.kind === 'match' ||
    (typeof interaction !== 'undefined' && model.crafting.kind === 'no-match')
  setSlotHidden(output, !showOutput)
  if (model.crafting.kind === 'match') {
    updateSlotElement(output, model.crafting.output)
  } else if (model.crafting.kind === 'no-match') {
    updateSlotElement(output, EMPTY_OUTPUT)
  }
}

const applyReadOnlyCraftingOutputLabel = (output: SlotElement, crafting: InteractiveCraftingOutcome): void => {
  const label = outputLabel(crafting, uiLanguageForElement(output.root))
  if (output.role.previous === 'button') {
    applyButtonView(output)
  }
  writeLocalizedAttribute(output.ariaLabel, label.key, label.values)
}

const applyInteractiveCraftingOutputButtonView = (
  output: SlotElement,
  crafting: InteractiveCraftingOutcome,
  focused: InventoryInteractionTarget | undefined,
): void => {
  const outputFocused = focused?.kind === 'crafting-output'
  setSlotFocusTarget(output, { group: 'crafting-output', index: SOLE_SLOT_INDEX })
  applyButtonView(output, {
    disabled: crafting.kind === 'no-match',
    focused: outputFocused,
    label: '',
    localizedLabel: outputLabel(crafting, uiLanguageForElement(output.root)),
    tabStop: outputFocused,
  })
}

const applyCraftingOutputButtonView = (output: SlotElement, context: RenderContext): void => {
  const { model, interaction, focused } = context
  if (model.crafting.kind === 'unknown') {
    applyButtonView(output)
    return
  }
  if (typeof interaction === 'undefined') {
    applyReadOnlyCraftingOutputLabel(output, model.crafting)
    return
  }
  applyInteractiveCraftingOutputButtonView(output, model.crafting, focused)
}

const renderCraftingOutput = (elements: CraftingElements, context: RenderContext): void => {
  updateCraftingOutputSlot(elements.craftingState, elements.output, context)
  applyCraftingOutputButtonView(elements.output, context)
}

const renderInventoryView = ({ elements, model, interaction, actions }: InventoryRenderInput):
Result.Result<void, InvalidInventoryViewInput> => {
  const invalidInput = invalidInventoryViewInput(model, interaction)
  if (typeof invalidInput !== 'undefined') {
    return Result.fail(invalidInput)
  }
  const focused = resolveFocusedTarget(model, interaction)
  const context: RenderContext = { actions, elements, focused, interaction, model }
  renderRegions(elements, context)
  renderCarriedSlot(elements.carried, context)
  writeText(elements.statusText, interaction?.status ?? '')
  renderCraftingOutput(elements, context)
  return Result.void
}

const wireCraftingOutput = (
  output: SlotElement,
  actions: InventoryViewActions | undefined,
): void => {
  const outputTarget: InventoryInteractionTarget = { kind: 'crafting-output' }
  if (typeof actions?.onActivate === 'function') {
    output.root.addEventListener('click', (event) => {
      actions.onActivate?.(outputTarget, 'shiftKey' in event && event.shiftKey === true)
    })
  }
  if (typeof actions?.onFocusChange === 'function') {
    output.root.addEventListener('focus', () => actions.onFocusChange?.(outputTarget))
  }
}

const buildInventoryRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'inventory')
  declarePalette(root)
  // SURFACE, not SCRIM. `domain/palette.ts`: a modal panel 「has no reason to let
  // The world through, and a translucent one would drag the same
  // Worst-case-world reasoning into every screen instead of just the HUD」.
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const buildInventoryViewElements = (
  factory: DomElementFactory,
  parent: DomElement,
  actions: InventoryViewActions | undefined,
): InventoryViewElements => {
  const root = buildInventoryRoot(factory, parent)
  const regions = new Map<RegionId, RegionElement>()
  const carried = buildCarriedSlot(factory, root)
  const { craftingState, output } = buildCraftingOutput(factory, root)
  wireCraftingOutput(output, actions)
  const statusText = buildStatusText(factory, root)
  return {
    carried,
    craftingState,
    factory,
    output,
    regions,
    root,
    statusText,
  }
}

export const createInventoryView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: InventoryViewActions,
): InventoryView => {
  const elements = buildInventoryViewElements(factory, parent, actions)
  return {
    render: (
      model: InventoryViewModel,
      interaction?: InventoryInteractionView,
    ): Result.Result<void, InvalidInventoryViewInput> => {
      if (!isInventoryViewModelShape(model)) {
        return Result.fail({ _tag: 'InvalidInventoryViewInput', field: 'model' })
      }
      return renderInventoryView({ actions, elements, interaction, model })
    },
    root: elements.root,
  }
}
