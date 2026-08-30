/** Colour arithmetic used by the palette accessibility survey. */
import { type Rgb, SCRIM, SCRIM_ALPHA } from './palette-tokens.js'
import type { ColorVisionMode } from './accessibility.js'

const ZERO = 0
const CHANNEL_MAX = 255
const RED_INDEX = 0
const GREEN_INDEX = 1
const BLUE_INDEX = 2
type ChannelIndex = typeof RED_INDEX | typeof GREEN_INDEX | typeof BLUE_INDEX
const SQUARED_EXPONENT = 2
const OPAQUE = 1

/** WCAG 2.x sRGB-to-linear gamma constants. */
const SRGB_LINEAR_THRESHOLD = 0.03928
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_GAMMA_OFFSET = 0.055
const SRGB_GAMMA_SCALE = 1.055
const SRGB_GAMMA_EXPONENT = 2.4

const LUMINANCE_WEIGHT_RED = 0.2126
const LUMINANCE_WEIGHT_GREEN = 0.7152
const LUMINANCE_WEIGHT_BLUE = 0.0722

const WCAG_CONTRAST_OFFSET = 0.05

const clampChannel = (value: number): number => {
  if (Number.isNaN(value)) {
    return ZERO
  }
  return Math.min(CHANNEL_MAX, Math.max(ZERO, Math.round(value)))
}

