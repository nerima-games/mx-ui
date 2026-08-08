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
} from './dom-write'
import type {
  CraftingOutcomeView,
  InventoryViewModel,
  RegionId,
  SlotRegion,
} from '../domain/inventory-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import { PALETTE_VAR, declarePalette } from './palette-css'
import {
  type SlotButtonView,
  type SlotElement,
  createSlotElement,
  hideSlotElementAtMount,
  setSlotButtonView,
  setSlotHidden,
  updateSlotElement,
} from './slot-element'
import type { SlotView } from '../domain/hud-view-model'

type RegionElement = {
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
  ) => void
}

export type InventoryInteractionTarget =
  | { readonly kind: 'slot'; readonly region: RegionId; readonly index: number }
  | { readonly kind: 'crafting-output' }

/** Host-owned input state that mx-ui projects without attaching listeners. */
export type InventoryInteractionView = {
  readonly focused: InventoryInteractionTarget
  readonly status: string
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
  const grid = buildRegionGrid(factory, root)
  const note = buildRegionNote(factory, root)

  const region: RegionElement = {
    columns: styleCell(grid, 'grid-template-columns'),
    grid,
    gridHidden: attributeCell(grid, 'hidden'),
    hidden: attributeCell(root, 'hidden'),
    noteHidden: attributeCell(note, 'hidden'),
    noteText: textCell(note),
    root,
    slots: [],
    stateFlag: attributeCell(root, 'data-region-state'),
  }
  region.noteHidden.previous = ''
  return region
}

const renderUnknownRegion = (region: RegionElement, why: string): void => {
  writeHidden(region.gridHidden, true)
  writeHidden(region.noteHidden, false)
  writeText(region.noteText, why)
  for (const slot of region.slots) {
    applyButtonView(slot)
  }
}

type RegionElements = {
  readonly factory: DomElementFactory
  readonly region: RegionElement
}

const ensureRegionSlotCount = (elements: RegionElements, slotCount: number): void => {
  const { factory, region } = elements
  while (region.slots.length < slotCount) {
    const slot = createSlotElement(factory, region.slots.length)
    region.grid.appendChild(slot.root)
    region.slots.push(slot)
  }
}

const slotLabel = (
  region: RegionId,
  index: number,
  item: Pick<SlotView, 'itemId' | 'countLabel'>,
): string => {
  const displayIndex = index + ONE
  if (typeof item.itemId === 'undefined') {
    return `${region} slot ${String(displayIndex)}, empty`
  }
  return `${region} slot ${String(displayIndex)}, ${item.itemId}, ${item.countLabel ?? '1'}`
}

type SlotIdentity = {
  readonly regionId: RegionId
  readonly index: number
  readonly view: SlotView
}

const buildFocusedSlotButtonView = (
  identity: SlotIdentity,
  focused: InventoryInteractionTarget,
): SlotButtonView => {
  const { regionId, index, view } = identity
  const isFocused = focused.kind === 'slot' && focused.region === regionId && focused.index === index
  return {
    disabled: false,
    focused: isFocused,
    label: slotLabel(regionId, index, view),
    tabStop: isFocused,
  }
}

type SlotRenderContext = {
  readonly index: number
  readonly view: SlotView | undefined
  readonly regionId: RegionId
  readonly focused: InventoryInteractionTarget | undefined
}

const renderKnownRegionSlot = (slot: SlotElement, context: SlotRenderContext): void => {
  const { index, view, regionId, focused } = context
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
  if (typeof focused === 'undefined') {
    applyButtonView(slot)
  } else {
    applyButtonView(slot, buildFocusedSlotButtonView({ index, regionId, view }, focused))
  }
}

const renderKnownRegion = (
  elements: RegionElements,
  model: Extract<SlotRegion, { readonly kind: 'slots' }>,
  focused: InventoryInteractionTarget | undefined,
): void => {
  const { region } = elements
  writeHidden(region.gridHidden, false)
  writeHidden(region.noteHidden, true)
  writeStyle(region.columns, `repeat(${String(model.columns)}, 1fr)`)
  ensureRegionSlotCount(elements, model.slots.length)

  // Over the array; see `caption-view.ts`'s note. `model.slots` keeps its check
  // Because it is the other array and is routinely SHORTER — `region.slots` only
  // Ever grows, so a model with fewer slots than a previous one leaves surplus
  // Squares that have to be hidden rather than left showing stale items.
  for (const [index, slot] of region.slots.entries()) {
    renderKnownRegionSlot(slot, { focused, index, regionId: model.id, view: model.slots[index] })
  }
}

const renderRegion = (
  elements: RegionElements,
  model: SlotRegion,
  focused: InventoryInteractionTarget | undefined,
): void => {
  const { region } = elements
  writeHidden(region.hidden, false)
  writeAttribute(region.stateFlag, model.kind)

  if (model.kind === 'unknown') {
    renderUnknownRegion(region, model.why)
    return
  }
  renderKnownRegion(elements, model, focused)
}

