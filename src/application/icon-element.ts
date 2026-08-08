/**
 * A heart or a shank — and the reason it is two elements rather than one.
 *
 * ---------------------------------------------------------------------------
 * G3 is not satisfiable by an attribute
 * ---------------------------------------------------------------------------
 *
 * `domain/palette.ts` G3: 「NO PAIR IS CARRIED BY HUE ALONE. Every critical pair
 * also declares a non-colour channel — shape, outline, bar length, border
 * weight, position or a numeral — and `surveyPalette` refuses a pair that
 * declares none」. `heart full / heart empty` declares `['shape', 'position']`,
 * and `heart full / shank full` declares the same, with a note that the pair is
 * 49 units and 1.21:1 apart so 「The three icon shapes are not decoration here;
 * they are most of the signal」.
 *
 * A renderer that drew one glyph and recoloured it would satisfy G2's numbers
 * and quietly delete G3 — the declaration in `domain/palette.ts` would still say
 * "shape", and nothing would be false except the screen. Worse, the reference's
 * decision to leave the DOM HUD UN-corrected (`<reference-impl>/index.html:416`,
 * 「the HUD already carries icon/shape/numeric redundancy」) is underwritten by
 * that redundancy existing. Deleting it here invalidates a choice made in
 * another repository.
 *
 * So an icon is a HOLLOW glyph with a FILLED glyph clipped over it:
 *
 *     ♡  in ICON_EMPTY, always drawn, always full width      ← shape + position
 *     ♥  in HEART, clipped to 100% / 50% / 0%                ← shape + length
 *
 * which gives three visibly different icons under a greyscale print, let alone
 * under dichromacy, and gives them without any per-frame colour write: the
 * colours are set once, and a state change moves the clip.
 *
 * The half state is the one that forces this shape. DN-UI-6 requires that 19
 * health reads as nine full hearts and one HALF; there is no half-heart
 * character to switch to, and 「an icon is full at 2 points, half at exactly 1」
 * is not expressible by recolouring. A 50% clip is exactly expressible.
 */
import {
  type AttributeCell,
  type PercentCell,
  attributeCell,
  percentCell,
  writeAttribute,
  writeHidden,
  writePercent,
} from './dom-write'
import type { DomElement, DomElementFactory } from './dom-surface'
import type { IconState } from '../domain/hud-view-model'
import { PALETTE_VAR } from './palette-css'

/** Which row an icon belongs to. Selects the glyph pair and the fill token. */
export type IconKind = 'heart' | 'shank'

/**
 * The glyphs.
 *
 * A hollow/solid PAIR per kind, and two pairs that are not each other's
 * outlines: `♡ ♥` against `○ ●`. That is the `shape` channel `heart full /
 * shank full` declares, and the reason it is declared — those two colours are
 * separated by chroma, which is the channel dichromacy compresses hardest.
 */
const GLYPHS: Readonly<Record<IconKind, { readonly hollow: string; readonly solid: string }>> = {
  heart: { hollow: '♡', solid: '♥' },
  shank: { hollow: '○', solid: '●' },
}

const FILL_TOKEN: Readonly<Record<IconKind, string>> = {
  heart: PALETTE_VAR.heart,
  shank: PALETTE_VAR.shank,
}

/**
 * What a row of these icons IS, in words.
 *
 * The glyphs are the whole content of the vitals display, and they are `♡` and
 * `○` — characters a screen reader announces as "white heart suit" and "white
 * circle", ten and ten of them in a row, with nothing anywhere saying which row
 * is health and which is hunger. A player using a screen reader can hear that
 * something changed and cannot hear whether they are about to starve or about to
 * die.
 *
 * The reference asserted exactly this from the browser side —
 * `<reference-impl>/e2e/ui/hud.e2e.ts:65-66` locates the two displays by
 * `getByLabel('Health')` and `getByLabel('Hunger')` — and it is the one claim in
 * the demoted E2E set that mx-ui could be asked and answered "no". The names are
 * static, so they cost one `setAttribute` each at mount and nothing per frame.
 */
export const ICON_ROW_LABEL: Readonly<Record<IconKind, string>> = {
  heart: 'Health',
  shank: 'Hunger',
}

const FILL_PERCENT: Readonly<Record<IconState, number>> = {
  empty: 0,
  full: 100,
  half: 50,
}

