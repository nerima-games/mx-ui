/**
 * `apps/preview-screens` — each screen booted on its own with mocked state.
 *
 * plan.md §3.13 asks mx-ui for exactly this: 「各画面を単体で起動できる状態モック付き
 * プレビュー」, and plan.md §6 Step 2 makes it half the completion criterion — tests
 * green AND the built-in preview operable. plan.md §4.1 requires it to live with
 * the thing it verifies, so it is a dev application INSIDE mx-ui: not a package,
 * not part of `index.ts`, and not something a consumer can import.
 *
 * ---------------------------------------------------------------------------
 * THE DECISION: a terminal renderer of the VIEW MODEL, not a DOM preview
 * ---------------------------------------------------------------------------
 *
 * mx-ui is the DOM repository (`tsconfig.base.json` is the only one of the
 * sixteen with "DOM" in `lib`), so a browser preview is the obvious answer and it
 * is the wrong one today. The reasoning, in the order it actually decided:
 *
 *  1. **There is no DOM code to preview.** `index.ts` exports four pure
 *     derivations and a stage registration; `domain/` contains no `document`
 *     reference and the barrel exports no renderer, no element, no stylesheet.
 *     A DOM preview would therefore have to WRITE the DOM layer first — inside
 *     `apps/`, where it can never ship. The preview would be previewing itself.
 *  2. **The view models are the thing under test, and they are pure.** The whole
 *     suite runs under `environment: 'node'` because "nineteen health points is
 *     nine hearts and a half" is a function, not a rendering
 *     (`domain/hud-view-model.ts:1-26`). A terminal renderer of that function is
 *     a second, independent projection of the same value the browser will
 *     project — so what it shows about the MODEL transfers exactly.
 *  3. **A browser preview costs a bundler, a browser and a server**, and buys
 *     layout fidelity — which is the part no view model claims anything about.
 *     `pnpm preview --once --ascii` can be piped, diffed and pasted into an
 *     issue; a screenshot cannot be grepped.
 *  4. **The accessibility work is measurable in a terminal and hard to measure
 *     in a browser.** Contrast ratios and colour-vision simulation are
 *     arithmetic on RGB triples. Doing it here means `--stats` can print a table
 *     of every pair that collapses under every mode, which is a thing you can
 *     put in a pull request.
 *
 * **What is lost, plainly.** This preview cannot tell you that the hotbar
 * overflows its container at 320px, that the caption list overlaps the crosshair,
 * that a focus ring is missing, or that a screen reader announces the wrong
 * thing. Those are DOM questions and they need a DOM preview. When the first
 * screen is written, a browser preview belongs beside this one — not instead of
 * it, because a DOM preview cannot show you whether the heart row and the
 * `dead` flag agree about a NaN, and this one can. It is how that disagreement
 * was found (`--stats`, F2).
 *
 * ---------------------------------------------------------------------------
 * What was NOT weakened to make this work
 * ---------------------------------------------------------------------------
 *
 * `tsconfig.build.json` proves something specific: `types: []` is inherited, so a
 * Node global in `domain/` fails the build, which is what keeps mx-ui
 * browser-only (「a `process.env` read must not typecheck」,
 * `tsconfig.base.json`). This app needs Node's stdio, so it gets its OWN project
 * — `tsconfig.preview.json` with `types: ["node"]` — and `tsconfig.build.json` is
 * untouched. The guarantee still holds over exactly the code it held over
 * before.
 *
 * ---------------------------------------------------------------------------
 * Constraints this app is written under
 * ---------------------------------------------------------------------------
 *
 *  - `apps` is in `SCAN_ROOTS` (scripts/check-dependency-whitelist.ts), so the
 *    preview's imports are gated like any other source here. It imports this
 *    repository's own modules and nothing else — no org package, no npm
 *    dependency, not even a colour library.
 *  - The `Date.now()` / `new Date()` / `performance.now()` ban applies. It is
 *    satisfied without an escape hatch: the clock is a number in `state.ts` that
 *    a keystroke advances. `mc-kernel-allow-time-source` is not taken.
 *  - `pnpm verify` does not run this app. `tsconfig.preview.json` typechecks it
 *    and `pnpm lint` lints it; `pnpm preview` is not a gate.
 */
import { resolveMotionPreference } from '../../src/domain/accessibility'
import { makeStyle, padEnd, type Style } from './ansi'
import { parseArguments, USAGE, type PreviewOptions } from './options'
import { ASCII_ICONS, BLOCK_ICONS, INK, MUTED, WARN } from './palette'
import { renderCaptions } from './screen-captions'
import { renderHud } from './screen-hud'
import { renderInventory } from './screen-inventory'
import { renderSettings } from './screen-settings'
import { buildStatsReport } from './stats'
import {
  adjustExperience,
  adjustHealth,
  adjustHunger,
  advanceClock,
  applyRebind,
  beginRebind,
  cycleColorVision,
  cycleMotion,
  damageHeld,
  emitCaption,
  emptyHeldSlot,
  injectNaNHealth,
  makeState,
  moveActionCursor,
  MODAL_SCREENS,
  openModal,
  PREVIEW_ACTIONS,
  pressEscape,
  repeatCaption,
  resetVitals,
  selectSlot,
  SCREEN_NAMES,
  toggleAudioUnlocked,
  toggleCaptions,
  toggleSimulation,
  toggleSystemMotion,
  type PreviewState,
} from './state'
import {
  codeForKey,
  enterFullScreen,
  isInteractive,
  leaveFullScreen,
  onExit,
  onInputEnd,
  onKey,
  onResize,
  paintFrame,
  screenSize,
  writeLine,
} from './terminal'