const channelLuminance = (value: number): number => {
  const scaled = clampChannel(value) / CHANNEL_MAX
  if (scaled <= SRGB_LINEAR_THRESHOLD) {
    return scaled / SRGB_LINEAR_DIVISOR
  }
  return ((scaled + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT
}

/** WCAG 2.x relative luminance. */
export const relativeLuminance = (color: Rgb): number =>
  LUMINANCE_WEIGHT_RED * channelLuminance(color[RED_INDEX]) +
  LUMINANCE_WEIGHT_GREEN * channelLuminance(color[GREEN_INDEX]) +
  LUMINANCE_WEIGHT_BLUE * channelLuminance(color[BLUE_INDEX])

/** WCAG 2.x contrast ratio, 1..21. */
export const contrastRatio = (left: Rgb, right: Rgb): number => {
  const leftLuminance = relativeLuminance(left)
  const rightLuminance = relativeLuminance(right)
  return (
    (Math.max(leftLuminance, rightLuminance) + WCAG_CONTRAST_OFFSET) /
    (Math.min(leftLuminance, rightLuminance) + WCAG_CONTRAST_OFFSET)
  )
}

/** Straight sRGB distance. */
export const separation = (left: Rgb, right: Rgb): number =>
  Math.sqrt(
    (left[RED_INDEX] - right[RED_INDEX]) ** SQUARED_EXPONENT +
      (left[GREEN_INDEX] - right[GREEN_INDEX]) ** SQUARED_EXPONENT +
      (left[BLUE_INDEX] - right[BLUE_INDEX]) ** SQUARED_EXPONENT,
  )

export const COLLAPSE_SEPARATION = 24
export const TEXT_CONTRAST_MIN = 4.5
export const UI_CONTRAST_MIN = 3

// Simulation coefficients, one named constant per matrix cell so the matrix
// Literal below never repeats a bare number. `<MODE>_<OUTPUT>_FROM_<INPUT>` is
// The weight the OUTPUT channel takes from the INPUT channel; ZERO stands for
// Every cell where a channel takes no weight from that input at all.
const PROTANOPIA_R_FROM_R = 0.567
const PROTANOPIA_R_FROM_G = 0.433
const PROTANOPIA_G_FROM_R = 0.558
const PROTANOPIA_G_FROM_G = 0.442
const PROTANOPIA_B_FROM_G = 0.242
const PROTANOPIA_B_FROM_B = 0.758

const DEUTERANOPIA_R_FROM_R = 0.625
const DEUTERANOPIA_R_FROM_G = 0.375
const DEUTERANOPIA_G_FROM_R = 0.7
const DEUTERANOPIA_G_FROM_G = 0.3
const DEUTERANOPIA_B_FROM_G = 0.3
const DEUTERANOPIA_B_FROM_B = 0.7

const TRITANOPIA_R_FROM_R = 0.95
const TRITANOPIA_R_FROM_G = 0.05
const TRITANOPIA_G_FROM_G = 0.433
const TRITANOPIA_G_FROM_B = 0.567
const TRITANOPIA_B_FROM_G = 0.475
const TRITANOPIA_B_FROM_B = 0.525

const SIMULATION_MATRICES: ReadonlyMap<ColorVisionMode, readonly [Rgb, Rgb, Rgb]> = new Map([
  [
    'protanopia' as ColorVisionMode,
    [
      [PROTANOPIA_R_FROM_R, PROTANOPIA_R_FROM_G, ZERO],
      [PROTANOPIA_G_FROM_R, PROTANOPIA_G_FROM_G, ZERO],
      [ZERO, PROTANOPIA_B_FROM_G, PROTANOPIA_B_FROM_B],
    ],
  ],
  [
    'deuteranopia' as ColorVisionMode,
    [
      [DEUTERANOPIA_R_FROM_R, DEUTERANOPIA_R_FROM_G, ZERO],
      [DEUTERANOPIA_G_FROM_R, DEUTERANOPIA_G_FROM_G, ZERO],
      [ZERO, DEUTERANOPIA_B_FROM_G, DEUTERANOPIA_B_FROM_B],
    ],
  ],
  [
    'tritanopia' as ColorVisionMode,
    [
      [TRITANOPIA_R_FROM_R, TRITANOPIA_R_FROM_G, ZERO],
      [ZERO, TRITANOPIA_G_FROM_G, TRITANOPIA_G_FROM_B],
      [ZERO, TRITANOPIA_B_FROM_G, TRITANOPIA_B_FROM_B],
    ],
  ],
] as const)

/** What a player with this deficiency sees. `off` is the identity. */
export const simulateColorVision = (color: Rgb, mode: ColorVisionMode): Rgb => {
  const matrix = SIMULATION_MATRICES.get(mode)
  if (typeof matrix === 'undefined') {
    return color
  }

  const row = (index: ChannelIndex): number =>
    clampChannel(
      matrix[index][RED_INDEX] * color[RED_INDEX] +
        matrix[index][GREEN_INDEX] * color[GREEN_INDEX] +
        matrix[index][BLUE_INDEX] * color[BLUE_INDEX],
    )
  return [row(RED_INDEX), row(GREEN_INDEX), row(BLUE_INDEX)]
}

const clampAlpha = (alpha: number): number => {
  if (Number.isNaN(alpha)) {
    return OPAQUE
  }
  return Math.min(OPAQUE, Math.max(ZERO, alpha))
}

/** Source-over compositing in sRGB space, matching CSS. */
export const compositeOver = (color: Rgb, alpha: number, backdrop: Rgb): Rgb => {
  const amount = clampAlpha(alpha)
  const blend = (index: ChannelIndex): number =>
    amount * color[index] + (OPAQUE - amount) * backdrop[index]
  return [blend(RED_INDEX), blend(GREEN_INDEX), blend(BLUE_INDEX)]
}

export const SCRIM_OVER_DARKEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [
  ZERO,
  ZERO,
  ZERO,
])
export const SCRIM_OVER_BRIGHTEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [
  CHANNEL_MAX,
  CHANNEL_MAX,
  CHANNEL_MAX,
])

/** The exact worst contrast over the full range of possible world pixels. */
export const worstCaseContrastOnScrim = (color: Rgb): number =>
  Math.min(
    contrastRatio(color, SCRIM_OVER_DARKEST_WORLD),
    contrastRatio(color, SCRIM_OVER_BRIGHTEST_WORLD),
  )
