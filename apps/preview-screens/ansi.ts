/**
 * Terminal styling. The colour ARITHMETIC now lives in `domain/palette.ts`.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * What moved, and why it had to
 * ---------------------------------------------------------------------------
 *
 * This file used to own the Viénot–Brettel–Mollon simulation matrices, the WCAG
 * luminance and contrast formulas, the RGB distance metric and the collapse
 * threshold. All four are now in `domain/palette.ts` and are imported from
 * there.
 *
 * The reason is not tidiness. `domain/palette.ts` states a GUARANTEE about the
 * palette — every critical pair stays apart under all four colour-vision modes
 * — and a guarantee whose arithmetic lives in a dev application cannot be a
 * test. It could only ever be a report, and this directory's own README is
 * emphatic that a finding living in a report is a finding nobody reads. So the
 * arithmetic went where `test/view-model.test.ts` can reach it, and the preview
 * became one of its two readers rather than its owner.
 *
 * The other reason is the one DN-UI-7c is the record of: a second copy of one
 * derivation eventually disagrees with the first. When the preview measured
 * colours it had invented, two copies were merely wasteful; now that it
 * measures the shipped palette, two copies would let `--stats` report a clean
 * table for a palette the test suite had already rejected.
 *
 * ---------------------------------------------------------------------------
 * Two different things are called "colour vision mode", and neither is here
 * ---------------------------------------------------------------------------
 *
 * The CORRECTION (feColorMatrix daltonisation — what gets drawn differently)
 * is `colorVisionMatrix` in `domain/accessibility.ts`. The SIMULATION (what a
 * player sees) is `simulateColorVision` in `domain/palette.ts`. They are in two
 * modules that point at each other, deliberately, because swapping one for the
 * other breaks precisely what the setting exists to fix — DN-UI-1a at length.
 * This file consumes the simulation and never the correction: `--simulate`
 * answers "is the HUD readable in protanopia", which is a question about the
 * palette and not about the canvas.
 *
 * ---------------------------------------------------------------------------
 * Why there is no colour library
 * ---------------------------------------------------------------------------
 *
 * `pnpm check:deps` gates `apps/` exactly like `domain/`, and a dependency added
 * for a dev tool is still a dependency CI installs. mc-worldgen's preview renders
 * a full truecolour terrain map with none; this one needs a 3x3 matrix multiply
 * and a luminance formula, and both now ship.
 */
import type { ColorVisionMode } from '../../domain/accessibility'
import {
  COLLAPSE_SEPARATION,
  contrastRatio,
  hex,
  relativeLuminance,
  separation,
  simulateColorVision,
  type Rgb,
} from '../../domain/palette'

export type { Rgb }

/** Re-exported so the screens keep one import site for colour arithmetic. */
export { contrastRatio, hex, relativeLuminance, simulateColorVision }

/** The preview's older names for two domain functions, kept so screens read the same. */
export const distance = separation
export const COLLAPSE_DISTANCE = COLLAPSE_SEPARATION

/**
 * `mode` arrives as a `ColorVisionMode` from the domain and as a `--simulate`
 * string from the command line, so the string form is narrowed here rather than
 * loosening the domain signature.
 */
export const simulate = (color: Rgb, mode: string): Rgb =>
  simulateColorVision(color, mode as ColorVisionMode)

/**
 * ESC (0x1B).
 *
 * Built with `String.fromCharCode` rather than written as a literal, so no raw
 * control byte sits in a source file that `grep`, `git diff` and the dependency
 * gate's source masker all have to read.
 */
export const ESC: string = String.fromCharCode(27)

export const RESET = `${ESC}[0m`

const foreground = (color: Rgb): string =>
  `${ESC}[38;2;${String(color[0])};${String(color[1])};${String(color[2])}m`

const background = (color: Rgb): string =>
  `${ESC}[48;2;${String(color[0])};${String(color[1])};${String(color[2])}m`

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

export type Style = {
  readonly paint: (text: string, color: Rgb) => string
  readonly cell: (text: string, color: Rgb, backdrop: Rgb | undefined) => string
  readonly bold: (text: string) => string
  readonly dim: (text: string) => string
  /** What a colour becomes on screen. Exposed so a screen can print the number. */
  readonly seen: (color: Rgb) => Rgb
  readonly simulating: boolean
}

export const makeStyle = (options: {
  readonly ascii: boolean
  /** `off` or a `ColorVisionMode`. Applied to every colour this style emits. */
  readonly simulateMode: string
}): Style => {
  const seen = (color: Rgb): Rgb => simulate(color, options.simulateMode)

  if (options.ascii) {
    return {
      paint: (text) => text,
      cell: (text) => text,
      bold: (text) => text,
      dim: (text) => text,
      seen,
      simulating: options.simulateMode !== 'off',
    }
  }

  return {
    paint: (text, color) => `${foreground(seen(color))}${text}${RESET}`,
    cell: (text, color, backdrop) =>
      `${backdrop === undefined ? '' : background(seen(backdrop))}${foreground(seen(color))}${text}${RESET}`,
    bold: (text) => `${ESC}[1m${text}${ESC}[22m`,
    dim: (text) => `${ESC}[2m${text}${ESC}[22m`,
    seen,
    simulating: options.simulateMode !== 'off',
  }
}

export const mix = (low: Rgb, high: Rgb, amount: number): Rgb => {
  const t = Math.min(Math.max(amount, 0), 1)
  return [
    Math.round(low[0] + (high[0] - low[0]) * t),
    Math.round(low[1] + (high[1] - low[1]) * t),
    Math.round(low[2] + (high[2] - low[2]) * t),
  ]
}

export const padEnd = (text: string, width: number): string =>
  text.length >= width ? text : text + ' '.repeat(width - text.length)

export const padStart = (text: string, width: number): string =>
  text.length >= width ? text : ' '.repeat(width - text.length) + text
