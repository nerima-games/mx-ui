/**
 * How a palette token becomes a colour on a screen.
 *
 * ---------------------------------------------------------------------------
 * THE DECISION: custom properties, declared on the MOUNTED ROOT
 * ---------------------------------------------------------------------------
 *
 * Three ways were available. The choice is not about taste, and two of the three
 * arguments below come from constraints this repository had already written down
 * before there was anything to render.
 *
 * **Rejected — a generated stylesheet (`<style>` + class rules).** It needs
 * `document.head`, and `docs/public-api.md` §4-1 constraint 1 forbids mx-ui from
 * going looking for the document: 「`document` を自分で探しに行かない。探しに行くと、
 * 各画面プレビューが同一ページで複数の mx-ui を立てられなくなる」. A stylesheet is a
 * document-global object, so two mx-ui instances on one preview page would fight
 * over one set of rules — which is exactly the outcome that constraint exists to
 * prevent, arriving by a different route.
 *
 * **Rejected — inline `style="color: #e02828"` per element.** It writes the
 * token VALUE into every element that uses it, so `HEART` appears ten times in
 * the DOM for one heart row, and a re-render has to compare a colour string on
 * every icon on every frame. It also makes "did the palette reach the screen?"
 * a question with N answers instead of one.
 *
 * **Chosen — custom properties on the root element the host hands us**, with
 * every consuming element referencing `var(--mx-ui-heart)` and never a literal.
 * The token value is written exactly once per mount; a state change swaps WHICH
 * variable an element references, never a colour.
 *
 * ---------------------------------------------------------------------------
 * Why the ROOT and not `:root` / `<body>` — the interaction the task names
 * ---------------------------------------------------------------------------
 *
 * Custom properties inherit. That is what makes them cheap, and it is also the
 * thing to check against `domain/accessibility.ts`, which scopes the
 * daltonisation to the canvas and nothing else
 * (`COLOR_VISION_FILTER_TARGET = 'canvas'`, DN-UI-1a). The reference flipped
 * `data-color-vision` on `<body>` and let CSS narrow the filter down to the
 * canvas — a `<body>`-level hook narrowed by a selector.
 *
 * Declaring the palette at `:root` or on `<body>` would put the two in the same
 * scope, and the failure that becomes reachable is precisely the one DN-UI-1a
 * exists to forbid. `body[data-color-vision="protanopia"] { --mx-ui-heart: … }`
 * is a one-line, entirely natural rule for somebody who finds the hook and the
 * tokens sitting on the same element — and it re-tints UI chrome that was
 * authored to a contrast floor and measured against it, producing a HUD harder
 * to read than the one they started with. Keeping the tokens on mx-ui's own root
 * means no selector can be written that varies a token by colour-vision mode
 * without first reaching across two different elements on purpose.
 *
 * There is a second, sharper reason, and it is about the guarantee rather than
 * about a mistake. `domain/palette.ts` states G1 「against mx-ui's OWN surfaces
 * only」 and states what is NOT guaranteed: 「Anything drawn directly over the
 * rendered scene… a glyph over an arbitrary world pixel has no contrast floor
 * and mx-ui does not claim one」. Scoping the declarations to the mounted root
 * makes the set of elements that can SEE a token and the set of elements the
 * guarantee COVERS the same set, by construction. At `:root` the canvas subtree
 * is inside the first set and outside the second, and nothing would say so.
 *
 * ---------------------------------------------------------------------------
 * The one rule this file enforces
 * ---------------------------------------------------------------------------
 *
 * `domain/palette.ts` on `Rgb`: 「`hex` and `cssColor` render it for a
 * stylesheet; those are the only two ways a DOM layer should ever turn a token
 * into text, so that nobody re-derives `rgba(...)` by hand and drifts」. Every
 * value below is `cssColor(token)`. There is no colour literal in
 * `application/`, and `test/palette-css.test.ts` fails if a token is added to
 * `domain/palette.ts` without arriving here.
 */
import {
  DURABILITY_HIGH,
  DURABILITY_LOW,
  FOCUS_RING,
  FOCUS_RING_SHADOW,
  HEART,
  ICON_EMPTY,
  INK,
  INK_FAINT,
  INK_MUTED,
  METER_TRACK,
  type Rgb,
  SCRIM,
  SCRIM_ALPHA,
  SHANK,
  SLOT_BORDER,
  SLOT_FILL,
  SLOT_FILL_ALPHA,
  SLOT_SELECTED,
  STATUS_ALERT,
  STATUS_BUSY,
  STATUS_OK,
  SURFACE,
  SURFACE_RAISED,
  XP_FILL,
  XP_FILL_HIGHLIGHT,
  XP_LEVEL,
  cssColor,
} from '../domain/palette'
import type { DomElement } from './dom-surface'

/**
 * The prefix, and why it is not `--ui-` or `--color-`.
 *
 * mx-ui mounts inside a page it does not own — mc-compose's, or a preview's,
 * alongside mc-render's canvas. A custom property is inherited by everything
 * below the element that declares it, so a short name is a name that will
 * eventually collide with somebody else's.
 */
export const PALETTE_PROPERTY_PREFIX = '--mx-ui-'

