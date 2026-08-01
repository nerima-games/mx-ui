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
import type {
  CraftingOutcomeView,
  InventoryViewModel,
  RegionId,
  SlotRegion,
} from '../domain/inventory-view-model'
import type { SlotView } from '../domain/hud-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeStyle,
  writeText,
  type AttributeCell,
  type StyleCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'
import {
  createSlotElement,
  hideSlotElementAtMount,
  setSlotButtonView,
  setSlotHidden,
  updateSlotElement,
  type SlotElement,
} from './slot-element'

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

const EMPTY_OUTPUT: SlotView = {
  index: 0,
  itemId: undefined,
  countLabel: undefined,
  empty: true,
  selected: false,
  durabilityPercent: undefined,
}

const createRegion = (
  factory: DomElementFactory,
  parent: DomElement,
  id: RegionId,
): RegionElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'region')
  root.setAttribute('data-region', id)
  parent.appendChild(root)

  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'region-grid')
  grid.style.setProperty('display', 'grid')
  root.appendChild(grid)

  const note = factory.createElement('p')
  note.setAttribute('data-mx-ui', 'region-note')
  note.setAttribute('hidden', '')
  // INK_FAINT: the note is for the developer, not the player
  // (`SlotRegion.why`: 「Shown to the developer, not to the player」). It is still
  // a guarded text token, so "for the developer" does not mean "unreadable".
  note.style.setProperty('color', PALETTE_VAR.inkFaint)
  root.appendChild(note)

  const region: RegionElement = {
    root,
    grid,
    hidden: attributeCell(root, 'hidden'),
    stateFlag: attributeCell(root, 'data-region-state'),
    gridHidden: attributeCell(grid, 'hidden'),
    noteHidden: attributeCell(note, 'hidden'),
    noteText: textCell(note),
    columns: styleCell(grid, 'grid-template-columns'),
    slots: [],
  }
  region.noteHidden.previous = ''
  return region
}

const renderRegion = (
  factory: DomElementFactory,
  region: RegionElement,
  model: SlotRegion,
  focused: InventoryInteractionTarget | undefined,
): void => {
  writeHidden(region.hidden, false)
  writeAttribute(region.stateFlag, model.kind)

  if (model.kind === 'unknown') {
    writeHidden(region.gridHidden, true)
    writeHidden(region.noteHidden, false)
    writeText(region.noteText, model.why)
    for (const slot of region.slots) {
      setSlotButtonView(slot, undefined)
    }
    return
  }

  writeHidden(region.gridHidden, false)
  writeHidden(region.noteHidden, true)
  writeStyle(region.columns, `repeat(${String(model.columns)}, 1fr)`)

  while (region.slots.length < model.slots.length) {
    const slot = createSlotElement(factory, region.slots.length)
    region.grid.appendChild(slot.root)
    region.slots.push(slot)
  }

  // Over the array; see `caption-view.ts`'s note. `model.slots` keeps its check
  // because it is the other array and is routinely SHORTER — `region.slots` only
  // ever grows, so a model with fewer slots than a previous one leaves surplus
  // squares that have to be hidden rather than left showing stale items.
  for (const [index, slot] of region.slots.entries()) {
    const view = model.slots[index]
    if (view === undefined) {
      setSlotHidden(slot, true)
      setSlotButtonView(slot, undefined)
      continue
    }
    setSlotHidden(slot, false)
    // `undefined`, always — see the header. The mapping from mc-sim's absolute
    // indices to these region-local ones is not published, and inventing it here
    // is the one thing this repository must not do.
    updateSlotElement(slot, view, undefined)
    const isFocused =
      focused?.kind === 'slot' && focused.region === model.id && focused.index === index
    setSlotButtonView(
      slot,
      focused === undefined
        ? undefined
        : {
            label: slotLabel(model.id, index, view.itemId, view.countLabel),
            disabled: false,
            tabStop: isFocused,
            focused: isFocused,
          },
    )
  }
}

const slotLabel = (
  region: RegionId,
  index: number,
  itemId: string | undefined,
  count: string | undefined,
): string =>
  itemId === undefined
    ? `${region} slot ${String(index + 1)}, empty`
    : `${region} slot ${String(index + 1)}, ${itemId}, ${count ?? '1'}`

