/** Accessibility declarations and the derivation that audits them. */
import type { ColorVisionMode } from './accessibility'
import { COLOR_VISION_MODES } from './accessibility'
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
  SHANK,
  SLOT_BORDER,
  SLOT_SELECTED,
  STATUS_ALERT,
  STATUS_BUSY,
  STATUS_OK,
  SURFACE,
  SURFACE_RAISED,
  XP_FILL,
  XP_LEVEL,
  type Rgb,
} from './palette-tokens'
import {
  COLLAPSE_SEPARATION,
  SCRIM_OVER_BRIGHTEST_WORLD,
  SCRIM_OVER_DARKEST_WORLD,
  TEXT_CONTRAST_MIN,
  UI_CONTRAST_MIN,
  contrastRatio,
  relativeLuminance,
  separation,
  simulateColorVision,
  worstCaseContrastOnScrim,
} from './palette-math'

export type TokenRole = 'text' | 'ui'

export type GuardedToken = {
  readonly name: string
  readonly color: Rgb
  readonly role: TokenRole
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

export type Distinguisher = 'shape' | 'outline' | 'length' | 'weight' | 'position' | 'numeral'

export type CriticalPair = {
  readonly left: { readonly name: string; readonly color: Rgb }
  readonly right: { readonly name: string; readonly color: Rgb }
  readonly why: string
  readonly alsoDistinguishedBy: ReadonlyArray<Distinguisher>
}

export const CRITICAL_PAIRS: ReadonlyArray<CriticalPair> = [
  { left: { name: 'heart full', color: HEART }, right: { name: 'heart empty', color: ICON_EMPTY }, why: 'how much health is left', alsoDistinguishedBy: ['shape', 'position'] },
  { left: { name: 'durability high', color: DURABILITY_HIGH }, right: { name: 'durability low', color: DURABILITY_LOW }, why: 'whether the tool in your hand is about to break', alsoDistinguishedBy: ['length'] },
  { left: { name: 'xp fill', color: XP_FILL }, right: { name: 'xp track', color: METER_TRACK }, why: 'progress to the next level', alsoDistinguishedBy: ['length', 'numeral'] },
  { left: { name: 'heart full', color: HEART }, right: { name: 'shank full', color: SHANK }, why: 'health versus hunger — two rows of icons side by side', alsoDistinguishedBy: ['shape', 'position'] },
  { left: { name: 'slot selected', color: SLOT_SELECTED }, right: { name: 'slot border', color: SLOT_BORDER }, why: 'which hotbar slot you are holding', alsoDistinguishedBy: ['weight'] },
  { left: { name: 'status ok', color: STATUS_OK }, right: { name: 'status alert', color: STATUS_ALERT }, why: 'whether the game saved or failed to save', alsoDistinguishedBy: ['shape'] },
  { left: { name: 'status busy', color: STATUS_BUSY }, right: { name: 'status alert', color: STATUS_ALERT }, why: 'whether a save is still running or has already failed', alsoDistinguishedBy: ['shape'] },
  { left: { name: 'status ok', color: STATUS_OK }, right: { name: 'status busy', color: STATUS_BUSY }, why: 'whether the save has finished or is still running', alsoDistinguishedBy: ['shape'] },
  { left: { name: 'focus ring', color: FOCUS_RING }, right: { name: 'focus ring shadow', color: FOCUS_RING_SHADOW }, why: 'where the keyboard is, on any background at all', alsoDistinguishedBy: ['weight'] },
]

export type NearCollision = {
  readonly left: string
  readonly right: string
  readonly why: string
}

export const KNOWN_NEAR_COLLISIONS: ReadonlyArray<NearCollision> = [
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

export type TokenReading = {
  readonly name: string
  readonly color: Rgb
  readonly role: TokenRole
  readonly on: GuardedToken['on']
  readonly worstContrast: number
  readonly floor: number
  readonly meetsFloor: boolean
  readonly boundIsExact: boolean
}

export type PairReading = {
  readonly pair: CriticalPair
  readonly perMode: ReadonlyArray<{ readonly mode: ColorVisionMode; readonly left: Rgb; readonly right: Rgb; readonly separation: number; readonly contrast: number }>
  readonly worstSeparation: number
  readonly worstMode: ColorVisionMode
  readonly collapsed: boolean
  readonly hueOnly: boolean
}

export type PaletteSurvey = {
  readonly tokens: ReadonlyArray<TokenReading>
  readonly pairs: ReadonlyArray<PairReading>
  readonly tokensBelowFloor: ReadonlyArray<string>
  readonly collapsedPairs: ReadonlyArray<string>
  readonly pairsWithoutRedundancy: ReadonlyArray<string>
  readonly undeclaredNearCollisions: ReadonlyArray<{ readonly left: string; readonly right: string; readonly separation: number }>
}

const surfaceOf = (on: Exclude<GuardedToken['on'], 'scrim'>): Rgb =>
  on === 'surface' ? SURFACE : SURFACE_RAISED

const luminanceOutsideScrimRange = (color: Rgb): boolean => {
  const value = relativeLuminance(color)
  return value > relativeLuminance(SCRIM_OVER_BRIGHTEST_WORLD) || value < relativeLuminance(SCRIM_OVER_DARKEST_WORLD)
}

const readToken = (token: GuardedToken): TokenReading => {
  const floor = token.role === 'text' ? TEXT_CONTRAST_MIN : UI_CONTRAST_MIN
  const onScrim = token.on === 'scrim'
  const worstContrast = token.on === 'scrim' ? worstCaseContrastOnScrim(token.color) : contrastRatio(token.color, surfaceOf(token.on))
  return { name: token.name, color: token.color, role: token.role, on: token.on, worstContrast, floor, meetsFloor: worstContrast >= floor, boundIsExact: onScrim ? luminanceOutsideScrimRange(token.color) : true }
}

const readPair = (pair: CriticalPair): PairReading => {
  const perMode = COLOR_VISION_MODES.map((mode) => {
    const left = simulateColorVision(pair.left.color, mode)
    const right = simulateColorVision(pair.right.color, mode)
    return { mode, left, right, separation: separation(left, right), contrast: contrastRatio(left, right) }
  })
  const worst = perMode.reduce((lowest, reading) => reading.separation < lowest.separation ? reading : lowest)
  return { pair, perMode, worstSeparation: worst.separation, worstMode: worst.mode, collapsed: worst.separation < COLLAPSE_SEPARATION, hueOnly: perMode.every((reading) => reading.contrast < UI_CONTRAST_MIN) }
}

const isKnownCollision = (declared: ReadonlyArray<NearCollision>, left: string, right: string): boolean =>
  declared.some((known) => (known.left === left && known.right === right) || (known.left === right && known.right === left))

export type PaletteUnderSurvey = {
  readonly tokens: ReadonlyArray<GuardedToken>
  readonly pairs: ReadonlyArray<CriticalPair>
  readonly knownNearCollisions: ReadonlyArray<NearCollision>
}

export const THIS_PALETTE: PaletteUnderSurvey = { tokens: GUARDED_TOKENS, pairs: CRITICAL_PAIRS, knownNearCollisions: KNOWN_NEAR_COLLISIONS }

/** Measure a palette; defaults to mx-ui's own declarations. */
export const surveyPalette = (palette: PaletteUnderSurvey = THIS_PALETTE): PaletteSurvey => {
  const tokens = palette.tokens.map(readToken)
  const pairs = palette.pairs.map(readPair)
  const meaningful = palette.tokens.map((token) => ({ name: token.name, color: token.color }))
  const undeclared: Array<{ left: string; right: string; separation: number }> = []

  for (const [index, left] of meaningful.entries()) {
    for (const right of meaningful.slice(index + 1)) {
      const worst = Math.min(...COLOR_VISION_MODES.map((mode) => separation(simulateColorVision(left.color, mode), simulateColorVision(right.color, mode))))
      if (worst < COLLAPSE_SEPARATION && !isKnownCollision(palette.knownNearCollisions, left.name, right.name)) {
        undeclared.push({ left: left.name, right: right.name, separation: worst })
      }
    }
  }

  const name = (pair: CriticalPair): string => `${pair.left.name} / ${pair.right.name}`
  return {
    tokens,
    pairs,
    tokensBelowFloor: tokens.filter((token) => !token.meetsFloor || !token.boundIsExact).map((token) => token.name),
    collapsedPairs: pairs.filter((reading) => reading.collapsed).map((reading) => name(reading.pair)),
    pairsWithoutRedundancy: pairs.filter((reading) => reading.pair.alsoDistinguishedBy.length === 0).map((reading) => name(reading.pair)),
    undeclaredNearCollisions: undeclared,
  }
}
