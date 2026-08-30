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
 * ---------------------------------------------------------------------------
 * A slot is now a thing to LOOK AT and to REACH — but still not to press
 * ---------------------------------------------------------------------------
 *
 * This header used to say 「no listener, no `tabindex`, no focus management」, and
 * two thirds of that survive. The `tabindex` was wrong, and `FOCUS_RING` sitting
 * in `GUARDED_TOKENS` with nothing referencing it was the evidence: a token whose
 * guarantee is measured and whose colour reaches no element is a guarantee about
 * numbers (`test/palette-css.test.ts`, DN-UI-13g).
 *
 * The three things are separable, and only one of them is mc-render's:
 *
 *   | thing                                  | verb needed          | owner     |
 *   | -------------------------------------- | -------------------- | --------- |
 *   | a slot CAN hold focus                  | `setAttribute`       | mx-ui     |
 *   | what focus LOOKS like                  | `style.setProperty`  | mx-ui     |
 *   | the keystroke that MOVES focus         | `addEventListener`   | mc-render |
 *   | telling mx-ui where focus went         | —                    | mc-render |
 *
 * The first two need nothing that is not already in `application/dom-surface.ts`,
 * which is the whole argument: a focus RING is a rendering concern. The surface
 * was not widened by a single member to build it — and specifically it did NOT
 * grow `focus()` or `addEventListener`, which are the two verbs that would let
 * this file move focus or observe it. Both are input, and input is mc-render's
 * (plan.md §2.3-2) with the decision at frame level (DN-UI-4).
 *
 * Pressing is still not here. An interactive host may ask this projection to
 * expose button semantics, but activation still needs a key or pointer event and
 * that half has not moved into mx-ui.
 */
import {
  type AttributeCell,
  type PercentCell,
  type StyleCell,
  type TextCell,
  attributeCell,
  percentCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writePercent,
  writeStyle,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { PALETTE_VAR } from './palette-css.js'
import type { SlotView } from '../domain/hud-view-model.js'

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

/**
 * The keyboard focus ring, which is TWO widths as well as two colours.
 *
 * `domain/palette.ts` on `FOCUS_RING`: 「A single-colour ring has to contrast with
 * whatever it lands on and cannot, so the pair carries itself: gold against
 * near-black is 10.2:1 in every mode, on any background, because the background
 * is not part of the comparison」. `CRITICAL_PAIRS` declares
 * `focus ring / focus ring shadow` as `alsoDistinguishedBy: ['weight']`, and this
 * is the DOM half of that declaration: three pixels of gold inside five pixels of
 * near-black, so the two are told apart by thickness and not only by colour.
 *
 * The gold width is the reference's:
 * `<reference-impl>/packages/presentation/menu/main-menu-styles.ts:90` draws
 * `outline: 3px solid #ffe090` over an `rgba(20, 29, 25, .94)` ring.
 */
export const FOCUS_RING_WIDTH = '3px'
export const FOCUS_RING_SHADOW_WIDTH = '5px'

/**
 * THE SLOT'S FLOOR, and it was found by a browser rather than reasoned into.
 *
 * `apps/browser-harness/` mounted this file against a real `Document` and
 * measured what a slot actually becomes. At 390px wide it is **43.3 x 4**, and
 * at 320px it is 35.5 x 4. A slot's two spans are empty until mc-sim supplies an
 * item, so the content box is zero tall and the whole four pixels are the border
 * declared above.
 *
 * Three things this repository already claims stop being true at that size, and
 * NONE of them is visible to `test/fake-dom.ts`, because the fake has no layout:
 *
 *   1. **The `weight` distinguisher degenerates.** `domain/palette.ts` declares
 *      `slot selected / slot border` as `alsoDistinguishedBy: ['weight']`, and
 *      G3 is explicit that the non-colour channel is 「belt AND braces」 rather
 *      than decoration. At 4px tall the border IS the slot: 2px against 3px is
 *      not a heavier frame around a square, it is a bar that got 50% thicker.
 *   2. **The focus ring has no area.** It is an `inset: 0` overlay, and an
 *      absolutely positioned box resolves against the PADDING box — which is
 *      zero tall. Measured: `386 x 0`. `FOCUS_RING` is in `GUARDED_TOKENS` and
 *      `test/accessibility-gate.test.ts` confirms it reaches an element, but
 *      「reaches an element」 and 「is drawn as a ring」 are different sentences and
 *      only the second one is what a player navigating by keyboard needs.
 *   3. **The one tab stop in this repository is a 4px target.** WCAG 2.2 §2.5.8
 *      (Target Size, Minimum) asks for 24 x 24 CSS pixels for anything operable
 *      by pointer. A slot is not activatable (see this file's header) but it IS
 *      reachable and it IS the thing a player aims at on a touch screen.
 *
 * ---------------------------------------------------------------------------
 * WHY 24 AND NOT THE 48 `docs/e2e-triage.md` #34 NAMES
 * ---------------------------------------------------------------------------
 *
 * 48 is the reference's number for `[data-touch-control]` — the free-standing
 * on-screen buttons in `mobile-touch-controls.e2e.ts`. It is Android's touch
 * guidance for a button, and it is **arithmetically impossible for a hotbar**:
 * nine slots at 48px need 432px and the narrowest viewport the triage names is
 * 320. A floor nobody can satisfy is a floor that gets deleted.
 *
 * 24 is the number of the standard that actually governs this element, it is
 * cited rather than chosen, and it leaves the hotbar fitting 320px with room
 * (35.5 x 24). It is a FLOOR and not a size: a host is free to make slots
 * larger, and `min-*` rather than `width`/`height` is what keeps that true.
 *
 * ---------------------------------------------------------------------------
 * AND WHY THIS IS mx-ui's TO DECLARE AT ALL
 * ---------------------------------------------------------------------------
 *
 * The tempting answer is 「layout is the host's; mx-ui hands over elements」. It
 * is not this repository's answer, and the evidence is in this repository:
 * `application/inventory-view.ts:104` declares `display: grid` and writes
 * `grid-template-columns` per region, and `application/crosshair-view.ts`
 * declares an explicit 20px box. mx-ui has already taken responsibility for the
 * geometry that carries meaning. The hotbar's vertical extent was simply the
 * axis nobody had a reason to write down, because nothing headless could ask.
 *
 * Every write is at MOUNT and none is on the frame path.
 */
export const SLOT_TARGET_MIN_SIZE = '24px'

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
  /** `'0'` for the group's single tab stop, `'-1'` for every other member. */
  readonly tabStop: AttributeCell
  readonly focusRingHidden: AttributeCell
  readonly role: AttributeCell
  readonly ariaLabel: AttributeCell
  readonly ariaDisabled: AttributeCell
  readonly ariaLive: AttributeCell
}