/**
 * Set once at start-up so every screen draws with the same icon set.
 *
 * Three SHAPES, not three colours — `palette.ts` explains why that is
 * load-bearing rather than decorative. `--ascii` swaps them for plain characters
 * so a pasted frame stays both readable and shape-distinct.
 */
let icons = BLOCK_ICONS

const frameSize = (options: PreviewOptions): { readonly columns: number; readonly rows: number } => {
  const screen = screenSize()
  return {
    columns: Math.max(60, options.width ?? screen.columns),
    rows: Math.max(12, options.height ?? screen.rows),
  }
}

const styleFor = (state: PreviewState, options: PreviewOptions): Style =>
  makeStyle({
    ascii: options.ascii,
    simulateMode: state.simulate ? state.colorVision : 'off',
  })

const header = (state: PreviewState, style: Style): ReadonlyArray<string> => {
  const tabs = SCREEN_NAMES.map((name) =>
    name === state.screen ? style.paint(`[${name}]`, INK) : style.dim(` ${name} `),
  ).join(' ')

  return [
    `${style.bold('mx-ui screens')}  ${tabs}  ${style.dim(`t = ${state.nowSecs.toFixed(2)}s`)}${
      state.simulate
        ? style.paint(`   SIMULATING ${state.colorVision.toUpperCase()} — colours below are what a player SEES`, WARN)
        : ''
    }`,
    '',
  ]
}

const body = (state: PreviewState, style: Style, columns: number): ReadonlyArray<string> => {
  if (state.screen === 'hud') {
    return renderHud(style, state.vitals, icons, columns)
  }
  if (state.screen === 'captions') {
    return renderCaptions(
      style,
      state.captions,
      state.captionSettings,
      state.nowSecs,
      resolveMotionPreference(state.motion, state.systemPrefersReducedMotion),
    )
  }
  if (state.screen === 'settings') {
    return renderSettings(style, {
      colorVision: state.colorVision,
      simulating: state.simulate,
      motion: state.motion,
      systemPrefersReducedMotion: state.systemPrefersReducedMotion,
      bindings: state.bindings,
      actions: PREVIEW_ACTIONS,
      selectedAction: state.actionIndex,
      rebinding: state.rebinding,
      rebindNote: state.rebindNote,
    })
  }
  return renderInventory(style, state.modals, state.escapeLog, MODAL_SCREENS)
}

const KEY_HINT =
  'tab screen  - = health  [ ] hunger  , . xp  < > slot  d wear  E empty  N NaN  e caption  t clock  v vision  V simulate  m motion  b rebind  o modal  Esc modal-escape  ? help  x quit'

const footer = (state: PreviewState, style: Style): ReadonlyArray<string> => [
  '',
  `${style.paint(padEnd('last', 6), MUTED)}${state.note === '' ? style.dim('—') : style.paint(state.note, INK)}`,
  style.dim(KEY_HINT),
]

const render = (state: PreviewState, options: PreviewOptions, style: Style): ReadonlyArray<string> => {
  const { columns } = frameSize(options)
  if (state.showHelp) {
    return [...USAGE.map((line) => style.dim(line)), '', style.dim('press any key to return')]
  }
  return [...header(state, style), ...body(state, style, columns), ...footer(state, style)]
}

/** Screen switching: tab and the 1-4 shortcuts. */
const handleScreenKey = (state: PreviewState, key: string): string | undefined => {
  if (key === 'tab') {
    const index = SCREEN_NAMES.indexOf(state.screen)
    state.screen = SCREEN_NAMES[(index + 1) % SCREEN_NAMES.length] ?? 'hud'
    return `screen: ${state.screen}`
  }
  if (key === '1' || key === '2' || key === '3' || key === '4') {
    const target = SCREEN_NAMES[Number(key) - 1]
    if (target !== undefined) {
      state.screen = target
      return `screen: ${target}`
    }
  }
  return undefined
}

/** Health, hunger, XP and the held hotbar slot. */
const handleVitalsKey = (state: PreviewState, key: string): string | undefined => {
  switch (key) {
    case '-':
      return adjustHealth(state, -1)
    case '=':
      return adjustHealth(state, 1)
    case '[':
      return adjustHunger(state, -1)
    case ']':
      return adjustHunger(state, 1)
    case ',':
      return adjustExperience(state, -0.1)
    case '.':
      return adjustExperience(state, 0.1)
    case '<':
      return selectSlot(state, -1)
    case '>':
      return selectSlot(state, 1)
    case 'd':
      return damageHeld(state, -0.1)
    case 'D':
      return damageHeld(state, 0.1)
    case 'E':
      return emptyHeldSlot(state)
    case 'N':
      return injectNaNHealth(state)
    case 'r':
      return resetVitals(state)
    default:
      return undefined
  }
}

