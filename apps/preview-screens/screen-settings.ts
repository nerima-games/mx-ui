/**
 * The settings screen: colour vision, reduced motion, key remapping.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * The three assets plan.md §3.13 asks to be carried over, on one screen
 * ---------------------------------------------------------------------------
 *
 * 「色覚モード(feColorMatrix ダルトナイゼーション、canvasのみに適用)、reduced-motion、
 * キーリマッピングUI、サウンド字幕」. Captions have their own screen; the other three
 * are here, and each one is displayed as WHAT THE DOM LAYER WOULD DO rather than
 * as a checkbox, because that is the part `domain/accessibility.ts` actually
 * owns: the attribute value, the resolved preference, the duration, the
 * `RebindResult`.
 *
 * ---------------------------------------------------------------------------
 * Two different transforms, and the preview must not conflate them
 * ---------------------------------------------------------------------------
 *
 *   - `colorVision` is the SETTING. It produces `data-color-vision="protanopia"`
 *     on `<body>`, scoped by CSS to the canvas alone
 *     (`COLOR_VISION_FILTER_TARGET`), and installs the `feColorMatrix` whose
 *     twenty numbers `colorVisionMatrix` supplies. The screen prints all three,
 *     because all three are what the DOM layer would do.
 *   - `simulate` is a PREVIEW TOOL. It redraws the frame as a player with that
 *     deficiency would see it, which is the only way to answer "is this
 *     readable". It is labelled on screen every time it is on, because a
 *     screenshot of a simulated frame mistaken for a corrected one would be
 *     worse than no screenshot.
 */
import {
  animationDurationMs,
  colorVisionAttribute,
  colorVisionMatrixValues,
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_FILTER_TARGET,
  COLOR_VISION_MODES,
  REBIND_CLEAR_KEYS,
  resolveMotionPreference,
  shouldAnimate,
  unboundActions,
  type ColorVisionMode,
  type InputAction,
  type KeyBindings,
  type MotionSetting,
} from '../../domain/accessibility'
import { contrastRatio, distance, hex, padEnd, simulate, COLLAPSE_DISTANCE, type Style } from './ansi'
import { BAD, CRITICAL_PAIRS, GOOD, INK, MUTED, WARN } from './palette'

const SAMPLE_ANIMATION_MS = 300

const bindingRows = (
  style: Style,
  bindings: KeyBindings,
  actions: ReadonlyArray<InputAction>,
  selected: number,
  rebinding: boolean,
): ReadonlyArray<string> => {
  const unbound = new Set(unboundActions(bindings, actions))

  return actions.map((action, index) => {
    const code = bindings.get(action)
    const marker = index === selected ? (rebinding ? '>>' : ' >') : '  '
    const value =
      code === undefined
        ? style.paint('unbound', WARN)
        : style.paint(code, INK)
    return `  ${style.paint(marker, MUTED)} ${style.paint(padEnd(action, 14), unbound.has(action) ? WARN : MUTED)} ${value}`
  })
}

/**
 * The measurement that makes the colour-vision switch mean something.
 *
 * For each pair of colours that must stay distinguishable, the WCAG contrast
 * ratio and the raw distance AFTER the current simulation. A pair that collapses
 * is named and the reason it matters is printed next to it — a table of ratios
 * with no "so what" column is a table nobody acts on.
 */
const contrastRows = (style: Style, mode: string): ReadonlyArray<string> =>
  CRITICAL_PAIRS.map((pair) => {
    const left = simulate(pair.left.rgb, mode)
    const right = simulate(pair.right.rgb, mode)
    const apart = distance(left, right)
    const ratio = contrastRatio(left, right)
    const collapsed = apart < COLLAPSE_DISTANCE

    return `  ${style.paint(padEnd(`${pair.left.name} / ${pair.right.name}`, 34), MUTED)}${style.paint(
      padEnd(`${hex(left)} ${hex(right)}`, 18),
      INK,
    )}${style.paint(padEnd(`${apart.toFixed(0)} apart`, 12), collapsed ? BAD : GOOD)}${style.paint(
      padEnd(`${ratio.toFixed(2)}:1`, 10),
      ratio < 3 ? WARN : GOOD,
    )}${collapsed ? style.paint(`same colour — ${pair.why}`, BAD) : style.dim(pair.why)}`
  })