export type SlotButtonView = {
  readonly label: string
  readonly disabled: boolean
  readonly tabStop: boolean
  readonly focused: boolean
}

/**
 * Build one slot, styled entirely from tokens.
 *
 * Every `setProperty` here happens once. The colours are `var(...)` references,
 * so the token VALUES live on the mounted root (see `application/palette-css.ts`)
 * and appear nowhere in this subtree.
 */
const createSlotRoot = (factory: DomElementFactory, index: number): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'slot')
  root.setAttribute('data-slot-index', String(index))
  root.style.setProperty('position', 'relative')
  root.style.setProperty('background-color', PALETTE_VAR.slotFill)
  root.style.setProperty('border-style', 'solid')
  // The floor, not a size. See `SLOT_TARGET_MIN_SIZE`: `min-*` leaves a host
  // Free to make slots bigger, and a slot whose content box is zero tall takes
  // Its focus ring and its `weight` distinguisher down with it.
  root.style.setProperty('min-width', SLOT_TARGET_MIN_SIZE)
  root.style.setProperty('min-height', SLOT_TARGET_MIN_SIZE)
  return root
}

const createSlotItem = (factory: DomElementFactory, root: DomElement): TextCell => {
  const item = factory.createElement('span')
  item.setAttribute('data-mx-ui', 'slot-item')
  item.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(item)
  return textCell(item)
}

const createSlotCount = (factory: DomElementFactory, root: DomElement): TextCell => {
  const count = factory.createElement('span')
  count.setAttribute('data-mx-ui', 'slot-count')
  count.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(count)
  return textCell(count)
}

type SlotDurabilityElements = {
  readonly hidden: AttributeCell
  readonly width: PercentCell
  readonly color: StyleCell
}