/** Captions and the virtual clock. */
const handleCaptionKey = (state: PreviewState, key: string): string | undefined => {
  switch (key) {
    case 'e':
      return emitCaption(state)
    case 'a':
      return repeatCaption(state)
    case 't':
      return advanceClock(state, 1)
    case 'T':
      return advanceClock(state, 0.25)
    case 'c':
      return toggleCaptions(state)
    case 'u':
      return toggleAudioUnlocked(state)
    default:
      return undefined
  }
}

/** Colour vision, motion and key rebinding. */
const handleAccessibilityKey = (state: PreviewState, key: string): string | undefined => {
  switch (key) {
    case 'v':
      return cycleColorVision(state)
    case 'V':
      return toggleSimulation(state)
    case 'm':
      return cycleMotion(state)
    case 'M':
      return toggleSystemMotion(state)
    case 'j':
    case 'down':
      return moveActionCursor(state, 1)
    case 'k':
    case 'up':
      return moveActionCursor(state, -1)
    case 'b':
      return beginRebind(state)
    default:
      return undefined
  }
}

/** The modal stack's one "open the next screen" key. */
const handleModalKey = (state: PreviewState, key: string): string | undefined => {
  if (key !== 'o') {
    return undefined
  }
  const next = MODAL_SCREENS[state.modals.length % MODAL_SCREENS.length]
  return next === undefined ? 'no screens to open' : openModal(state, next)
}

/** Returns false when the key means "quit". */
const handleKey = (state: PreviewState, key: string): boolean => {
  if (state.showHelp) {
    state.showHelp = false
    return true
  }

  // Rebinding swallows the NEXT keystroke, whatever it is. That is what the
  // screen is for: Escape must clear rather than quit, and a key that is already
  // taken must report a conflict rather than be silently stolen.
  if (state.rebinding) {
    state.note = applyRebind(state, codeForKey(key))
    return true
  }

  if (key === 'x' || key === 'ctrl-c') {
    return false
  }

  // Escape is NOT quit here: it is the input `domain/modal-stack.ts` is built
  // around, and a preview that quit on it could never show what it does.
  if (key === 'escape') {
    state.note = pressEscape(state)
    return true
  }

  if (key === '?') {
    state.showHelp = true
    return true
  }

  const note =
    handleScreenKey(state, key) ??
    handleVitalsKey(state, key) ??
    handleCaptionKey(state, key) ??
    handleAccessibilityKey(state, key) ??
    handleModalKey(state, key)

  if (note !== undefined) {
    state.note = note
  }

  return true
}

const runInteractive = (state: PreviewState, options: PreviewOptions): void => {
  enterFullScreen()

  let restored = false
  const restore = (): void => {
    if (!restored) {
      restored = true
      leaveFullScreen()
    }
  }
  onExit(restore)

  const draw = (): void => {
    paintFrame(render(state, options, styleFor(state, options)))
  }

  const quit = (): void => {
    restore()
    process.exit(0)
  }

  onResize(draw)
  onInputEnd(quit)
  onKey((key) => {
    if (handleKey(state, key)) {
      draw()
      return
    }
    quit()
  })

  draw()
}

const main = (): number => {
  const options = parseArguments(process.argv.slice(2))

  if (options.errors.length > 0) {
    for (const error of options.errors) {
      writeLine(`preview-screens: ${error}`)
    }
    writeLine('')
    for (const line of USAGE) {
      writeLine(line)
    }
    return 1
  }

  if (options.help) {
    for (const line of USAGE) {
      writeLine(line)
    }
    return 0
  }

  if (options.stats) {
    for (const line of buildStatsReport()) {
      writeLine(line)
    }
    return 0
  }

  icons = options.ascii ? ASCII_ICONS : BLOCK_ICONS

  const state = makeState()
  state.screen = options.screen
  state.vitals = { ...state.vitals, healthPoints: options.health, hungerPoints: options.hunger }
  state.colorVision = options.colorVision
  state.simulate = options.simulate
  state.systemPrefersReducedMotion = options.reducedMotion

  for (let index = 0; index < options.captions; index += 1) {
    emitCaption(state)
    // A quarter second between them, so a piped frame shows a spread of
    // freshness values rather than four identical ones.
    advanceClock(state, 0.25)
  }
  if (options.atSecs > 0) {
    advanceClock(state, options.atSecs)
  }

  const style = styleFor(state, options)

  if (options.once || !isInteractive()) {
    if (!options.once) {
      writeLine(
        style.dim('preview-screens: stdin/stdout is not a TTY, drawing a single frame (same as --once)'),
      )
    }
    for (const line of render(state, options, style)) {
      writeLine(line)
    }
    return 0
  }

  runInteractive(state, options)
  return 0
}

const exitCode = main()
if (exitCode !== 0) {
  process.exit(exitCode)
}
