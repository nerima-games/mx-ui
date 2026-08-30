/** Accessibility declarations and the derivation that audits them. */
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
} from './palette-math.js'
import { COLOR_VISION_MODES, type ColorVisionMode } from './accessibility.js'
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
} from './palette-tokens.js'

const ZERO = 0
const ONE = 1

export type TokenRole = 'text' | 'ui'

export type GuardedToken = {
  readonly name: string
  readonly color: Rgb
  readonly role: TokenRole
  readonly on: 'scrim' | 'surface' | 'surfaceRaised'
}

export const GUARDED_TOKENS: ReadonlyArray<GuardedToken> = [
  { color: INK, name: 'INK', on: 'scrim', role: 'text' },
  { color: INK_MUTED, name: 'INK_MUTED', on: 'scrim', role: 'text' },
  { color: INK_FAINT, name: 'INK_FAINT', on: 'scrim', role: 'text' },
  { color: STATUS_OK, name: 'STATUS_OK', on: 'scrim', role: 'text' },
  { color: STATUS_BUSY, name: 'STATUS_BUSY', on: 'scrim', role: 'text' },
  { color: STATUS_ALERT, name: 'STATUS_ALERT', on: 'scrim', role: 'text' },
  { color: XP_LEVEL, name: 'XP_LEVEL', on: 'scrim', role: 'text' },
  { color: HEART, name: 'HEART', on: 'scrim', role: 'ui' },
  { color: SHANK, name: 'SHANK', on: 'scrim', role: 'ui' },
  { color: ICON_EMPTY, name: 'ICON_EMPTY', on: 'scrim', role: 'ui' },
  { color: XP_FILL, name: 'XP_FILL', on: 'scrim', role: 'ui' },
  { color: SLOT_BORDER, name: 'SLOT_BORDER', on: 'scrim', role: 'ui' },
  { color: SLOT_SELECTED, name: 'SLOT_SELECTED', on: 'scrim', role: 'ui' },
  { color: FOCUS_RING, name: 'FOCUS_RING', on: 'scrim', role: 'ui' },
]

export type Distinguisher = 'shape' | 'outline' | 'length' | 'weight' | 'position' | 'numeral'

export type CriticalPair = {
  readonly left: { readonly name: string; readonly color: Rgb }
  readonly right: { readonly name: string; readonly color: Rgb }
  readonly why: string
  readonly alsoDistinguishedBy: ReadonlyArray<Distinguisher>
}