const createSlotDurability = (
  factory: DomElementFactory,
  root: DomElement,
): SlotDurabilityElements => {
  const durabilityTrack = factory.createElement('div')
  durabilityTrack.setAttribute('data-mx-ui', 'slot-durability')
  durabilityTrack.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  root.appendChild(durabilityTrack)

  const durabilityFill = factory.createElement('div')
  durabilityFill.setAttribute('data-mx-ui', 'slot-durability-fill')
  durabilityTrack.appendChild(durabilityFill)

  return {
    color: styleCell(durabilityFill, 'background-color'),
    hidden: attributeCell(durabilityTrack, 'hidden'),
    width: percentCell(durabilityFill, 'width'),
  }
}

// The focus ring, as its OWN element rather than as a border on the slot.
//
// That is not a layout convenience, it is the palette's own sentence made
// Structural: 「"Which slot is the game using" and "which control is the
// Keyboard on" are different questions and a player who is navigating by
// Keyboard is asking both at once」. The game's answer is the slot's border
// (`SLOT_SELECTED` at 3px); the keyboard's answer is this overlay. Two
// Questions, two elements, and both can be visible on two different slots at
// The same moment.
//
// It also keeps both colours off the frame path entirely: they are written here
// And never again, and focusing is one `hidden` toggle.
const styleFocusRingGeometry = (focusRing: DomElement): void => {
  focusRing.style.setProperty('position', 'absolute')
  focusRing.style.setProperty('left', '0')
  focusRing.style.setProperty('top', '0')
  focusRing.style.setProperty('right', '0')
  focusRing.style.setProperty('bottom', '0')
}

const styleFocusRingAppearance = (focusRing: DomElement): void => {
  focusRing.style.setProperty('outline', `${FOCUS_RING_WIDTH} solid ${PALETTE_VAR.focusRing}`)
  focusRing.style.setProperty(
    'box-shadow',
    `0 0 0 ${FOCUS_RING_SHADOW_WIDTH} ${PALETTE_VAR.focusRingShadow}`,
  )
}

const createSlotFocusRing = (factory: DomElementFactory, root: DomElement): AttributeCell => {
  const focusRing = factory.createElement('div')
  focusRing.setAttribute('data-mx-ui', 'slot-focus-ring')
  focusRing.setAttribute('hidden', '')
  styleFocusRingGeometry(focusRing)
  styleFocusRingAppearance(focusRing)
  root.appendChild(focusRing)
  return attributeCell(focusRing, 'hidden')
}

