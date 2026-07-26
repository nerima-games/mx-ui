/**
 * The palette: mx-ui's colours, and the guarantee attached to them.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 *
 * Until now this repository defined no colour at all — no token, no theme, no
 * stylesheet — while `domain/accessibility.ts` named the ATTRIBUTE a stylesheet
 * keys on and `apps/preview-screens/` measured contrast on colours the preview
 * had invented. The harness was real and the subject was a placeholder, which
 * `pnpm preview --stats` reported as G1.
 *
 * The reference implementation has no palette either, and that is the strongest
 * argument for this file. It has roughly 460 raw colour literals in
 * `packages/presentation` alone and exactly two colour custom properties
 * (`--icon-fill`, `--vital-glow`, both in `index.html`). The cost is visible in
 * its own source: the SAME contrast fix — "white on a gradient whose lightest
 * stop is #6d6d6d yields 5.36:1; the old #e0e0e0-on-#7e7e7e was 3.92:1, a real
 * fail" — is written out four times, in
 * `<reference-impl>/packages/presentation/settings/settings-overlay-dom.ts:70`,
 * `<reference-impl>/packages/presentation/settings/settings-overlay-dom.ts:231`,
 * `<reference-impl>/packages/presentation/menu/confirm-dialog.ts:69` and
 * `<reference-impl>/packages/presentation/menu/death-screen-styles.ts:67`,
 * because there was nowhere to put it once.
 *
 * This module is PURE DATA plus the arithmetic that checks it. Nothing here
 * touches `document`, so the guarantee below runs under `environment: 'node'`
 * like every other derivation in this directory.
 *
 * ---------------------------------------------------------------------------
 * THE GUARANTEE, and what it is against
 * ---------------------------------------------------------------------------
 *
 * "WCAG AA" over a rendered Minecraft world is a claim nobody can honour: the
 * backdrop is whatever the player happens to be looking at. So the claim is
 * narrowed until it is true, and then it is enforced by `surveyPalette`.
 *
 * G1 — LEGIBILITY, against mx-ui's OWN surfaces only.
 *   Every guarded token declares the surface it sits on and a floor: 4.5:1 for
 *   anything read as text (WCAG 2.2 §1.4.3) and 3:1 for icons, meters and
 *   borders (§1.4.11). `SURFACE` and `SURFACE_RAISED` are opaque, so their
 *   ratios are ordinary. `SCRIM` is NOT opaque — it is the HUD's backdrop over
 *   the game world — so its ratio is computed against the WORST POSSIBLE WORLD
 *   PIXEL rather than against a convenient one. That bound is exact, not
 *   sampled: see `worstCaseContrastOnScrim`.
 *
 * G2 — SEPARATION, under all four colour-vision modes.
 *   Every pair in `CRITICAL_PAIRS` stays at least `COLLAPSE_SEPARATION` apart
 *   in sRGB after SIMULATING each of the three dichromacies. Contrast ratio is
 *   deliberately NOT the metric here. WCAG contrast answers "can this be read
 *   against that background"; it does not answer "can these two marks be told
 *   apart", and a red/orange pair no dichromat can separate still posts a
 *   perfectly healthy ratio. Both numbers are reported; only separation is
 *   enforced pairwise.
 *
 * G3 — NO PAIR IS CARRIED BY HUE ALONE.
 *   Every critical pair also declares a non-colour channel — shape, outline,
 *   bar length, border weight, position or a numeral — and `surveyPalette`
 *   refuses a pair that declares none. This is belt AND braces: G2 is not
 *   waived by declaring a shape, and a shape is not waived by passing G2. The
 *   reference relies on exactly this redundancy to justify leaving the DOM HUD
 *   un-corrected — `<reference-impl>/index.html:416` scopes the daltonisation
 *   filter to the canvas and argues "the HUD already carries icon/shape/numeric
 *   redundancy" — so undoing it here would invalidate a decision made there.
 *
 * WHAT IS NOT GUARANTEED. Anything drawn directly over the rendered scene.
 * mc-render owns the canvas (plan.md §3.9); a glyph over an arbitrary world
 * pixel has no contrast floor and mx-ui does not claim one. That is why
 * `SCRIM` is a token and not a decoration: it is the mechanism by which the
 * claim above is made honourable, and content that leaves it leaves the
 * guarantee with it.
 *
 * And note the consequence of DN-UI-1a: the daltonisation correction is applied
 * to the CANVAS ONLY, so it never reaches a single colour in this file. These
 * colours have to survive protanopia, deuteranopia and tritanopia
 * UN-CORRECTED. G2 is not a nice-to-have; it is the only thing standing behind
 * the HUD for a player with a colour vision deficiency.
 */
