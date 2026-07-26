/**
 * The colours the preview draws with — now mx-ui's own.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * This file used to invent every value in it
 * ---------------------------------------------------------------------------
 *
 * Its header said so, at length, and ended: 「The moment `domain/` (or a sibling
 * module) gains real tokens, this file should import them and stop inventing.」
 * `domain/palette.ts` exists, so it does.
 *
 * That closes the gap the preview reported as G1, and it closes it in the
 * direction that matters. The contrast table in `--stats` §5 used to measure
 * hexadecimal numbers this file had picked: the harness was real and the
 * subject was a placeholder, so "a half heart and an empty heart collapse under
 * protanopia" was a true statement about nothing that ships. Every number in
 * that table is now a statement about the palette the game will draw with, and
 * the same survey is asserted in `test/view-model.test.ts` — one derivation
 * (`surveyPalette`), two readers.
 *
 * Nothing below is a value. Every export is an alias onto a domain token or a
 * terminal-specific glyph, and the aliases exist only because the screens are
 * written in the preview's vocabulary (`HEART_FULL`, `BAD`, `MUTED`) rather
 * than the palette's. A colour that is not in `domain/palette.ts` may not
 * appear in this directory.
 */
import {
  DURABILITY_HIGH as DOMAIN_DURABILITY_HIGH,
  DURABILITY_LOW as DOMAIN_DURABILITY_LOW,
  HEART,
  ICON_EMPTY,
  INK as DOMAIN_INK,
  INK_FAINT,
  INK_MUTED,
  METER_TRACK,
  SCRIM,
  SHANK,
  SLOT_BORDER as DOMAIN_SLOT_BORDER,
  SLOT_SELECTED as DOMAIN_SLOT_SELECTED,
  STATUS_ALERT,
  STATUS_BUSY,
  STATUS_OK,
  XP_FILL,
  XP_LEVEL as DOMAIN_XP_LEVEL,
  type Rgb,
} from '../../domain/palette'

export const INK: Rgb = DOMAIN_INK
export const MUTED: Rgb = INK_MUTED
export const FAINT: Rgb = INK_FAINT
export const WARN: Rgb = STATUS_BUSY
export const BAD: Rgb = STATUS_ALERT
export const GOOD: Rgb = STATUS_OK

/**
 * What the frame is drawn on.
 *
 * The domain's `SCRIM` is translucent over the game world; a terminal has no
 * world behind it, so the preview paints the scrim's own colour and the
 * contrast figures it prints come from `worstCaseContrastOnScrim`, which
 * accounts for the world properly. A terminal cell cannot show a composite, and
 * pretending otherwise would make the picture disagree with the table.
 */
export const BACKDROP: Rgb = SCRIM

/**
 * Full and half share a colour, and always did.
 *
 * The distinction is the GLYPH — `█` against `▌`, `#` against `/` — which is
 * the shape redundancy `domain/palette.ts` requires of every critical pair and
 * which `<reference-impl>/index.html:416` relies on to justify leaving the DOM
 * HUD un-corrected. A half heart that differed from a full one only in hue is
 * the exact defect the survey exists to find.
 */
export const HEART_FULL: Rgb = HEART
export const HEART_HALF: Rgb = HEART
export const HEART_EMPTY: Rgb = ICON_EMPTY

export const SHANK_FULL: Rgb = SHANK
export const SHANK_HALF: Rgb = SHANK
export const SHANK_EMPTY: Rgb = ICON_EMPTY

export const XP_BAR: Rgb = XP_FILL
export const XP_TRACK: Rgb = METER_TRACK
export const XP_LEVEL: Rgb = DOMAIN_XP_LEVEL

export const SLOT_BORDER: Rgb = DOMAIN_SLOT_BORDER
export const SLOT_SELECTED: Rgb = DOMAIN_SLOT_SELECTED
export const DURABILITY_HIGH: Rgb = DOMAIN_DURABILITY_HIGH
export const DURABILITY_LOW: Rgb = DOMAIN_DURABILITY_LOW

/**
 * Icon glyphs.
 *
 * THREE SHAPES, not three colours — and this is now enforced rather than
 * merely intended: every entry in `CRITICAL_PAIRS` declares a non-colour
 * channel and `surveyPalette` rejects one that declares none. `--ascii` swaps
 * these for plain characters, which keeps a pasted frame both readable and
 * shape-distinct.
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