/**
 * Every token, by the name the DOM knows it as.
 *
 * The keys are this file's vocabulary; the property names are what appears in
 * the document. Both are written out rather than derived from the constant names
 * in `domain/palette.ts`, because a rename there should be a visible diff here
 * and not a silently different property name in a shipped stylesheet.
 */
export const PALETTE_PROPERTY = {
  durabilityHigh: '--mx-ui-durability-high',
  durabilityLow: '--mx-ui-durability-low',
  focusRing: '--mx-ui-focus-ring',
  focusRingShadow: '--mx-ui-focus-ring-shadow',
  heart: '--mx-ui-heart',
  iconEmpty: '--mx-ui-icon-empty',
  ink: '--mx-ui-ink',
  inkFaint: '--mx-ui-ink-faint',
  inkMuted: '--mx-ui-ink-muted',
  meterTrack: '--mx-ui-meter-track',
  scrim: '--mx-ui-scrim',
  shank: '--mx-ui-shank',
  slotBorder: '--mx-ui-slot-border',
  slotFill: '--mx-ui-slot-fill',
  slotSelected: '--mx-ui-slot-selected',
  statusAlert: '--mx-ui-status-alert',
  statusBusy: '--mx-ui-status-busy',
  statusOk: '--mx-ui-status-ok',
  surface: '--mx-ui-surface',
  surfaceRaised: '--mx-ui-surface-raised',
  xpFill: '--mx-ui-xp-fill',
  xpFillHighlight: '--mx-ui-xp-fill-highlight',
  xpLevel: '--mx-ui-xp-level',
} as const

export type PaletteTokenName = keyof typeof PALETTE_PROPERTY

/**
 * The `Rgb` behind each property.
 *
 * Exported so `test/palette-css.test.ts` can sweep `domain/palette.ts` for
 * exported `Rgb` constants and check that every one of them is the source of a
 * property. A token defined and never surfaced is a token whose measured
 * guarantee describes nothing on screen — which is the gap this whole directory
 * exists to close, reappearing one token at a time.
 */
export const PALETTE_SOURCE: Readonly<Record<PaletteTokenName, Rgb>> = {
  durabilityHigh: DURABILITY_HIGH,
  durabilityLow: DURABILITY_LOW,
  focusRing: FOCUS_RING,
  focusRingShadow: FOCUS_RING_SHADOW,
  heart: HEART,
  iconEmpty: ICON_EMPTY,
  ink: INK,
  inkFaint: INK_FAINT,
  inkMuted: INK_MUTED,
  meterTrack: METER_TRACK,
  scrim: SCRIM,
  shank: SHANK,
  slotBorder: SLOT_BORDER,
  slotFill: SLOT_FILL,
  slotSelected: SLOT_SELECTED,
  statusAlert: STATUS_ALERT,
  statusBusy: STATUS_BUSY,
  statusOk: STATUS_OK,
  surface: SURFACE,
  surfaceRaised: SURFACE_RAISED,
  xpFill: XP_FILL,
  xpFillHighlight: XP_FILL_HIGHLIGHT,
  xpLevel: XP_LEVEL,
}

/**
 * The two tokens that are not opaque.
 *
 * `SCRIM_ALPHA` is the reason G1 can be stated at all, and `domain/palette.ts`
 * records that 0.88 → 0.90 was the difference between a claim and an
 * aspiration. Losing the alpha on the way to the document would lose the
 * guarantee silently: the colour would still look approximately right.
 */
const PALETTE_ALPHA: Partial<Readonly<Record<PaletteTokenName, number>>> = {
  scrim: SCRIM_ALPHA,
  slotFill: SLOT_FILL_ALPHA,
}

export const PALETTE_TOKEN_NAMES: ReadonlyArray<PaletteTokenName> = Object.keys(
  PALETTE_PROPERTY,
) as ReadonlyArray<PaletteTokenName>

/** The CSS text of each token — `cssColor` and nothing hand-written. */
export const PALETTE_VALUE: Readonly<Record<PaletteTokenName, string>> = Object.freeze(
  Object.fromEntries(
    PALETTE_TOKEN_NAMES.map((name) => [name, cssColor(PALETTE_SOURCE[name], PALETTE_ALPHA[name])]),
  ),
) as Readonly<Record<PaletteTokenName, string>>

/**
 * `var(--mx-ui-heart)` and its twenty-two siblings, built once at module load.
 *
 * Built rather than written out so the two can never disagree, and built ONCE so
 * that no render ever allocates a `var(...)` string. Every colour a renderer
 * writes comes from here, so a state change costs one comparison and at most one
 * `setProperty` of a short constant.
 */
export const PALETTE_VAR: Readonly<Record<PaletteTokenName, string>> = Object.freeze(
  Object.fromEntries(PALETTE_TOKEN_NAMES.map((name) => [name, `var(${PALETTE_PROPERTY[name]})`])),
) as Readonly<Record<PaletteTokenName, string>>

/**
 * Declare the whole palette on one element.
 *
 * Called once, on the root a view builds. Twenty-three `setProperty` calls at
 * mount and none thereafter — this is not on the frame path, and is the reason
 * nothing on the frame path ever writes a colour.
 */
export const declarePalette = (root: DomElement): void => {
  for (const name of PALETTE_TOKEN_NAMES) {
    root.style.setProperty(PALETTE_PROPERTY[name], PALETTE_VALUE[name])
  }
}
