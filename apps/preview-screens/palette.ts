/**
 * The colours the preview draws with — and a finding about where they come from.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * mx-ui has no colours
 * ---------------------------------------------------------------------------
 *
 * Not "has not chosen its palette yet": there is no colour token anywhere in the
 * repository. `domain/` is pure state derivation, `index.ts` exports no
 * stylesheet, no theme and no token set, and `domain/accessibility.ts` names the
 * ATTRIBUTE a stylesheet keys on (`colorVisionAttribute`) without there being a
 * stylesheet.
 *
 * That is defensible — the DOM layer has not been written — but it has a
 * consequence worth stating loudly, because it is easy to mistake this preview
 * for more than it is:
 *
 *   **Every colour below was invented here.** When the preview shows that a half
 *   heart and an empty heart collapse into one colour under protanopia, it is
 *   telling you something true about THESE hexadecimal numbers, not about mx-ui.
 *   The mechanism is real and reusable; the palette under test is a placeholder.
 *
 * The moment `domain/` (or a sibling module) gains real tokens, this file should
 * import them and stop inventing. Until then the preview is a working
 * accessibility harness with nothing of its own repository's to check — which is
 * itself the most useful thing it can report.
 *
 * Values are picked to resemble vanilla's HUD (red hearts, brown-orange hunger,
 * green XP) so the simulation shows something recognisable rather than an
 * abstract swatch.
 */
import type { Rgb } from './ansi'

export const INK: Rgb = [232, 236, 242]
export const MUTED: Rgb = [140, 148, 162]
export const FAINT: Rgb = [86, 92, 104]
export const WARN: Rgb = [255, 156, 62]
export const BAD: Rgb = [255, 96, 96]
export const GOOD: Rgb = [126, 214, 142]
export const BACKDROP: Rgb = [26, 28, 34]

export type SemanticColor = {
  readonly name: string
  readonly rgb: Rgb
  /** What it is drawn against, for the contrast measurement. */
  readonly against: Rgb
}

export const HEART_FULL: Rgb = [220, 48, 48]
export const HEART_HALF: Rgb = [220, 48, 48]
export const HEART_EMPTY: Rgb = [72, 34, 34]

export const SHANK_FULL: Rgb = [186, 116, 46]
export const SHANK_HALF: Rgb = [186, 116, 46]
export const SHANK_EMPTY: Rgb = [66, 48, 30]

export const XP_BAR: Rgb = [126, 214, 74]
export const XP_TRACK: Rgb = [44, 60, 36]
export const XP_LEVEL: Rgb = [190, 255, 130]

export const SLOT_BORDER: Rgb = [110, 118, 132]
export const SLOT_SELECTED: Rgb = [244, 246, 250]
export const DURABILITY_HIGH: Rgb = [110, 214, 96]
export const DURABILITY_LOW: Rgb = [226, 66, 52]

/**
 * The pairs a player has to be able to tell apart.
 *
 * This list is the whole point of the accessibility harness: "can you read the
 * HUD in deuteranopia" is not a question about one colour, it is a question
 * about whether two colours that mean different things stay different.
 */
export const CRITICAL_PAIRS: ReadonlyArray<{
  readonly left: SemanticColor
  readonly right: SemanticColor
  readonly why: string
}> = [
  {
    left: { name: 'heart full', rgb: HEART_FULL, against: BACKDROP },
    right: { name: 'heart empty', rgb: HEART_EMPTY, against: BACKDROP },
    why: 'how much health is left',
  },
  {
    left: { name: 'durability high', rgb: DURABILITY_HIGH, against: BACKDROP },
    right: { name: 'durability low', rgb: DURABILITY_LOW, against: BACKDROP },
    why: 'whether the tool in your hand is about to break',
  },
  {
    left: { name: 'xp bar', rgb: XP_BAR, against: XP_TRACK },
    right: { name: 'xp track', rgb: XP_TRACK, against: BACKDROP },
    why: 'progress to the next level',
  },
  {
    left: { name: 'heart full', rgb: HEART_FULL, against: BACKDROP },
    right: { name: 'shank full', rgb: SHANK_FULL, against: BACKDROP },
    why: 'health versus hunger — two rows of icons side by side',
  },
  {
    left: { name: 'slot selected', rgb: SLOT_SELECTED, against: BACKDROP },
    right: { name: 'slot border', rgb: SLOT_BORDER, against: BACKDROP },
    why: 'which hotbar slot you are holding',
  },
]

/**
 * Icon glyphs.
 *
 * THREE SHAPES, not three colours. A half heart that differs from a full heart
 * only in hue is unreadable to the players the colour-vision setting exists for,
 * and the preview would be lying if its own icons made that mistake while it
 * measured everybody else's. `--ascii` swaps them for plain characters, which
 * keeps a pasted frame both readable and shape-distinct.
 */
export type IconGlyphs = {
  readonly full: string
  readonly half: string
  readonly empty: string
  /** Bars: the XP track and a durability meter. */
  readonly barFull: string
  readonly barEmpty: string
  /** Hotbar slot borders. The SELECTED variants differ in shape, not only hue. */
  readonly boxSide: string
  readonly boxTop: string
  readonly boxSideSelected: string
  readonly boxTopSelected: string
}

export const BLOCK_ICONS: IconGlyphs = {
  full: '█',
  half: '▌',
  empty: '░',
  barFull: '█',
  barEmpty: '░',
  boxSide: '│',
  boxTop: '─',
  boxSideSelected: '┃',
  boxTopSelected: '━',
}

/**
 * `--ascii` is not a fallback for terminals that cannot do Unicode — it is how a
 * frame gets into an issue, a commit message or a diff. Every distinction the
 * colour version carries has to survive here in SHAPE, because colour is gone
 * too: a durability bar drawn as dashes either way would lose its reading
 * entirely.
 */
export const ASCII_ICONS: IconGlyphs = {
  full: '#',
  half: '/',
  empty: '.',
  barFull: '#',
  barEmpty: '.',
  boxSide: '|',
  boxTop: '-',
  boxSideSelected: '|',
  boxTopSelected: '=',
}