import type { ColorVisionMode } from './accessibility'
import { COLOR_VISION_MODES } from './accessibility'

// ---------------------------------------------------------------------------
// Representation
// ---------------------------------------------------------------------------

/**
 * sRGB channels in 0–255.
 *
 * Stored as numbers rather than as `#rrggbb` strings because every guarantee
 * in this file is arithmetic, and a palette whose canonical form has to be
 * parsed before it can be checked is a palette that will stop being checked.
 * `hex` and `cssColor` render it for a stylesheet; those are the only two ways
 * a DOM layer should ever turn a token into text, so that nobody re-derives
 * `rgba(...)` by hand and drifts.
 *
 * NOTE this is 0–255, whereas `RgbChannels` in `domain/accessibility.ts` is
 * 0–1. That is not an oversight: `feColorMatrix` operates on 0–1 intensities
 * and CSS colours are written in 0–255, and converting at the boundary is
 * better than one type that means two things depending on who is holding it.
 */
export type Rgb = readonly [number, number, number]

const clampChannel = (value: number): number =>
  Number.isNaN(value) ? 0 : Math.min(255, Math.max(0, Math.round(value)))

/** `#rrggbb`. */
export const hex = (color: Rgb): string =>
  `#${color.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`

/**
 * A CSS colour, opaque or not.
 *
 * `alpha` is the token's own opacity — `SCRIM_ALPHA`, `SLOT_FILL_ALPHA` — and
 * is clamped rather than validated for the same reason `hud-view-model.ts`
 * clamps: a stylesheet that throws is worse than a stylesheet that is briefly
 * wrong.
 */
export const cssColor = (color: Rgb, alpha = 1): string => {
  const [red, green, blue] = [clampChannel(color[0]), clampChannel(color[1]), clampChannel(color[2])]
  const opacity = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha))
  return opacity >= 1
    ? hex(color)
    : `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(opacity)})`
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/**
 * The HUD's backdrop, and the only reason G1 can be stated at all.
 *
 * `<reference-impl>/packages/presentation/hud/controls-hint.ts:58` —
 * `rgba(10, 14, 18, 0.88)`. The alpha is raised to 0.90 here because the
 * survey wanted it: at 0.88 the darkest guarded token (`STATUS_ALERT`) lands
 * at 4.3:1 over a white world pixel and misses the text floor. Two hundredths
 * of alpha is the difference between a claim and an aspiration.
 */
export const SCRIM: Rgb = [10, 14, 18]
export const SCRIM_ALPHA = 0.9

/**
 * An opaque panel — settings, inventory, pause.
 * `<reference-impl>/packages/presentation/menu/confirm-dialog.ts:29`
 * (`rgba(30, 30, 30, 0.96)`), made fully opaque: a modal panel has no reason to
 * let the world through, and a translucent one would drag the same
 * worst-case-world reasoning into every screen instead of just the HUD.
 */
export const SURFACE: Rgb = [30, 30, 30]

/** A panel that sits on a panel — a toast, a tooltip, a selected row.
 * `<reference-impl>/packages/presentation/hud/achievement-toast.ts:15` (`#2a2a2a`). */
export const SURFACE_RAISED: Rgb = [42, 42, 42]

/**
 * The unfilled part of a meter — the XP bar's trough, a durability bar's rest.
 * `<reference-impl>/index.html:378` (`#1b1b1b`).
 *
 * A SURFACE, not a guarded mark, and deliberately so. WCAG §1.4.11 asks for
 * 3:1 on the parts REQUIRED TO IDENTIFY a component; a meter is identified by
 * its fill, not by its empty remainder, and a track light enough to clear 3:1
 * against this scrim would be light enough to read as full.
 */
export const METER_TRACK: Rgb = [27, 27, 27]