const outputLabel = (crafting: CraftingOutcomeView): string => {
  if (crafting.kind === 'match') {
    // `InventoryViewModel` is a published type with no canonical constructor.
    // `inventoryViewModel` always upholds this invariant: `empty` false implies `itemId` defined.
    // A hand-built `crafting.output` can disagree with it.
    // `countLabel`'s own `?? '1'` fallback is genuinely reachable for a match of one.
    return `Crafting output, ${crafting.output.itemId ?? 'empty'}, ${crafting.output.countLabel ?? '1'}`
  }
  return 'Crafting output, no matching recipe'
}

const carriedItemLabel = (carriedView: SlotView | undefined): string => {
  if (typeof carriedView === 'undefined') {
    return 'Carried item, empty'
  }
  // Same published-type reasoning as `outputLabel` above.
  // A hand-built `InventoryViewModel` can hand this a `carriedView` whose `itemId` disagrees with
  // `empty`. `countLabel`'s own `?? '1'` fallback is genuinely reachable for a carried stack of one.
  return `Carried item, ${carriedView.itemId ?? 'empty'}, ${carriedView.countLabel ?? '1'}`
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
  readonly model: InventoryViewModel
  readonly interaction: InventoryInteractionView | undefined
  readonly focused: InventoryInteractionTarget | undefined
}

const syncModelRegions = (
  elements: Pick<InventoryViewElements, 'factory' | 'root' | 'regions'>,
  model: InventoryViewModel,
  focused: InventoryInteractionTarget | undefined,
): ReadonlySet<RegionId> => {
  const { factory, root, regions } = elements
  const seen = new Set<RegionId>()
  for (const regionModel of model.regions) {
    seen.add(regionModel.id)
    const existing = regions.get(regionModel.id)
    const element = existing ?? createRegion(factory, root, regionModel.id)
    if (typeof existing === 'undefined') {
      regions.set(regionModel.id, element)
    }
    renderRegion({ factory, region: element }, regionModel, focused)
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
  context: Pick<RenderContext, 'model' | 'focused'>,
): void => {
  const { model, focused } = context
  const seen = syncModelRegions(elements, model, focused)
  hideUnseenRegions(elements.regions, seen)
}

const updateCarriedSlot = (carried: SlotElement, carriedView: SlotView | undefined): void => {
  setSlotHidden(carried, typeof carriedView === 'undefined')
  if (typeof carriedView !== 'undefined') {
    updateSlotElement(carried, carriedView)
  }
}

const writeCarriedAttributes = (
  carried: SlotElement,
  interaction: InventoryInteractionView | undefined,
  carriedView: SlotView | undefined,
): void => {
  if (typeof interaction === 'undefined') {
    writeOptionalAttribute(carried.role)
    writeOptionalAttribute(carried.ariaLive)
    writeOptionalAttribute(carried.ariaLabel)
  } else {
    writeOptionalAttribute(carried.role, 'status')
    writeOptionalAttribute(carried.ariaLive, 'polite')
    writeOptionalAttribute(carried.ariaLabel, carriedItemLabel(carriedView))
  }
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

const applyCraftingOutputButtonView = (output: SlotElement, context: RenderContext): void => {
  const { model, interaction, focused } = context
  const outputFocused = focused?.kind === 'crafting-output'
  if (typeof interaction === 'undefined' || model.crafting.kind === 'unknown') {
    applyButtonView(output)
  } else {
    applyButtonView(output, {
      disabled: model.crafting.kind === 'no-match',
      focused: outputFocused,
      label: outputLabel(model.crafting),
      tabStop: outputFocused,
    })
  }
}

const renderCraftingOutput = (elements: CraftingElements, context: RenderContext): void => {
  updateCraftingOutputSlot(elements.craftingState, elements.output, context)
  applyCraftingOutputButtonView(elements.output, context)
}

const renderInventoryView = (
  elements: InventoryViewElements,
  model: InventoryViewModel,
  interaction: InventoryInteractionView | undefined,
): void => {
  const focused = resolveFocusedTarget(model, interaction)
  const context: RenderContext = { focused, interaction, model }
  renderRegions(elements, context)
  renderCarriedSlot(elements.carried, context)
  writeText(elements.statusText, interaction?.status ?? '')
  renderCraftingOutput(elements, context)
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
): InventoryViewElements => {
  const root = buildInventoryRoot(factory, parent)
  const regions = new Map<RegionId, RegionElement>()
  const carried = buildCarriedSlot(factory, root)
  const { craftingState, output } = buildCraftingOutput(factory, root)
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
): InventoryView => {
  const elements = buildInventoryViewElements(factory, parent)
  return {
    render: (model: InventoryViewModel, interaction?: InventoryInteractionView): void =>
      renderInventoryView(elements, model, interaction),
    root: elements.root,
  }
}
