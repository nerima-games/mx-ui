/** Colour arithmetic used by the palette accessibility survey. */
import type { ColorVisionMode } from './accessibility'
import { SCRIM, SCRIM_ALPHA, type Rgb } from './palette-tokens'

const clampChannel = (value: number): number =>
  Number.isNaN(value) ? 0 : Math.min(255, Math.max(0, Math.round(value)))

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

/** Straight sRGB distance. */
export const separation = (left: Rgb, right: Rgb): number =>
  Math.sqrt(
    (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2,
  )

export const COLLAPSE_SEPARATION = 24
export const TEXT_CONTRAST_MIN = 4.5
export const UI_CONTRAST_MIN = 3

const SIMULATION_MATRICES: ReadonlyMap<ColorVisionMode, readonly [Rgb, Rgb, Rgb]> = new Map([
  ['protanopia' as ColorVisionMode, [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]]],
  ['deuteranopia' as ColorVisionMode, [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]]],
  ['tritanopia' as ColorVisionMode, [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]],
] as const)

/** What a player with this deficiency sees. `off` is the identity. */
export const simulateColorVision = (color: Rgb, mode: ColorVisionMode): Rgb => {
  const matrix = SIMULATION_MATRICES.get(mode)
  if (matrix === undefined) return color

  const row = (index: 0 | 1 | 2): number =>
    clampChannel(
      matrix[index][0] * color[0] + matrix[index][1] * color[1] + matrix[index][2] * color[2],
    )
  return [row(0), row(1), row(2)]
}

/** Source-over compositing in sRGB space, matching CSS. */
export const compositeOver = (color: Rgb, alpha: number, backdrop: Rgb): Rgb => {
  const amount = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha))
  const blend = (index: 0 | 1 | 2): number => amount * color[index] + (1 - amount) * backdrop[index]
  return [blend(0), blend(1), blend(2)]
}

export const SCRIM_OVER_DARKEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [0, 0, 0])
export const SCRIM_OVER_BRIGHTEST_WORLD: Rgb = compositeOver(SCRIM, SCRIM_ALPHA, [255, 255, 255])

/** The exact worst contrast over the full range of possible world pixels. */
export const worstCaseContrastOnScrim = (color: Rgb): number =>
  Math.min(
    contrastRatio(color, SCRIM_OVER_DARKEST_WORLD),
    contrastRatio(color, SCRIM_OVER_BRIGHTEST_WORLD),
  )