export const renderSettings = (
  style: Style,
  options: {
    readonly colorVision: ColorVisionMode
    readonly simulating: boolean
    readonly motion: MotionSetting
    readonly systemPrefersReducedMotion: boolean
    readonly bindings: KeyBindings
    readonly actions: ReadonlyArray<InputAction>
    readonly selectedAction: number
    readonly rebinding: boolean
    readonly rebindNote: string
  },
): ReadonlyArray<string> => {
  const resolved = resolveMotionPreference(options.motion, options.systemPrefersReducedMotion)
  const attribute = colorVisionAttribute(options.colorVision)
  const matrixValues = colorVisionMatrixValues(options.colorVision)
  const mode = options.simulating ? options.colorVision : 'off'

  return [
    style.bold('settings — accessibility'),
    '',
    style.paint('colour vision', INK),
    `  ${style.paint(padEnd('setting', 22), MUTED)}${COLOR_VISION_MODES.map((candidate) =>
      candidate === options.colorVision
        ? style.paint(`[${candidate}]`, INK)
        : style.dim(` ${candidate} `),
    ).join(' ')}`,
    `  ${style.paint(padEnd('body attribute', 22), MUTED)}${
      attribute === undefined
        ? style.dim('(removed — mode is off)')
        : style.paint(`data-color-vision="${attribute}"`, INK)
    }`,
    `  ${style.paint(padEnd('filter scope', 22), MUTED)}${style.paint(COLOR_VISION_FILTER_TARGET, INK)}   ${style.dim('the correction applies to the canvas ONLY — UI chrome is already accessible')}`,
    `  ${style.paint(padEnd('preview simulation', 22), MUTED)}${
      options.simulating
        ? style.paint(`ON — this frame is drawn as ${options.colorVision} SEES it`, WARN)
        : style.dim('off (press V)')
    }`,
    `  ${style.paint(padEnd('feColorMatrix', 22), MUTED)}${
      matrixValues === undefined
        ? style.dim('(none — "off" installs no filter)')
        : style.paint(matrixValues, INK)
    }`,
    `  ${style.paint(padEnd('colour space', 22), MUTED)}${style.paint(COLOR_VISION_FILTER_COLOR_SPACE, INK)}   ${style.dim('not SVG’s linearRGB default, which over-brightens midtones')}`,
    '',
    style.paint(`contrast between colours that must stay distinguishable  (simulation: ${mode})`, INK),
    `  ${style.dim(padEnd('pair', 34))}${style.dim(padEnd('as seen', 18))}${style.dim(padEnd('distance', 12))}${style.dim(padEnd('contrast', 10))}`,
    ...contrastRows(style, mode),
    style.dim('  these colours are the PREVIEW’s own: mx-ui defines no palette yet. The harness is real,'),
    style.dim('  the values under test are placeholders.'),
    '',
    style.paint('motion', INK),
    `  ${style.paint(padEnd('setting', 22), MUTED)}${style.paint(options.motion, INK)}   ${style.dim('system defers to the OS, and is the default on purpose')}`,
    `  ${style.paint(padEnd('OS prefers reduced', 22), MUTED)}${style.paint(String(options.systemPrefersReducedMotion), INK)}`,
    `  ${style.paint(padEnd('resolved', 22), MUTED)}${style.paint(resolved, resolved === 'reduced' ? WARN : GOOD)}`,
    `  ${style.paint(padEnd('a 300ms animation', 22), MUTED)}${style.paint(`${String(animationDurationMs(SAMPLE_ANIMATION_MS, resolved))}ms`, INK)}   ${style.dim('zero, not shorter — a 100ms screen shake is still a screen shake')}`,
    `  ${style.paint(padEnd('decorative animation', 22), MUTED)}${style.paint(shouldAnimate(resolved) ? 'runs' : 'suppressed', INK)}`,
    '',
    style.paint('key bindings', INK),
    ...bindingRows(style, options.bindings, options.actions, options.selectedAction, options.rebinding),
    `  ${style.dim(`clear keys: ${[...REBIND_CLEAR_KEYS].join(', ')} — these unbind and can never be bound`)}`,
    options.rebindNote === '' ? style.dim('  (j/k choose an action, b rebinds it)') : `  ${style.paint(options.rebindNote, WARN)}`,
  ]
}