/** A hotbar cell's fill.
 * `<reference-impl>/packages/presentation/hud/hotbar-three.ts:34` (`0x000000`) and `:35` (opacity 0.55). */
export const SLOT_FILL: Rgb = [0, 0, 0]
export const SLOT_FILL_ALPHA = 0.55

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

/** Body text. `<reference-impl>/index.html:144` (the sound-caption ink, `#f0f0f0`). */
export const INK: Rgb = [240, 240, 240]
/** Secondary text — a description under a control.
 * `<reference-impl>/packages/presentation/settings/settings-overlay-dom.ts:49` (`#c8c8c8`). */
export const INK_MUTED: Rgb = [200, 200, 200]
/** Tertiary text — a hint, a disabled label.
 * `<reference-impl>/packages/presentation/settings/settings-overlay-dom.ts:163` (`#ababab`). */
export const INK_FAINT: Rgb = [171, 171, 171]

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

/**
 * A full heart.
 *
 * `<reference-impl>/index.html:287` is `#c81919`, and this is `#e02828`:
 * lightened, because `#c81919` reaches only 2.61:1 over the worst world pixel
 * and the icon floor is 3:1. The reference never had to notice — its
 * accessibility gate (`<reference-impl>/e2e/ui/accessibility.e2e.ts:10`) walks
 * TEXT nodes and compares `color` against `background-color`, and a heart is a
 * filled shape, so the entire meaning-bearing half of that HUD is outside what
 * it checks. This is the first of two values the survey moved.
 */
export const HEART: Rgb = [224, 40, 40]

/** A full hunger shank. `<reference-impl>/index.html:327` (`#d18b2f`), unchanged. */
export const SHANK: Rgb = [209, 139, 47]

/**
 * An empty heart or shank.
 *
 * `<reference-impl>/index.html:263` backs empty icons with `#2d2d2d` at 85%
 * opacity. That is 1.10:1 over the worst world pixel — invisible on any bright
 * ground — so it is lightened to `#767676` (3.35:1). The empty icon is not
 * decoration: DN-UI-6 exists because a player on one health point must SEE nine
 * empty hearts and one half, and an empty heart nobody can see is the same lie
 * by another route.
 */
export const ICON_EMPTY: Rgb = [118, 118, 118]

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

/** XP bar fill. `<reference-impl>/index.html:387`, the middle stop of its three (`#4fae24`). */
export const XP_FILL: Rgb = [79, 174, 36]

/**
 * The bright end of the same gradient. `<reference-impl>/index.html:387` (`#a8ff58`).
 *
 * NOT in `GUARDED_TOKENS`, and that is a decision rather than an omission. It
 * carries no meaning of its own: the fact the bar states is "this much is
 * filled", and `XP_FILL` is the colour that states it. A gradient stop is a
 * highlight within one mark.
 *
 * The all-pairs sweep is what forced the question. Guarded, this lands 12 units
 * from `INK_FAINT` under deuteranopia — both wash to a pale yellow-grey — and
 * the honest answers are either "declare a near-collision" or "stop pretending
 * a gradient stop is a semantic token". It is the second, because a token in
 * `GUARDED_TOKENS` is a promise that telling it apart from the others matters,
 * and here it does not.
 */
export const XP_FILL_HIGHLIGHT: Rgb = [168, 255, 88]
/** The level numeral beside the bar. `<reference-impl>/index.html:395` (`#7dff4f`). */
export const XP_LEVEL: Rgb = [125, 255, 79]

// ---------------------------------------------------------------------------
// Hotbar slots
// ---------------------------------------------------------------------------

/** An unselected slot's frame.
 * `<reference-impl>/packages/presentation/hud/hotbar-three.ts:36` (`0x8b8b8b`). */
export const SLOT_BORDER: Rgb = [139, 139, 139]
/** The selected slot's frame.
 * `<reference-impl>/packages/presentation/hud/hotbar-three.ts:42` (`0xffffff`). */
export const SLOT_SELECTED: Rgb = [255, 255, 255]

// ---------------------------------------------------------------------------
// Status — and the pair the survey found collapsed
// ---------------------------------------------------------------------------

/**
 * Saved, healthy, plenty of durability left.
 * `<reference-impl>/index.html:159` (`#d7f7c2`), unchanged.
 */
export const STATUS_OK: Rgb = [215, 247, 194]

