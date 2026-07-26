/**
 * Command-line options for the screen preview.
 *
 * A dev application, not shipped API.
 *
 * Pure: `parseArguments` reads an array and returns a value. It never touches
 * `process`, so the whole option surface is exercisable without launching a
 * terminal UI.
 *
 * `--screen` is the flag that makes this preview what plan.md §3.13 asked for —
 * 「各画面を単体で起動できる」, each screen bootable on its own. `pnpm preview
 * --screen captions --once` boots the caption display and nothing else.
 *
 * Adapted from mc-worldgen's `apps/preview-terrain/options.ts`, including its two
 * hard-won behaviours: a literal `--` is accepted and ignored (pnpm 9 forwards
 * one when somebody writes `pnpm preview -- --stats` out of npm habit), and an
 * unknown flag is an ERROR rather than a silent no-op.
 */
import { COLOR_VISION_MODES, type ColorVisionMode } from '../../domain/accessibility'
import { isScreenName, SCREEN_NAMES, type ScreenName } from './state'

export type PreviewOptions = {
  readonly screen: ScreenName
  /** Health points to boot the HUD with. */
  readonly health: number
  readonly hunger: number
  readonly colorVision: ColorVisionMode
  /** Draw the frame through the deficiency simulation. */
  readonly simulate: boolean
  readonly reducedMotion: boolean
  /** Advance the virtual clock this far before drawing, in seconds. */
  readonly atSecs: number
  /** Emit this many sample captions before drawing. */
  readonly captions: number
  readonly once: boolean
  readonly ascii: boolean
  readonly stats: boolean
  readonly help: boolean
  readonly width: number | undefined
  readonly height: number | undefined
  readonly errors: ReadonlyArray<string>
}

const DEFAULTS = {
  screen: 'hud',
  health: 15,
  hunger: 17,
  colorVision: 'off',
  simulate: false,
  reducedMotion: false,
  atSecs: 0,
  captions: 0,
  once: false,
  ascii: false,
  stats: false,
  help: false,
  width: undefined,
  height: undefined,
  errors: [],
} satisfies PreviewOptions

type Accumulator = {
  -readonly [Key in keyof PreviewOptions]: PreviewOptions[Key]
}

const readNumber = (
  accumulator: Accumulator,
  flag: string,
  raw: string | undefined,
): number | undefined => {
  if (raw === undefined) {
    accumulator.errors = [...accumulator.errors, `${flag} needs a value`]
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    accumulator.errors = [...accumulator.errors, `${flag}: "${raw}" is not a number`]
    return undefined
  }
  return value
}

const isColorVisionMode = (value: string): value is ColorVisionMode =>
  (COLOR_VISION_MODES as ReadonlyArray<string>).includes(value)

export const parseArguments = (argv: ReadonlyArray<string>): PreviewOptions => {
  const accumulator: Accumulator = { ...DEFAULTS }
  const queue = [...argv]

  while (queue.length > 0) {
    const token = queue.shift()
    if (token === undefined) {
      break
    }

    const equalsAt = token.indexOf('=')
    const flag = equalsAt === -1 ? token : token.slice(0, equalsAt)
    const inlineValue = equalsAt === -1 ? undefined : token.slice(equalsAt + 1)
    const takeValue = (): string | undefined => inlineValue ?? queue.shift()

    switch (flag) {
      case '--':
        break
      case '--help':
      case '-h':
        accumulator.help = true
        break
      case '--stats':
        accumulator.stats = true
        break
      case '--once':
        accumulator.once = true
        break
      case '--ascii':
        accumulator.ascii = true
        break
      case '--simulate':
        accumulator.simulate = true
        break
      case '--reduced-motion':
        accumulator.reducedMotion = true
        break
      case '--screen': {
        const value = takeValue()
        if (value !== undefined && isScreenName(value)) {
          accumulator.screen = value
        } else {
          accumulator.errors = [
            ...accumulator.errors,
            `--screen: "${String(value)}" is not one of ${SCREEN_NAMES.join(', ')}`,
          ]
        }
        break
      }
      case '--color-vision': {
        const value = takeValue()
        if (value !== undefined && isColorVisionMode(value)) {
          accumulator.colorVision = value
        } else {
          accumulator.errors = [
            ...accumulator.errors,
            `--color-vision: "${String(value)}" is not one of ${COLOR_VISION_MODES.join(', ')}`,
          ]
        }
        break
      }
      case '--health':
        accumulator.health = readNumber(accumulator, flag, takeValue()) ?? accumulator.health
        break
      case '--hunger':
        accumulator.hunger = readNumber(accumulator, flag, takeValue()) ?? accumulator.hunger
        break
      case '--at':
        accumulator.atSecs = Math.max(0, readNumber(accumulator, flag, takeValue()) ?? accumulator.atSecs)
        break
      case '--captions':
        accumulator.captions = Math.max(0, readNumber(accumulator, flag, takeValue()) ?? accumulator.captions)
        break
      case '--width':
        accumulator.width = readNumber(accumulator, flag, takeValue()) ?? accumulator.width
        break
      case '--height':
        accumulator.height = readNumber(accumulator, flag, takeValue()) ?? accumulator.height
        break
      default:
        accumulator.errors = [...accumulator.errors, `unknown option: ${flag}`]
        break
    }
  }

  return accumulator
}

export const USAGE: ReadonlyArray<string> = [
  'pnpm preview [options]        per-screen preview for @nerima-games/mx-ui',
  '',
  'options',
  `  --screen <name>       ${SCREEN_NAMES.join(' | ')}   (default hud)`,
  '  --health <n>          health points to boot the HUD with (default 15)',
  '  --hunger <n>          hunger points (default 17)',
  `  --color-vision <mode> ${COLOR_VISION_MODES.join(' | ')}   (default off)`,
  '  --simulate            draw the frame as that colour vision deficiency SEES it',
  '                        (a preview tool — NOT the daltonisation correction)',
  '  --reduced-motion      boot with the OS preference set',
  '  --captions <n>        emit n sample captions before drawing',
  '  --at <secs>           advance the virtual clock this far before drawing',
  '  --once                render one frame to stdout and exit (no raw mode, pipe-safe)',
  '  --ascii               plain characters, no colour — pasteable into an issue or a diff',
  '  --stats               print the numeric report instead of a picture',
  '  --width <n> --height <n>   force the frame size in terminal cells',
  '  --help                this text',
  '',
  'keys (interactive)',
  '  tab / 1-4       switch screen: hud, inventory, settings, captions',
  '  HUD',
  '    - =           health -1 / +1        [ ]   hunger -1 / +1',
  '    , .           xp -10% / +10%        < >   previous / next hotbar slot',
  '    d             wear the held item    E     empty the held slot',
  '    N             set health to NaN (a value from across a version boundary)',
  '    r             reset the mocked vitals',
  '  captions',
  '    e             emit the next sample caption      a  emit the SAME cue again',
  '    t / T         advance the clock 1s / 0.25s',
  '    c             toggle captionsEnabled            u  toggle audioUnlocked',
  '  settings',
  '    v / V         cycle colour vision mode / toggle the simulation',
  '    m / M         cycle motion setting / toggle the OS preference',
  '    j k           choose an action                  b  rebind it',
  '  inventory',
  '    o             open the next screen on the modal stack',
  '    Escape        the modal-stack Escape handler — NOT quit',
  '',
  '  ?               help              x  Ctrl-C   quit  (Escape is under test, so it does not quit)',
]