export const createSlotElement = (factory: DomElementFactory, index: number): SlotElement => {
  const root = createSlotRoot(factory, index)
  const item = createSlotItem(factory, root)
  const count = createSlotCount(factory, root)
  const durability = createSlotDurability(factory, root)
  const focusRingHidden = createSlotFocusRing(factory, root)

  const slot: SlotElement = {
    ariaDisabled: attributeCell(root, 'aria-disabled'),
    ariaLabel: attributeCell(root, 'aria-label'),
    ariaLive: attributeCell(root, 'aria-live'),
    borderColor: styleCell(root, 'border-color'),
    borderWeight: styleCell(root, 'border-width'),
    countText: count,
    durabilityColor: durability.color,
    durabilityHidden: durability.hidden,
    durabilityWidth: durability.width,
    emptyFlag: attributeCell(root, 'data-empty'),
    focusRingHidden,
    hiddenFlag: attributeCell(root, 'hidden'),
    itemText: item,
    mergeableFlag: attributeCell(root, 'data-mergeable'),
    role: attributeCell(root, 'role'),
    root,
    selectedFlag: attributeCell(root, 'data-selected'),
    tabStop: attributeCell(root, 'tabindex'),
  }
  // The ring was hidden directly above; tell its cell so, or the first call
  // Issues a redundant write from the construction side, where the 「unchanged
  // Re-render mutates nothing」 test cannot see it. `tabStop` is deliberately NOT
  // Seeded: a slot has no `tabindex` until somebody makes it part of a focus
  // Group, so an inventory slot stays exactly as unfocusable as it was.
  slot.focusRingHidden.previous = ''

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
 * Make this slot the group's single tab stop, or take it out of the tab order.
 *
 * The roving-`tabindex` pattern: exactly one member of a group carries `'0'` and
 * the rest carry `'-1'`, so the whole group is ONE stop in the document's tab
 * order rather than nine, and Tab out of it lands wherever it would have.
 *
 * The property that makes this honest without a listener: the tab stop and the
 * ring are put on the same slot by `createHudView`, so the element the browser
 * NATIVELY focuses on Tab is the element mx-ui has drawn the ring on. They agree
 * by construction, with no key taken and nothing observed.
 *
 * `'-1'` rather than removing the attribute: a `-1` element is still
 * programmatically focusable, which is what lets whoever owns input move focus
 * inside the group without mx-ui rewriting the attribute first.
 */
export const setSlotTabStop = (slot: SlotElement, tabbable: boolean): void => {
  if (tabbable) {
    writeAttribute(slot.tabStop, '0')
  } else {
    writeAttribute(slot.tabStop, '-1')
  }
}

/**
 * Draw, or stop drawing, the keyboard focus ring on this slot.
 *
 * One attribute write, and never a colour: both halves of the ring
 * (`FOCUS_RING` over `FOCUS_RING_SHADOW`) were installed on a dedicated element
 * at mount.
 *
 * Separate from `updateSlotElement` because focus is not part of the view model.
 * `SlotView.selected` is mc-sim's answer to "what is the player holding"; this is
 * the input owner's answer to "where is the keyboard", and threading the second
 * through a projection of the first would merge the two questions
 * `domain/palette.ts` keeps `FOCUS_RING` and `SLOT_SELECTED` apart to keep
 * separate.
 */
export const setSlotKeyboardFocus = (slot: SlotElement, focused: boolean): void => {
  writeHidden(slot.focusRingHidden, !focused)
}

const clearSlotButtonView = (slot: SlotElement): void => {
  writeAttribute(slot.role)
  writeAttribute(slot.ariaLabel)
  writeAttribute(slot.ariaDisabled)
  writeAttribute(slot.tabStop)
  setSlotKeyboardFocus(slot, false)
}

/** Project optional button semantics without taking ownership of activation. */
export const setSlotButtonView = (slot: SlotElement, view?: SlotButtonView): void => {
  if (typeof view === 'undefined') {
    clearSlotButtonView(slot)
    return
  }
  writeAttribute(slot.role, 'button')
  writeAttribute(slot.ariaLabel, view.label)
  writeAttribute(slot.ariaDisabled, String(view.disabled))
  setSlotTabStop(slot, view.tabStop)
  setSlotKeyboardFocus(slot, view.focused)
}

/** `''` when present, otherwise no attribute at all. */
const presenceValue = (present: boolean): string | undefined => {
  if (present) {
    return ''
  }
  return
}

const selectionColor = (selected: boolean): string => {
  if (selected) {
    return PALETTE_VAR.slotSelected
  }
  return PALETTE_VAR.slotBorder
}

const selectionBorderWeight = (selected: boolean): string => {
  if (selected) {
    return SELECTED_BORDER_WEIGHT
  }
  return BORDER_WEIGHT
}

const durabilityColor = (percent: number): string => {
  if (percent <= DURABILITY_LOW_PERCENT) {
    return PALETTE_VAR.durabilityLow
  }
  return PALETTE_VAR.durabilityHigh
}

const updateSlotDurability = (slot: SlotElement, durability: number | undefined): void => {
  // DN-UI-7c, from the other side: this is the "obvious way to write it" the
  // Derivation's `empty` guard was tightened to survive. An empty slot whose
  // Snapshot still carried durability would draw a bar here, under nothing.
  writeHidden(slot.durabilityHidden, typeof durability === 'undefined')
  if (typeof durability === 'undefined') {
    return
  }
  writePercent(slot.durabilityWidth, durability)
  writeStyle(slot.durabilityColor, durabilityColor(durability))
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
  mergeable?: boolean,
): void => {
  writeText(slot.itemText, view.itemId ?? '')
  writeText(slot.countText, view.countLabel ?? '')
  writeAttribute(slot.emptyFlag, presenceValue(view.empty))
  writeAttribute(slot.selectedFlag, presenceValue(view.selected))
  writeAttribute(slot.mergeableFlag, presenceValue(mergeable === true))

  writeStyle(slot.borderColor, selectionColor(view.selected))
  writeStyle(slot.borderWeight, selectionBorderWeight(view.selected))

  updateSlotDurability(slot, view.durabilityPercent)
}