/**
 * Working — saving, loading, a block part-way broken.
 *
 * `<reference-impl>/index.html:204` uses `#ffe38a` for "saving". That is
 * 0.78 relative luminance against `STATUS_OK`'s 0.85 and collapses into it.
 * This is `#e8c040`, which the reference already uses for two adjacent jobs —
 * the caption accent bar (`<reference-impl>/index.html:147`) and the
 * block-break progress bar (`<reference-impl>/index.html:496`) — so the
 * replacement is still the reference's own colour, one role over.
 */
export const STATUS_BUSY: Rgb = [232, 192, 64]

/**
 * THE PAIR THE SURVEY FOUND. Failed to save, about to break, out of air.
 *
 * `<reference-impl>/index.html:212` uses `#ffd6d2` for the autosave ERROR ink
 * against `#d7f7c2` for success (`:159`). Simulated, those two are 12 units
 * apart under protanopia and 22 under deuteranopia, against a collapse
 * threshold of 24 out of a 442-unit cube. A red-green dichromat — the common
 * case, roughly one man in twelve — cannot tell "world saved" from "SAVE
 * FAILED", and the two strings are the same length in the same place on the
 * same backdrop.
 *
 * Nothing in the reference could have caught it. Its accessibility gate checks
 * a text node against its own background; it never compares one STATE against
 * another, which is the comparison the player actually has to make.
 *
 * `#f4553f` is a full luminance step down (0.29 against 0.85 and 0.57), so the
 * three statuses form a monotone ladder. That is the design rule the survey
 * forced and it generalises: dichromacy compresses hue and largely PRESERVES
 * luminance, so a set separated by luminance survives by construction while a
 * set separated by hue survives by luck.
 */
export const STATUS_ALERT: Rgb = [244, 85, 63]

/**
 * Durability reuses the status ladder rather than adding a fourth and fifth
 * colour to a HUD that cannot afford them (see `KNOWN_NEAR_COLLISIONS`). It has
 * no reference value to carry: the reference renders no durability bar at all —
 * `durability` appears in its inventory domain and never in
 * `packages/presentation`.
 */
export const DURABILITY_HIGH: Rgb = STATUS_OK
export const DURABILITY_LOW: Rgb = STATUS_ALERT

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

/**
 * The keyboard focus indicator, which is TWO colours on purpose.
 *
 * `<reference-impl>/packages/presentation/menu/main-menu-styles.ts:90` draws
 * `outline: 3px solid #ffe090` over a `rgba(20, 29, 25, .94)` ring. A
 * single-colour ring has to contrast with whatever it lands on and cannot, so
 * the pair carries itself: gold against near-black is 10.2:1 in every mode, on
 * any background, because the background is not part of the comparison.
 *
 * Kept distinct from `SLOT_SELECTED`. "Which slot is the game using" and "which
 * control is the keyboard on" are different questions and a player who is
 * navigating by keyboard is asking both at once.
 */
export const FOCUS_RING: Rgb = [255, 224, 144]
export const FOCUS_RING_SHADOW: Rgb = [20, 29, 25]

// ---------------------------------------------------------------------------
// The arithmetic behind the guarantee
// ---------------------------------------------------------------------------

