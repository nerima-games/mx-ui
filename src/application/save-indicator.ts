/**
 * The autosave indicator — the component the survey's finding was ABOUT.
 *
 * ---------------------------------------------------------------------------
 * Why this file is three elements and not one
 * ---------------------------------------------------------------------------
 *
 * `domain/save-status.ts` has the states and their durations. This file has the
 * elements, and its whole shape is decided by one requirement: **the states must
 * be distinguishable without colour.**
 *
 * That requirement is not a nicety here, it is the finding. The reference inked
 * a successful autosave `#d7f7c2` and a failed one `#ffd6d2`; simulated, they are
 * 12 units apart under protanopia and 22 under deuteranopia against a threshold
 * of 24. `domain/palette.ts` replaced them with a luminance ladder, and G3 of
 * that file's guarantee then requires each critical pair to declare a non-colour
 * channel as well — 「belt AND braces: G2 is not waived by declaring a shape, and
 * a shape is not waived by passing G2」. `status ok / status alert`,
 * `status busy / status alert` and `status ok / status busy` all declare
 * `['shape']`.
 *
 * DN-UI-13f is explicit that a declaration like that cannot be honoured by an
 * attribute: 「`data-icon-state="half"` を出すだけのレンダラは `surveyPalette` の
 * 数値を全部緑に保ったまま、その冗長性を削除する」. So the shape has to be a real,
 * visible difference, exactly as `application/icon-element.ts` makes the half
 * heart a half GLYPH rather than a second colour.
 *
 * Hence three permanent sibling elements, one per message, each carrying its own
 * glyph, its own words and its own colour, all written ONCE at mount:
 *
 *     ⟳  Saving world…    STATUS_BUSY
 *     ✔  World saved      STATUS_OK
 *     ✖  Save failed      STATUS_ALERT
 *
 * Rendering is toggling `hidden`. Four consequences, and every one of them is a
 * property this repository already pins somewhere else:
 *
 *   1. **No colour is ever written on the frame path** — stronger than the rule
 *      in `application/hud-view.ts`, which allows swapping WHICH `var(...)` an
 *      element holds. Here nothing swaps: each colour belongs to an element.
 *   2. **No text is ever written on the frame path either.** `textContent = x`
 *      destroys and recreates a text node even when `x` is unchanged
 *      (`application/dom-write.ts`), and the words are the strongest non-colour
 *      channel there is, so they are worth having permanently rather than
 *      rebuilt per state change.
 *   3. **All three status tokens reach an element at MOUNT**, not only in the
 *      state that happens to be showing. A one-element renderer would have made
 *      "did `STATUS_BUSY` reach the screen?" a question whose answer depended on
 *      what was rendered last — which is the shape of the gap
 *      `test/palette-css.test.ts` exists to close, arriving again.
 *   4. The tree built at mount is the tree that exists forever, so
 *      `application/dom-surface.ts` still needs no `removeChild`.
 *
 * ---------------------------------------------------------------------------
 * The glyphs, and what they are for
 * ---------------------------------------------------------------------------
 *
 * `✔` and `✖` because a tick and a cross are the one pair of marks that survives
 * a greyscale print, and `⟳` because "in progress" is not a degree of either. The
 * three silhouettes share no outline, which is the same argument
 * `application/icon-element.ts` makes for `♡ ♥` against `○ ●`.
 *
 * The glyph is `aria-hidden`: it is redundant WITH the words, and a screen reader
 * announcing "heavy check mark, World saved" spends its first word on the half of
 * the signal that was for the eyes.
 *
 * The measured need is real. `status ok / status busy` — "saved" against "still
 * saving" — posts a contrast ratio of 1.11:1 under deuteranopia. It clears the
 * separation floor comfortably (108 units), so it is separated by CHROMA, which
 * is the channel dichromacy compresses hardest. As with `heart full / shank
 * full`, the shapes are most of the signal rather than a decoration on top of it.
 *
 * ---------------------------------------------------------------------------
 * Escape, keys and animation: what is NOT here
 * ---------------------------------------------------------------------------
 *
 * No listener — this renderer uses only generic `DomElement`s, whose surface
 * deliberately has no `addEventListener` (DN-UI-4/DN-UI-13c).
 *
 * No spinner, and that is a decision. A rotating `⟳` would be a decorative
 * animation, which `domain/accessibility.ts` requires to be suppressed under
 * reduced motion — so it would have to be added AND immediately taken away again
 * for the players most likely to be watching a save indicator with attention.
 * The state is already carried by a glyph and by three words; motion would add
 * no information and one more thing to remember to disable.
 */
import { type AttributeCell, attributeCell, writeAttribute, writeHidden } from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import type { SaveMessage } from '../domain/save-status.js'

/** Render order, top to bottom. Also the order the tests sweep. */
export const SAVE_MESSAGES: ReadonlyArray<SaveMessage> = ['saving', 'saved', 'failed']

/**
 * The SHAPE channel `CRITICAL_PAIRS` declares for the three status pairs, as
 * characters rather than as an attribute (DN-UI-13f).
 */
export const SAVE_STATUS_GLYPH: Readonly<Record<SaveMessage, string>> = {
  failed: '✖',
  saved: '✔',
  saving: '⟳',
}

