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
import type { IconState } from '../domain/hud-view-model'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  percentCell,
  writeAttribute,
  writeHidden,
  writePercent,
  type AttributeCell,
  type PercentCell,
} from './dom-write'
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

const FILL_PERCENT: Readonly<Record<IconState, number>> = {
  full: 100,
  half: 50,
  empty: 0,
}

export type IconElement = {
  readonly root: DomElement
  readonly stateFlag: AttributeCell
  readonly hiddenFlag: AttributeCell
  readonly fillWidth: PercentCell
  previous: IconState | undefined
}

export const createIconElement = (factory: DomElementFactory, kind: IconKind): IconElement => {
  const glyphs = GLYPHS[kind]

  const root = factory.createElement('span')
  root.setAttribute('data-mx-ui', 'icon')
  root.setAttribute('data-icon', kind)
  root.style.setProperty('position', 'relative')
  root.style.setProperty('display', 'inline-block')

  const hollow = factory.createElement('span')
  hollow.setAttribute('data-mx-ui', 'icon-hollow')
  hollow.textContent = glyphs.hollow
  hollow.style.setProperty('color', PALETTE_VAR.iconEmpty)
  root.appendChild(hollow)

  // The clip. `overflow: hidden` on a positioned box whose width is the state,
  // with the solid glyph at full size inside it — so a half icon is half a
  // glyph rather than a differently coloured one.
  const clip = factory.createElement('span')
  clip.setAttribute('data-mx-ui', 'icon-clip')
  clip.style.setProperty('position', 'absolute')
  clip.style.setProperty('left', '0')
  clip.style.setProperty('top', '0')
  clip.style.setProperty('overflow', 'hidden')
  clip.style.setProperty('white-space', 'nowrap')
  clip.style.setProperty('color', FILL_TOKEN[kind])
  root.appendChild(clip)

  const solid = factory.createElement('span')
  solid.setAttribute('data-mx-ui', 'icon-solid')
  solid.textContent = glyphs.solid
  clip.appendChild(solid)

  return {
    root,
    stateFlag: attributeCell(root, 'data-icon-state'),
    hiddenFlag: attributeCell(root, 'hidden'),
    fillWidth: percentCell(clip, 'width'),
    previous: undefined,
  }
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
  writeAttribute(icon.stateFlag, undefined)
  icon.previous = undefined
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
  icon.previous = state
  writeAttribute(icon.stateFlag, state)
  writePercent(icon.fillWidth, FILL_PERCENT[state])
}