const channelLuminance = (value: number): number => {
  const scaled = clampChannel(value) / 255
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x relative luminance. */
export const relativeLuminance = (color: Rgb): number =>
  0.2126 * channelLuminance(color[0]) +
  0.7152 * channelLuminance(color[1]) +
  0.0722 * channelLuminance(color[2])

/** WCAG 2.x contrast ratio, 1..21. */
export const contrastRatio = (left: Rgb, right: Rgb): number => {
  const a = relativeLuminance(left)
  const b = relativeLuminance(right)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Straight sRGB distance, and crude on purpose.
 *
 * The question is "did these two collapse into each other", not "how different
 * do they look". A perceptual metric would answer the second question better
 * and would invite arguing about the last few units of the first, which is the
 * argument a threshold exists to end.
 */
export const separation = (left: Rgb, right: Rgb): number =>
  Math.sqrt(
    (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2,
  )

/**
 * Below this, two colours are one colour for practical purposes.
 * 24 of the 442-unit diagonal of the sRGB cube.
 */
export const COLLAPSE_SEPARATION = 24

/** WCAG 2.2 §1.4.3 — text. */
export const TEXT_CONTRAST_MIN = 4.5
/** WCAG 2.2 §1.4.11 — icons, meters, borders. */
export const UI_CONTRAST_MIN = 3

/**
 * SIMULATION matrices — Viénot–Brettel–Mollon (1999) dichromat approximations
 * in sRGB, the set every accessibility tool uses.
 *
 * **These are NOT the daltonisation matrices.** A SIMULATION shows what a
 * player sees; a CORRECTION (`colorVisionMatrix` in `domain/accessibility.ts`)
 * changes what is drawn so they can tell it apart. Swapping one for the other
 * breaks precisely the thing the setting exists to fix, and DN-UI-1a says so at
 * length. They live in different files, each pointing at the other, so that
 * neither can be reached for by accident.
 *
 * This lives in `domain/` rather than in the preview because the palette's
 * guarantee is stated in terms of it. A guarantee whose arithmetic is in a dev
 * application is a guarantee that cannot be a test.
 */
const SIMULATION_MATRICES: ReadonlyMap<ColorVisionMode, readonly [Rgb, Rgb, Rgb]> = new Map([
  [
    'protanopia' as ColorVisionMode,
    [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0, 0.242, 0.758],
    ] as readonly [Rgb, Rgb, Rgb],
  ],
  [
    'deuteranopia' as ColorVisionMode,
    [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7],
    ] as readonly [Rgb, Rgb, Rgb],
  ],
  [
    'tritanopia' as ColorVisionMode,
    [
      [0.95, 0.05, 0],
      [0, 0.433, 0.567],
      [0, 0.475, 0.525],
    ] as readonly [Rgb, Rgb, Rgb],
  ],
])

/** What a player with this deficiency sees. `off` is the identity. */
export const simulateColorVision = (color: Rgb, mode: ColorVisionMode): Rgb => {
  const matrix = SIMULATION_MATRICES.get(mode)
  if (matrix === undefined) {
    return color
  }
  const row = (index: 0 | 1 | 2): number =>
    clampChannel(
      matrix[index][0] * color[0] + matrix[index][1] * color[1] + matrix[index][2] * color[2],
    )
  return [row(0), row(1), row(2)]
}

/**
 * Source-over compositing, in sRGB space, which is where CSS does it.
 *
 * Not gamma-correct, and that is not a bug: the browser is not gamma-correct
 * here either, so a "correct" composite would predict a colour the player never
 * sees.
 */
export const compositeOver = (color: Rgb, alpha: number, backdrop: Rgb): Rgb => {
  const amount = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha))
  const blend = (index: 0 | 1 | 2): number => amount * color[index] + (1 - amount) * backdrop[index]
  return [blend(0), blend(1), blend(2)]
}

/**
 * The two colours the scrim can become, over the darkest and brightest world
 * pixel there is.
 *
 * These BOUND the whole range rather than sampling it, because a composite's
 * luminance is monotone increasing in each backdrop channel: the extremes of
 * the backdrop are the extremes of the composite. That is what makes
 * `worstCaseContrastOnScrim` exact.
 */
export const SCRIM_OVER_DARKEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [0, 0, 0])
export const SCRIM_OVER_BRIGHTEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [255, 255, 255])

/**
 * The worst contrast a colour can have against the HUD scrim, over ANY world.
 *
 * Exact rather than sampled, given one side condition. Contrast ratio against a
 * fixed foreground is a V in the backdrop's luminance — it bottoms out at 1
 * where the two luminances meet — so checking the two ends only finds the true
 * minimum when the foreground's luminance lies OUTSIDE the composite's range.
 * Every guarded token satisfies that, and `surveyPalette` asserts it rather
 * than assuming it (`luminanceOutsideScrimRange`); a token that stopped
 * satisfying it would be one that literally disappears into the scrim over some
 * world, and it must fail loudly rather than be quietly measured wrong.
 */
export const worstCaseContrastOnScrim = (color: Rgb): number =>
  Math.min(
    contrastRatio(color, SCRIM_OVER_DARKEST_WORLD),
    contrastRatio(color, SCRIM_OVER_BRIGHTEST_WORLD),
  )