const outputLabel = (crafting: CraftingOutcomeView): string =>
  crafting.kind === 'match'
    ? `Crafting output, ${crafting.output.itemId ?? 'empty'}, ${crafting.output.countLabel ?? '1'}`
    : 'Crafting output, no matching recipe'

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
      requested.index >= 0 &&
      requested.index < region.slots.length
    ) {
      return requested
    }
  }

  const firstRegion = model.regions.find(
    (region): region is Extract<SlotRegion, { readonly kind: 'slots' }> =>
      region.kind === 'slots' && region.slots.length > 0,
  )
  return firstRegion === undefined
    ? { kind: 'crafting-output' }
    : { kind: 'slot', region: firstRegion.id, index: 0 }
}

export const createInventoryView = (
  factory: DomElementFactory,
  parent: DomElement,
): InventoryView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'inventory')
  declarePalette(root)
  // SURFACE, not SCRIM. `domain/palette.ts`: a modal panel 「has no reason to let
  // the world through, and a translucent one would drag the same
  // worst-case-world reasoning into every screen instead of just the HUD」.
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const regions = new Map<RegionId, RegionElement>()

  const carried = createSlotElement(factory, 0)
  carried.root.setAttribute('data-mx-ui', 'carried')
  root.appendChild(carried.root)
  hideSlotElementAtMount(carried)

  const crafting = factory.createElement('div')
  crafting.setAttribute('data-mx-ui', 'crafting-outcome')
  // SURFACE_RAISED — a panel on a panel, which is what the output square is.
  crafting.style.setProperty('background-color', PALETTE_VAR.surfaceRaised)
  root.appendChild(crafting)
  const craftingState = attributeCell(crafting, 'data-crafting-state')

  const output = createSlotElement(factory, 0)
  output.root.setAttribute('data-mx-ui', 'crafting-output')
  crafting.appendChild(output.root)
  hideSlotElementAtMount(output)

  const status = factory.createElement('div')
  status.setAttribute('data-mx-ui', 'inventory-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-atomic', 'true')
  root.appendChild(status)
  const statusText = textCell(status)

  return {
    root,
    render: (model: InventoryViewModel, interaction?: InventoryInteractionView): void => {
      const focused =
        interaction === undefined ? undefined : validFocusTarget(model, interaction.focused)
      const seen = new Set<RegionId>()
      for (const regionModel of model.regions) {
        seen.add(regionModel.id)
        const existing = regions.get(regionModel.id)
        const element = existing ?? createRegion(factory, root, regionModel.id)
        if (existing === undefined) {
          regions.set(regionModel.id, element)
        }
        renderRegion(factory, element, regionModel, focused)
      }
      for (const [id, element] of regions) {
        if (!seen.has(id)) {
          writeHidden(element.hidden, true)
          for (const slot of element.slots) {
            setSlotButtonView(slot, undefined)
          }
        }
      }

      const carriedView = model.carried
      setSlotHidden(carried, carriedView === undefined)
      if (carriedView !== undefined) {
        updateSlotElement(carried, carriedView, undefined)
      }
      writeAttribute(carried.role, interaction === undefined ? undefined : 'status')
      writeAttribute(carried.ariaLive, interaction === undefined ? undefined : 'polite')
      writeAttribute(
        carried.ariaLabel,
        interaction === undefined
          ? undefined
          : carriedView === undefined
            ? 'Carried item, empty'
            : `Carried item, ${carriedView.itemId ?? 'empty'}, ${carriedView.countLabel ?? '1'}`,
      )
      writeText(statusText, interaction?.status ?? '')

      writeAttribute(craftingState, CRAFTING_STATE[model.crafting.kind])
      // Read-only projection draws an output square only for `match`. Interactive
      // projection also exposes `no-match` as a disabled target; `unknown` stays
      // absent because an empty square would incorrectly claim a definitive answer.
      const showOutput =
        model.crafting.kind === 'match' ||
        (interaction !== undefined && model.crafting.kind === 'no-match')
      setSlotHidden(output, !showOutput)
      if (model.crafting.kind === 'match') {
        updateSlotElement(output, model.crafting.output, undefined)
      } else if (model.crafting.kind === 'no-match') {
        updateSlotElement(output, EMPTY_OUTPUT, undefined)
      }
      const outputFocused = focused?.kind === 'crafting-output'
      setSlotButtonView(
        output,
        interaction === undefined || model.crafting.kind === 'unknown'
          ? undefined
          : {
              label: outputLabel(model.crafting),
              disabled: model.crafting.kind === 'no-match',
              tabStop: outputFocused,
              focused: outputFocused,
            },
      )
    },
  }
}
