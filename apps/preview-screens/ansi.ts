/**
 * Colour — including the part that makes this preview worth having.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * Two different things are called "colour vision mode", and only one is here
 * ---------------------------------------------------------------------------
 *
 * plan.md §3.13 asks mx-ui to carry over 「色覚モード(feColorMatrix ダルトナイゼー
 * ション、canvasのみに適用)」. That is a CORRECTION: a matrix that rewrites colours
 * so a player with a colour vision deficiency can tell them apart. In the
 * reference implementation those matrices live in `index.html`, and
 * `packages/presentation/hud/color-vision.ts` only flips a `data-color-vision`
 * attribute that a CSS rule keys on. `domain/accessibility.ts` now owns BOTH
 * halves — `colorVisionAttribute` / `COLOR_VISION_FILTER_TARGET` and
 * `colorVisionMatrix` — and `--stats` §5 prints the matrices and the arithmetic
 * that shows they are transcribed correctly.
 *
 * What the preview adds on top of that, and what actually answers the question
 * "is the HUD readable in protanopia?", is the other transform: a SIMULATION of
 * the deficiency, applied to the whole frame. That is a preview-local tool,
 * marked as such everywhere it appears, and it is what turns "we have a colour
 * vision setting" into "we know what the setting is for".
 *
 * The matrices below are the standard Viénot–Brettel–Mollon (1999) dichromat
 * simulation approximations in sRGB, the same set every accessibility tool
 * uses. **They are NOT the daltonisation matrices** — a simulation shows what a
 * player sees, a correction changes what is drawn — and must never be swapped
 * for the ones in `domain/accessibility.ts`, in either direction.
 *
 * ---------------------------------------------------------------------------
 * Why there is no colour library
 * ---------------------------------------------------------------------------
 *
 * `pnpm check:deps` gates `apps/` exactly like `domain/`, and a dependency added
 * for a dev tool is still a dependency CI installs. mc-worldgen's preview renders
 * a full truecolour terrain map with none; this one needs a 3x3 matrix multiply
 * and a luminance formula.
 */

export type Rgb = readonly [number, number, number]

/**
 * ESC (0x1B).
 *
 * Built with `String.fromCharCode` rather than written as a literal, so no raw
 * control byte sits in a source file that `grep`, `git diff` and the dependency
 * gate's source masker all have to read.
 */
export const ESC: string = String.fromCharCode(27)

export const RESET = `${ESC}[0m`

const clampChannel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

const foreground = (color: Rgb): string =>
  `${ESC}[38;2;${String(color[0])};${String(color[1])};${String(color[2])}m`

const background = (color: Rgb): string =>
  `${ESC}[48;2;${String(color[0])};${String(color[1])};${String(color[2])}m`

// ---------------------------------------------------------------------------
// Colour vision simulation
// ---------------------------------------------------------------------------

/**
 * The four modes `domain/accessibility.ts` defines, as a simulation.
 *
 * `off` is the identity. The other three are dichromat approximations; a real
 * anomalous trichromat (the common case) sees something between the two.
 */
export type SimulationMatrix = readonly [Rgb, Rgb, Rgb]

const IDENTITY: SimulationMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/**
 * A Map rather than an object literal: `mode` arrives as a `ColorVisionMode`
 * from the domain and as a `--simulate` string from the command line, and a
 * lookup that returns `undefined` for an unknown key is easier to be honest
 * about than an index signature.
 */
export const SIMULATION_MATRICES: ReadonlyMap<string, SimulationMatrix> = new Map([
  ['off', IDENTITY],
  [
    'protanopia',
    [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0, 0.242, 0.758],
    ] as SimulationMatrix,
  ],
  [
    'deuteranopia',
    [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7],
    ] as SimulationMatrix,
  ],
  [
    'tritanopia',
    [
      [0.95, 0.05, 0],
      [0, 0.433, 0.567],
      [0, 0.475, 0.525],
    ] as SimulationMatrix,
  ],
])

export const simulate = (color: Rgb, mode: string): Rgb => {
  const matrix = SIMULATION_MATRICES.get(mode) ?? IDENTITY
  return [
    clampChannel(matrix[0][0] * color[0] + matrix[0][1] * color[1] + matrix[0][2] * color[2]),
    clampChannel(matrix[1][0] * color[0] + matrix[1][1] * color[1] + matrix[1][2] * color[2]),
    clampChannel(matrix[2][0] * color[0] + matrix[2][1] * color[1] + matrix[2][2] * color[2]),
  ]
}

// ---------------------------------------------------------------------------
// Measurements, so "is this readable" has an answer that is not an opinion
// ---------------------------------------------------------------------------

const channelLuminance = (value: number): number => {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x relative luminance. */
export const relativeLuminance = (color: Rgb): number =>
  0.2126 * channelLuminance(color[0]) +
  0.7152 * channelLuminance(color[1]) +
  0.0722 * channelLuminance(color[2])

/** WCAG 2.x contrast ratio, 1..21. Text needs 4.5, large text and UI parts 3. */
export const contrastRatio = (left: Rgb, right: Rgb): number => {
  const a = relativeLuminance(left)
  const b = relativeLuminance(right)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Straight RGB distance.
 *
 * Crude on purpose. The question it answers is "did these two colours collapse
 * into each other", not "how different do they look", and for the first question
 * a threshold on a crude metric is honest where a perceptual metric would invite
 * arguing about the last few units.
 */
export const distance = (left: Rgb, right: Rgb): number =>
  Math.sqrt(
    (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2,
  )

/**
 * Below this, two colours are the same colour for practical purposes.
 *
 * 24/442 of the diagonal of the RGB cube. Chosen so that the two greens a UI
 * would use for "ok" and "selected" count as distinct, and the red/green pair
 * that protanopia collapses does not.
 */
export const COLLAPSE_DISTANCE = 24

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

export const hex = (color: Rgb): string =>
  `#${color.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`