const luminanceOutsideScrimRange = (color: Rgb): boolean => {
  const value = relativeLuminance(color)
  return (
    value > relativeLuminance(SCRIM_OVER_BRIGHTEST_WORLD) ||
    value < relativeLuminance(SCRIM_OVER_DARKEST_WORLD)
  )
}

// ---------------------------------------------------------------------------
// What is guarded, and against what
// ---------------------------------------------------------------------------

/** `text` carries the 4.5:1 floor; `ui` carries 3:1. */
export type TokenRole = 'text' | 'ui'

export type GuardedToken = {
  readonly name: string
  readonly color: Rgb
  readonly role: TokenRole
  /**
   * `scrim` means "over the HUD backdrop over an arbitrary world", which is the
   * hard case and the one every HUD token is in. `surface` and `surfaceRaised`
   * are opaque panels.
   */
  readonly on: 'scrim' | 'surface' | 'surfaceRaised'
}

export const GUARDED_TOKENS: ReadonlyArray<GuardedToken> = [
  { name: 'INK', color: INK, role: 'text', on: 'scrim' },
  { name: 'INK_MUTED', color: INK_MUTED, role: 'text', on: 'scrim' },
  { name: 'INK_FAINT', color: INK_FAINT, role: 'text', on: 'scrim' },
  { name: 'STATUS_OK', color: STATUS_OK, role: 'text', on: 'scrim' },
  { name: 'STATUS_BUSY', color: STATUS_BUSY, role: 'text', on: 'scrim' },
  { name: 'STATUS_ALERT', color: STATUS_ALERT, role: 'text', on: 'scrim' },
  { name: 'XP_LEVEL', color: XP_LEVEL, role: 'text', on: 'scrim' },
  { name: 'HEART', color: HEART, role: 'ui', on: 'scrim' },
  { name: 'SHANK', color: SHANK, role: 'ui', on: 'scrim' },
  { name: 'ICON_EMPTY', color: ICON_EMPTY, role: 'ui', on: 'scrim' },
  { name: 'XP_FILL', color: XP_FILL, role: 'ui', on: 'scrim' },
  { name: 'SLOT_BORDER', color: SLOT_BORDER, role: 'ui', on: 'scrim' },
  { name: 'SLOT_SELECTED', color: SLOT_SELECTED, role: 'ui', on: 'scrim' },
  { name: 'FOCUS_RING', color: FOCUS_RING, role: 'ui', on: 'scrim' },
]

/**
 * The non-colour channel a distinction ALSO travels on.
 *
 * Every critical pair must name at least one. Not because it excuses a weak
 * colour pair — G2 is enforced independently — but because the reference's
 * decision to leave the DOM HUD un-corrected
 * (`<reference-impl>/index.html:416`) is underwritten by this redundancy
 * existing, and a palette that quietly removed it would invalidate a choice
 * made in another repository.
 */
export type Distinguisher = 'shape' | 'outline' | 'length' | 'weight' | 'position' | 'numeral'

export type CriticalPair = {
  readonly left: { readonly name: string; readonly color: Rgb }
  readonly right: { readonly name: string; readonly color: Rgb }
  /** What the player loses if these two become one colour. */
  readonly why: string
  /** Never empty. `surveyPalette` rejects an empty one. */
  readonly alsoDistinguishedBy: ReadonlyArray<Distinguisher>
}

/**
 * The pairs a player has to be able to tell apart.
 *
 * The first five are the specification `apps/preview-screens/palette.ts` was
 * written against while there was nothing to measure; the last three are what
 * the survey added once there was.
 */