export type IconElement = {
  readonly root: DomElement
  readonly stateFlag: AttributeCell
  readonly hiddenFlag: AttributeCell
  readonly fillWidth: PercentCell
  // Not optional: `exactOptionalPropertyTypes` forbids assigning `undefined`
  // To an optional property, and `writeIconState` needs to CLEAR this field,
  // Not just ever leave it unset.
  previous: IconState | undefined
}

type IconElementCells = {
  readonly root: DomElement
  readonly stateFlag: AttributeCell
  readonly hiddenFlag: AttributeCell
  readonly fillWidth: PercentCell
}

/** `previous` starts absent by omission — see `writeIconState` below. */
const buildIconElement = (cells: IconElementCells, previous?: IconState): IconElement => ({
  ...cells,
  previous,
})

const buildRootElement = (factory: DomElementFactory, kind: IconKind): DomElement => {
  const root = factory.createElement('span')
  root.setAttribute('data-mx-ui', 'icon')
  root.setAttribute('data-icon', kind)
  root.style.setProperty('position', 'relative')
  root.style.setProperty('display', 'inline-block')
  return root
}

const appendHollowGlyph = (factory: DomElementFactory, root: DomElement, hollowGlyph: string): void => {
  const hollow = factory.createElement('span')
  hollow.setAttribute('data-mx-ui', 'icon-hollow')
  hollow.textContent = hollowGlyph
  hollow.style.setProperty('color', PALETTE_VAR.iconEmpty)
  root.appendChild(hollow)
}

// The clip. `overflow: hidden` on a positioned box whose width is the state,
// With the solid glyph at full size inside it — so a half icon is half a
// Glyph rather than a differently coloured one.
const buildClipElement = (factory: DomElementFactory, kind: IconKind): DomElement => {
  const clip = factory.createElement('span')
  clip.setAttribute('data-mx-ui', 'icon-clip')
  clip.style.setProperty('position', 'absolute')
  clip.style.setProperty('left', '0')
  clip.style.setProperty('top', '0')
  clip.style.setProperty('overflow', 'hidden')
  clip.style.setProperty('white-space', 'nowrap')
  clip.style.setProperty('color', FILL_TOKEN[kind])
  return clip
}

const appendSolidGlyph = (factory: DomElementFactory, clip: DomElement, solidGlyph: string): void => {
  const solid = factory.createElement('span')
  solid.setAttribute('data-mx-ui', 'icon-solid')
  solid.textContent = solidGlyph
  clip.appendChild(solid)
}

/**
 * Set (or clear) the state attribute and the tracked previous state together,
 * so the two can never drift apart. Omitting `state` — rather than passing an
 * explicit "no state" literal — is what `retireIconElement` uses to clear both.
 */
const writeIconState = (icon: IconElement, state?: IconState): void => {
  icon.previous = state
  writeAttribute(icon.stateFlag, state)
}

export const createIconElement = (factory: DomElementFactory, kind: IconKind): IconElement => {
  const glyphs = GLYPHS[kind]
  const root = buildRootElement(factory, kind)
  appendHollowGlyph(factory, root, glyphs.hollow)
  const clip = buildClipElement(factory, kind)
  root.appendChild(clip)
  appendSolidGlyph(factory, clip, glyphs.solid)

  return buildIconElement({
    fillWidth: percentCell(clip, 'width'),
    hiddenFlag: attributeCell(root, 'hidden'),
    root,
    stateFlag: attributeCell(root, 'data-icon-state'),
  })
}

/**
 * An icon a shorter row no longer needs.
 *
 * Hidden rather than removed — see `application/hud-view.ts` on why the tree
 * built at mount is permanent — and diffed, so a row that has been the same
 * length for a thousand frames costs nothing for its surplus either.
 */
export const retireIconElement = (icon: IconElement): void => {
  writeHidden(icon.hiddenFlag, true)
  writeIconState(icon)
}

/**
 * Two writes on a state change, zero otherwise — and never a colour.
 *
 * `previous` is compared before either cell is touched, so an unchanged icon
 * costs one string comparison. A heart row is ten of those, and a hunger row is
 * ten more; on a frame where the player took no damage that is the entire cost
 * of the vitals block.
 */
export const updateIconElement = (icon: IconElement, state: IconState): void => {
  writeHidden(icon.hiddenFlag, false)
  if (icon.previous === state) {
    return
  }
  writeIconState(icon, state)
  writePercent(icon.fillWidth, FILL_PERCENT[state])
}