export const CRITICAL_PAIRS: ReadonlyArray<CriticalPair> = [
  { alsoDistinguishedBy: ['shape', 'position'], left: { color: HEART, name: 'heart full' }, right: { color: ICON_EMPTY, name: 'heart empty' }, why: 'how much health is left' },
  { alsoDistinguishedBy: ['length'], left: { color: DURABILITY_HIGH, name: 'durability high' }, right: { color: DURABILITY_LOW, name: 'durability low' }, why: 'whether the tool in your hand is about to break' },
  { alsoDistinguishedBy: ['length', 'numeral'], left: { color: XP_FILL, name: 'xp fill' }, right: { color: METER_TRACK, name: 'xp track' }, why: 'progress to the next level' },
  { alsoDistinguishedBy: ['shape', 'position'], left: { color: HEART, name: 'heart full' }, right: { color: SHANK, name: 'shank full' }, why: 'health versus hunger — two rows of icons side by side' },
  { alsoDistinguishedBy: ['weight'], left: { color: SLOT_SELECTED, name: 'slot selected' }, right: { color: SLOT_BORDER, name: 'slot border' }, why: 'which hotbar slot you are holding' },
  { alsoDistinguishedBy: ['shape'], left: { color: STATUS_OK, name: 'status ok' }, right: { color: STATUS_ALERT, name: 'status alert' }, why: 'whether the game saved or failed to save' },
  { alsoDistinguishedBy: ['shape'], left: { color: STATUS_BUSY, name: 'status busy' }, right: { color: STATUS_ALERT, name: 'status alert' }, why: 'whether a save is still running or has already failed' },
  { alsoDistinguishedBy: ['shape'], left: { color: STATUS_OK, name: 'status ok' }, right: { color: STATUS_BUSY, name: 'status busy' }, why: 'whether the save has finished or is still running' },
  { alsoDistinguishedBy: ['weight'], left: { color: FOCUS_RING, name: 'focus ring' }, right: { color: FOCUS_RING_SHADOW, name: 'focus ring shadow' }, why: 'where the keyboard is, on any background at all' },
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

const surfaceOf = (on: Exclude<GuardedToken['on'], 'scrim'>): Rgb => {
  if (on === 'surface') {
    return SURFACE
  }
  return SURFACE_RAISED
}

const luminanceOutsideScrimRange = (color: Rgb): boolean => {
  const value = relativeLuminance(color)
  return value > relativeLuminance(SCRIM_OVER_BRIGHTEST_WORLD) || value < relativeLuminance(SCRIM_OVER_DARKEST_WORLD)
}

const contrastFloor = (role: TokenRole): number => {
  if (role === 'text') {
    return TEXT_CONTRAST_MIN
  }
  return UI_CONTRAST_MIN
}

const worstContrastFor = (token: GuardedToken): number => {
  if (token.on === 'scrim') {
    return worstCaseContrastOnScrim(token.color)
  }
  return contrastRatio(token.color, surfaceOf(token.on))
}

const boundIsExactFor = (token: GuardedToken, onScrim: boolean): boolean => {
  if (onScrim) {
    return luminanceOutsideScrimRange(token.color)
  }
  return true
}

const readToken = (token: GuardedToken): TokenReading => {
  const floor = contrastFloor(token.role)
  const onScrim = token.on === 'scrim'
  const worstContrast = worstContrastFor(token)
  const boundIsExact = boundIsExactFor(token, onScrim)
  return { boundIsExact, color: token.color, floor, meetsFloor: worstContrast >= floor, name: token.name, on: token.on, role: token.role, worstContrast }
}

const readPair = (pair: CriticalPair): PairReading => {
  const perMode = COLOR_VISION_MODES.map((mode) => {
    const left = simulateColorVision(pair.left.color, mode)
    const right = simulateColorVision(pair.right.color, mode)
    return { contrast: contrastRatio(left, right), left, mode, right, separation: separation(left, right) }
  })
  const worst = perMode.reduce((lowest, reading) => {
    if (reading.separation < lowest.separation) {
      return reading
    }
    return lowest
  })
  return { collapsed: worst.separation < COLLAPSE_SEPARATION, hueOnly: perMode.every((reading) => reading.contrast < UI_CONTRAST_MIN), pair, perMode, worstMode: worst.mode, worstSeparation: worst.separation }
}

const isKnownCollision = (declared: ReadonlyArray<NearCollision>, left: string, right: string): boolean =>
  declared.some((known) => (known.left === left && known.right === right) || (known.left === right && known.right === left))

type MeaningfulToken = { readonly color: Rgb; readonly name: string }
type UndeclaredNearCollision = { left: string; right: string; separation: number }

/**
 * Every pair among `meaningful` whose worst-case separation collapses and
 * that the palette does not already declare — split out of `surveyPalette`
 * so that function stays under the statement-count ceiling.
 */
const findUndeclaredNearCollisions = (
  meaningful: ReadonlyArray<MeaningfulToken>,
  knownNearCollisions: ReadonlyArray<NearCollision>,
): Array<UndeclaredNearCollision> => {
  const undeclared: Array<UndeclaredNearCollision> = []

  for (const [index, left] of meaningful.entries()) {
    for (const right of meaningful.slice(index + ONE)) {
      const worst = Math.min(
        ...COLOR_VISION_MODES.map((mode) =>
          separation(simulateColorVision(left.color, mode), simulateColorVision(right.color, mode)),
        ),
      )
      if (worst < COLLAPSE_SEPARATION && !isKnownCollision(knownNearCollisions, left.name, right.name)) {
        undeclared.push({ left: left.name, right: right.name, separation: worst })
      }
    }
  }

  return undeclared
}

export type PaletteUnderSurvey = {
  readonly tokens: ReadonlyArray<GuardedToken>
  readonly pairs: ReadonlyArray<CriticalPair>
  readonly knownNearCollisions: ReadonlyArray<NearCollision>
}

export const THIS_PALETTE: PaletteUnderSurvey = { knownNearCollisions: KNOWN_NEAR_COLLISIONS, pairs: CRITICAL_PAIRS, tokens: GUARDED_TOKENS }

/** Measure a palette; defaults to mx-ui's own declarations. */
export const surveyPalette = (palette: PaletteUnderSurvey = THIS_PALETTE): PaletteSurvey => {
  const tokens = palette.tokens.map(readToken)
  const pairs = palette.pairs.map(readPair)
  const meaningful = palette.tokens.map((token) => ({ color: token.color, name: token.name }))
  const undeclared = findUndeclaredNearCollisions(meaningful, palette.knownNearCollisions)

  const name = (pair: CriticalPair): string => `${pair.left.name} / ${pair.right.name}`
  return {
    collapsedPairs: pairs.filter((reading) => reading.collapsed).map((reading) => name(reading.pair)),
    pairs,
    pairsWithoutRedundancy: pairs.filter((reading) => reading.pair.alsoDistinguishedBy.length === ZERO).map((reading) => name(reading.pair)),
    tokens,
    tokensBelowFloor: tokens.filter((token) => !token.meetsFloor || !token.boundIsExact).map((token) => token.name),
    undeclaredNearCollisions: undeclared,
  }
}