export const CRITICAL_PAIRS: ReadonlyArray<CriticalPair> = [
  {
    left: { name: 'heart full', color: HEART },
    right: { name: 'heart empty', color: ICON_EMPTY },
    why: 'how much health is left',
    alsoDistinguishedBy: ['shape', 'position'],
  },
  {
    left: { name: 'durability high', color: DURABILITY_HIGH },
    right: { name: 'durability low', color: DURABILITY_LOW },
    why: 'whether the tool in your hand is about to break',
    alsoDistinguishedBy: ['length'],
  },
  {
    left: { name: 'xp fill', color: XP_FILL },
    right: { name: 'xp track', color: METER_TRACK },
    why: 'progress to the next level',
    alsoDistinguishedBy: ['length', 'numeral'],
  },
  {
    left: { name: 'heart full', color: HEART },
    right: { name: 'shank full', color: SHANK },
    why: 'health versus hunger — two rows of icons side by side',
    // 49 apart at worst, and 1.21:1 — so these are separated by CHROMA, which
    // is the channel dichromacy compresses hardest. The three icon shapes are
    // not decoration here; they are most of the signal.
    alsoDistinguishedBy: ['shape', 'position'],
  },
  {
    left: { name: 'slot selected', color: SLOT_SELECTED },
    right: { name: 'slot border', color: SLOT_BORDER },
    why: 'which hotbar slot you are holding',
    alsoDistinguishedBy: ['weight'],
  },
  {
    left: { name: 'status ok', color: STATUS_OK },
    right: { name: 'status alert', color: STATUS_ALERT },
    why: 'whether the game saved or failed to save',
    alsoDistinguishedBy: ['shape'],
  },
  {
    left: { name: 'status busy', color: STATUS_BUSY },
    right: { name: 'status alert', color: STATUS_ALERT },
    why: 'whether a save is still running or has already failed',
    alsoDistinguishedBy: ['shape'],
  },
  {
    left: { name: 'focus ring', color: FOCUS_RING },
    right: { name: 'focus ring shadow', color: FOCUS_RING_SHADOW },
    why: 'where the keyboard is, on any background at all',
    alsoDistinguishedBy: ['weight'],
  },
]

/**
 * Token pairs that land inside the collapse threshold and are NOT defects.
 *
 * `surveyPalette` sweeps every pair of meaning-bearing tokens, not just the
 * declared ones, and reports anything closer than `COLLAPSE_SEPARATION` that is
 * not listed here. So a new token that lands on top of an old one fails a test
 * until somebody has looked at it and written down why it is fine — which is
 * the only moment at which anybody ever will.
 *
 * There is exactly one entry, and it records a real limit rather than an
 * oversight. Searching the sRGB cube for an "alert" colour that clears 4.5:1
 * over the worst world pixel AND stays 40 units clear of hunger-orange under
 * all three dichromacies returns only greys and purples. On a dark HUD that
 * must survive dichromacy there is no red that is both an alarm and distinct
 * from hunger. The distinction is therefore carried entirely by region, shape
 * and the words in the toast, which is honest, and it is written down here
 * rather than discovered later.
 */
export const KNOWN_NEAR_COLLISIONS: ReadonlyArray<{
  readonly left: string
  readonly right: string
  readonly why: string
}> = [
  {
    left: 'SHANK',
    right: 'STATUS_ALERT',
    why:
      'A hunger shank and a failed-save toast are never a distinction the player has to make: ' +
      'different region, different shape, and the toast carries words. No red clears the alert ' +
      'floor and stays clear of hunger-orange under all three dichromacies — the search returns ' +
      'only greys and purples — so this is a limit of the space, not a slip.',
  },
]

// ---------------------------------------------------------------------------
// The survey — one derivation, shared by the tests and the preview
// ---------------------------------------------------------------------------

export type TokenReading = {
  readonly name: string
  readonly color: Rgb
  readonly role: TokenRole
  readonly on: GuardedToken['on']
  readonly worstContrast: number
  readonly floor: number
  readonly meetsFloor: boolean
  /** False means the measurement itself is not trustworthy — see `worstCaseContrastOnScrim`. */
  readonly boundIsExact: boolean
}

export type PairReading = {
  readonly pair: CriticalPair
  readonly perMode: ReadonlyArray<{
    readonly mode: ColorVisionMode
    readonly left: Rgb
    readonly right: Rgb
    readonly separation: number
    readonly contrast: number
  }>
  readonly worstSeparation: number
  readonly worstMode: ColorVisionMode
  readonly collapsed: boolean
  readonly hueOnly: boolean
}

export type PaletteSurvey = {
  readonly tokens: ReadonlyArray<TokenReading>
  readonly pairs: ReadonlyArray<PairReading>
  /** Everything that must be empty for the guarantee to hold. */
  readonly tokensBelowFloor: ReadonlyArray<string>
  readonly collapsedPairs: ReadonlyArray<string>
  readonly pairsWithoutRedundancy: ReadonlyArray<string>
  readonly undeclaredNearCollisions: ReadonlyArray<{
    readonly left: string
    readonly right: string
    readonly separation: number
  }>
}