/**
 * The words.
 *
 * mx-ui's own strings, as `'You died'` in `application/hud-view.ts` is: the state
 * set is finite and closed here, so there is nothing for a caller to supply.
 * (A caption's text comes from the event because mc-audio owns that vocabulary —
 * `domain/caption.ts`: 「already localised by whoever owns the strings」.)
 */
export const SAVE_STATUS_LABEL: Readonly<Record<SaveMessage, string>> = {
  failed: 'Save failed',
  saved: 'World saved',
  saving: 'Saving world…',
}

/**
 * One token per message, and they are the ladder.
 *
 * `STATUS_OK` 0.85, `STATUS_BUSY` 0.57, `STATUS_ALERT` 0.29 in relative
 * luminance — monotone, because dichromacy compresses hue and largely preserves
 * luminance. All three are guarded as `role: 'text'`, so these are the colours of
 * the WORDS and not of a dot beside them.
 */
const SAVE_STATUS_TOKEN: Readonly<Record<SaveMessage, string>> = {
  failed: PALETTE_VAR.statusAlert,
  saved: PALETTE_VAR.statusOk,
  saving: PALETTE_VAR.statusBusy,
}

type SaveMessageElement = {
  readonly message: SaveMessage
  readonly hidden: AttributeCell
}

export type SaveIndicator = {
  /** The element the host appended us to a parent as. Exposed for tests and previews. */
  readonly root: DomElement
  /**
   * Project one message, or `undefined` for nothing.
   *
   * Takes `saveStatusMessage`'s result rather than a `SaveStatus` and a time, so
   * that "is it still up?" is answered in `domain/` where it is arithmetic, and
   * this file stays a dumb projection (`domain/hud-view-model.ts`: 「a rendering
   * bug and a derivation bug are never the same bug」).
   */
  readonly render: (message: SaveMessage | undefined) => void
}

const buildMessageRoot = (
  factory: DomElementFactory,
  parent: DomElement,
  message: SaveMessage,
): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'save-message')
  root.setAttribute('data-save-message', message)
  root.setAttribute('hidden', '')
  // THE colour, written once, on the element that owns this message. Nothing
  // Below is on the frame path.
  root.style.setProperty('color', SAVE_STATUS_TOKEN[message])
  parent.appendChild(root)
  return root
}

const appendMessageGlyph = (
  factory: DomElementFactory,
  root: DomElement,
  message: SaveMessage,
): void => {
  const glyph = factory.createElement('span')
  glyph.setAttribute('data-mx-ui', 'save-glyph')
  // Redundant with the words, so it is for the eyes only.
  glyph.setAttribute('aria-hidden', 'true')
  glyph.textContent = SAVE_STATUS_GLYPH[message]
  root.appendChild(glyph)
}

const appendMessageLabel = (
  factory: DomElementFactory,
  root: DomElement,
  message: SaveMessage,
): void => {
  const label = factory.createElement('span')
  label.setAttribute('data-mx-ui', 'save-label')
  label.textContent = SAVE_STATUS_LABEL[message]
  root.appendChild(label)
}

const createMessageElement = (
  factory: DomElementFactory,
  parent: DomElement,
  message: SaveMessage,
): SaveMessageElement => {
  const root = buildMessageRoot(factory, parent, message)
  appendMessageGlyph(factory, root, message)
  appendMessageLabel(factory, root, message)

  const element: SaveMessageElement = { hidden: attributeCell(root, 'hidden'), message }
  // The attribute was set directly above so the first frame does not flash all
  // Three lines at once; tell the cell what the element already says.
  element.hidden.previous = ''
  return element
}

/**
 * Build the indicator under `parent`.
 *
 * `parent` is passed in, never looked up (`docs/public-api.md` §4-1). It declares
 * the palette on its own root for the same reason `createCaptionView` does: a
 * save indicator outlives any one screen, so it must not depend on inheriting
 * tokens from a HUD that may not be mounted.
 */
const buildIndicatorRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'save-indicator')
  declarePalette(root)
  // The scrim, which is the surface G1 is stated against — `domain/palette.ts`:
  // 「content that leaves it leaves the guarantee with it」. All three status
  // Tokens are measured over this backdrop composited onto the worst world pixel
  // There is, and `STATUS_ALERT` clears the 4.5:1 text floor by 0.01.
  root.style.setProperty('background-color', PALETTE_VAR.scrim)
  // A live region, as the captions are. `polite` rather than `assertive`:
  // Assertive interrupts, and a save status is never worth cutting off a sentence
  // The player is already listening to. The failure state does not need the
  // Interruption either, because it does not expire — a polite announcement that
  // Is queued behind something else still finds the message on screen when the
  // Player gets to it (`domain/save-status.ts`).
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('hidden', '')
  parent.appendChild(root)
  return root
}

export const createSaveIndicator = (
  factory: DomElementFactory,
  parent: DomElement,
): SaveIndicator => {
  const root = buildIndicatorRoot(factory, parent)

  const rootHidden = attributeCell(root, 'hidden')
  rootHidden.previous = ''
  const stateFlag = attributeCell(root, 'data-save-state')

  const messages = SAVE_MESSAGES.map((message) => createMessageElement(factory, root, message))

  return {
    render: (message: SaveMessage | undefined): void => {
      writeHidden(rootHidden, typeof message === 'undefined')
      writeAttribute(stateFlag, message)
      for (const element of messages) {
        writeHidden(element.hidden, element.message !== message)
      }
    },
    root,
  }
}
