/**
 * THE slot element — hotbar, inventory grid, armour, offhand, crafting.
 *
 * One DOM projection of `SlotView`, for the same reason there is one `slotView`
 * function. `domain/hud-view-model.ts` says it plainly: 「There is one answer in
 * this repository to "what does the screen show for a slot", and DN-UI-7c is the
 * record of what a second one costs: the `empty` guard cleared two of three
 * fields, the DOM layer drew a durability bar under an empty slot」.
 *
 * That bug was about a DOM layer that did not exist yet. It exists now, and it
 * is written the way DN-UI-7c predicted it would be — `durabilityPercent`
 * present means draw the bar — so the derivation's guard is the only thing
 * standing between a broken tool and a bar under an empty square. A second copy
 * of this file for the inventory screen would put that guard back in play once
 * more, which is why the inventory screen imports this one.
 *
 * Escape: no listener, no `tabindex`, no focus management. A slot is a thing to
 * look at here; making it a thing to press means owning keys, and DN-UI-4 says
 * who owns keys.
 */
import type { SlotView } from '../domain/hud-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  percentCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writePercent,
  writeStyle,
  writeText,
  type AttributeCell,
  type PercentCell,
  type StyleCell,
  type TextCell,
} from './dom-write'
import { PALETTE_VAR } from './palette-css'

/**
 * Below this, a durability bar turns from `DURABILITY_HIGH` to `DURABILITY_LOW`.
 *
 * A PRESENTATION threshold, so it lives here rather than in `domain/`: mc-sim
 * reports a ratio and has no opinion about when a tool is "nearly broken". The
 * number is the reference's own — vanilla flashes a tool's durability bar red in
 * the last quarter — and it is a constant rather than a literal because the two
 * colours it selects between are a `CRITICAL_PAIR` in `domain/palette.ts`, so
 * the moment of the switch is the moment that pair's separation has to hold.
 */
export const DURABILITY_LOW_PERCENT = 25

/** Unselected border weight, in CSS pixels. */
const BORDER_WEIGHT = '2px'
/**
 * Selected border weight — the `weight` distinguisher.
 *
 * `CRITICAL_PAIRS` declares slot-selected / slot-border as
 * `alsoDistinguishedBy: ['weight']`, and G3 in `domain/palette.ts` is explicit
 * that declaring a non-colour channel is 「belt AND braces」 rather than an
 * excuse. This is the DOM half of that declaration: the pair is separated by
 * colour AND by a pixel of border, so a player who cannot see the colour
 * difference can still see which slot is selected.
 */
const SELECTED_BORDER_WEIGHT = '3px'

export type SlotElement = {
  readonly root: DomElement
  readonly hiddenFlag: AttributeCell
  readonly itemText: TextCell
  readonly countText: TextCell
  readonly emptyFlag: AttributeCell
  readonly mergeableFlag: AttributeCell
  readonly selectedFlag: AttributeCell
  readonly borderColor: StyleCell
  readonly borderWeight: StyleCell
  readonly durabilityHidden: AttributeCell
  readonly durabilityWidth: PercentCell
  readonly durabilityColor: StyleCell
}

/**
 * Build one slot, styled entirely from tokens.
 *
 * Every `setProperty` here happens once. The colours are `var(...)` references,
 * so the token VALUES live on the mounted root (see `application/palette-css.ts`)
 * and appear nowhere in this subtree.
 */
export const createSlotElement = (factory: DomElementFactory, index: number): SlotElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'slot')
  root.setAttribute('data-slot-index', String(index))
  root.style.setProperty('position', 'relative')
  root.style.setProperty('background-color', PALETTE_VAR.slotFill)
  root.style.setProperty('border-style', 'solid')

  const item = factory.createElement('span')
  item.setAttribute('data-mx-ui', 'slot-item')
  item.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(item)

  const count = factory.createElement('span')
  count.setAttribute('data-mx-ui', 'slot-count')
  count.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(count)

  const durabilityTrack = factory.createElement('div')
  durabilityTrack.setAttribute('data-mx-ui', 'slot-durability')
  durabilityTrack.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  root.appendChild(durabilityTrack)

  const durabilityFill = factory.createElement('div')
  durabilityFill.setAttribute('data-mx-ui', 'slot-durability-fill')
  durabilityTrack.appendChild(durabilityFill)

  const slot: SlotElement = {
    root,
    hiddenFlag: attributeCell(root, 'hidden'),
    itemText: textCell(item),
    countText: textCell(count),
    emptyFlag: attributeCell(root, 'data-empty'),
    mergeableFlag: attributeCell(root, 'data-mergeable'),
    selectedFlag: attributeCell(root, 'data-selected'),
    borderColor: styleCell(root, 'border-color'),
    borderWeight: styleCell(root, 'border-width'),
    durabilityHidden: attributeCell(durabilityTrack, 'hidden'),
    durabilityWidth: percentCell(durabilityFill, 'width'),
    durabilityColor: styleCell(durabilityFill, 'background-color'),
  }

  return slot
}

/**
 * Hide a slot at MOUNT time and tell its cell so.
 *
 * The alternative — leaving the cell believing the element is visible — makes
 * the very first `writeHidden(…, true)` a redundant write, which is exactly the
 * kind of drift the "an unchanged re-render mutates nothing" test exists to
 * catch, arriving from the construction side where that test cannot see it.
 */
export const hideSlotElementAtMount = (slot: SlotElement): void => {
  slot.root.setAttribute('hidden', '')
  slot.hiddenFlag.previous = ''
}

/** Show or hide a built slot, diffed. */
export const setSlotHidden = (slot: SlotElement, hidden: boolean): void => {
  writeHidden(slot.hiddenFlag, hidden)
}

/**
 * Project a `SlotView` onto a built slot. Diffed field by field.
 *
 * `mergeable` is `undefined` when mc-sim has not answered — `MergeTargets` with
 * `kind: 'unknown'`. It is passed as three-valued rather than as a boolean for
 * the reason `domain/inventory-view-model.ts` gives: 「The screen must highlight
 * nothing rather than guess」, and `false` and "not answered" produce the same
 * screen only by coincidence today.
 */
export const updateSlotElement = (
  slot: SlotElement,
  view: SlotView,
  mergeable: boolean | undefined,
): void => {
  writeText(slot.itemText, view.itemId ?? '')
  writeText(slot.countText, view.countLabel ?? '')
  writeAttribute(slot.emptyFlag, view.empty ? '' : undefined)
  writeAttribute(slot.selectedFlag, view.selected ? '' : undefined)
  writeAttribute(slot.mergeableFlag, mergeable === true ? '' : undefined)

  writeStyle(slot.borderColor, view.selected ? PALETTE_VAR.slotSelected : PALETTE_VAR.slotBorder)
  writeStyle(slot.borderWeight, view.selected ? SELECTED_BORDER_WEIGHT : BORDER_WEIGHT)

  const durability = view.durabilityPercent
  // DN-UI-7c, from the other side: this is the "obvious way to write it" the
  // derivation's `empty` guard was tightened to survive. An empty slot whose
  // snapshot still carried durability would draw a bar here, under nothing.
  writeHidden(slot.durabilityHidden, durability === undefined)
  if (durability === undefined) {
    return
  }
  writePercent(slot.durabilityWidth, durability)
  writeStyle(
    slot.durabilityColor,
    durability <= DURABILITY_LOW_PERCENT ? PALETTE_VAR.durabilityLow : PALETTE_VAR.durabilityHigh,
  )
}