const surfaceOf = (token: GuardedToken): Rgb =>
  token.on === 'surface' ? SURFACE : token.on === 'surfaceRaised' ? SURFACE_RAISED : SCRIM

const readToken = (token: GuardedToken): TokenReading => {
  const floor = token.role === 'text' ? TEXT_CONTRAST_MIN : UI_CONTRAST_MIN
  const onScrim = token.on === 'scrim'
  const worstContrast = onScrim
    ? worstCaseContrastOnScrim(token.color)
    : contrastRatio(token.color, surfaceOf(token))

  return {
    name: token.name,
    color: token.color,
    role: token.role,
    on: token.on,
    worstContrast,
    floor,
    meetsFloor: worstContrast >= floor,
    boundIsExact: onScrim ? luminanceOutsideScrimRange(token.color) : true,
  }
}

const readPair = (pair: CriticalPair): PairReading => {
  const perMode = COLOR_VISION_MODES.map((mode) => {
    const left = simulateColorVision(pair.left.color, mode)
    const right = simulateColorVision(pair.right.color, mode)
    return { mode, left, right, separation: separation(left, right), contrast: contrastRatio(left, right) }
  })

  const worst = perMode.reduce((lowest, reading) =>
    reading.separation < lowest.separation ? reading : lowest,
  )

  return {
    pair,
    perMode,
    worstSeparation: worst.separation,
    worstMode: worst.mode,
    collapsed: worst.separation < COLLAPSE_SEPARATION,
    // Reported, never enforced. A pair can be perfectly separable and still
    // post a low ratio, because ratio measures legibility and not identity.
    hueOnly: perMode.every((reading) => reading.contrast < UI_CONTRAST_MIN),
  }
}

/** Every token whose colour carries meaning, for the all-pairs sweep. */
const MEANINGFUL_TOKENS: ReadonlyArray<{ readonly name: string; readonly color: Rgb }> =
  GUARDED_TOKENS.map((token) => ({ name: token.name, color: token.color }))

const isKnownCollision = (left: string, right: string): boolean =>
  KNOWN_NEAR_COLLISIONS.some(
    (known) =>
      (known.left === left && known.right === right) || (known.left === right && known.right === left),
  )

/**
 * Measure the whole palette.
 *
 * The tests assert the four lists at the bottom are empty; `pnpm preview
 * --stats` prints the readings above them. ONE derivation, two readers — the
 * empty-slot durability bug (DN-UI-7c) is what a second copy costs.
 */
export const surveyPalette = (): PaletteSurvey => {
  const tokens = GUARDED_TOKENS.map(readToken)
  const pairs = CRITICAL_PAIRS.map(readPair)

  const undeclared: Array<{ left: string; right: string; separation: number }> = []
  for (let index = 0; index < MEANINGFUL_TOKENS.length; index += 1) {
    for (let other = index + 1; other < MEANINGFUL_TOKENS.length; other += 1) {
      const left = MEANINGFUL_TOKENS[index]
      const right = MEANINGFUL_TOKENS[other]
      if (left === undefined || right === undefined) {
        continue
      }
      const worst = Math.min(
        ...COLOR_VISION_MODES.map((mode) =>
          separation(simulateColorVision(left.color, mode), simulateColorVision(right.color, mode)),
        ),
      )
      if (worst < COLLAPSE_SEPARATION && !isKnownCollision(left.name, right.name)) {
        undeclared.push({ left: left.name, right: right.name, separation: worst })
      }
    }
  }

  const name = (pair: CriticalPair): string => `${pair.left.name} / ${pair.right.name}`

  return {
    tokens,
    pairs,
    tokensBelowFloor: tokens
      .filter((token) => !token.meetsFloor || !token.boundIsExact)
      .map((token) => token.name),
    collapsedPairs: pairs.filter((reading) => reading.collapsed).map((reading) => name(reading.pair)),
    pairsWithoutRedundancy: pairs
      .filter((reading) => reading.pair.alsoDistinguishedBy.length === 0)
      .map((reading) => name(reading.pair)),
    undeclaredNearCollisions: undeclared,
  }
}
