/**
 * The only impure module in the preview.
 *
 * A dev application, not shipped API.
 *
 * Everything else here — the mock state, every screen renderer, the option
 * parser, the stats report — is a pure function of its arguments. Node's stdio
 * lives behind this file so the boundary is visible rather than sprinkled, which
 * is the same reason `domain/` keeps `document` out and takes `nowSecs` as a
 * parameter.
 *
 * ---------------------------------------------------------------------------
 * No clock, and this repository has the strongest reason of the sixteen
 * ---------------------------------------------------------------------------
 *
 * `domain/caption.ts` is built around never asking what time it is: a caption's
 * age is `nowSecs - event.atSecs` where `nowSecs` is supplied by the caller
 * (`domain/caption.ts:25-35`), and `stages/registration.ts` accumulates it from
 * `dt`. A preview that expired captions on a wall clock would be testing a
 * different module than the one that ships.
 *
 * So the preview owns a VIRTUAL clock: a number in `state.ts` that a keystroke
 * advances. `Date.now()` / `new Date()` / `performance.now()` appear nowhere in
 * this app and the `mc-kernel-allow-time-source` escape hatch is not taken. The
 * side effect is that a caption's three-second lifetime can be stepped through
 * in quarter-second increments without waiting three seconds — which is exactly
 * the property plan.md §5.1-3 asks of the simulation.
 *
 * Adapted from mc-worldgen's `apps/preview-terrain/terminal.ts`. The two are
 * deliberately separate copies: these are independent repositories, and a shared
 * preview harness would be a cross-repository dependency created for the
 * convenience of dev tooling — exactly the edge `pnpm check:deps` refuses.
 */
import { ESC } from './ansi'

export type Screen = {
  readonly columns: number
  readonly rows: number
}

const FALLBACK_SCREEN: Screen = { columns: 120, rows: 40 }

export const screenSize = (): Screen => ({
  columns: process.stdout.columns ?? FALLBACK_SCREEN.columns,
  rows: process.stdout.rows ?? FALLBACK_SCREEN.rows,
})

export const write = (text: string): void => {
  process.stdout.write(text)
}

export const NEWLINE: string = String.fromCharCode(10)

export const writeLine = (text = ''): void => {
  process.stdout.write(`${text}${NEWLINE}`)
}

export const isInteractive = (): boolean =>
  process.stdin.isTTY === true && process.stdout.isTTY === true

const ENTER_ALT_SCREEN = `${ESC}[?1049h`
const LEAVE_ALT_SCREEN = `${ESC}[?1049l`
const HIDE_CURSOR = `${ESC}[?25l`
const SHOW_CURSOR = `${ESC}[?25h`
const HOME = `${ESC}[H`
const CLEAR_TO_END = `${ESC}[J`
const CLEAR_TO_LINE_END = `${ESC}[K`

export const enterFullScreen = (): void => {
  write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}${HOME}${CLEAR_TO_END}`)
  if (typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
}

export const leaveFullScreen = (): void => {
  if (typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false)
  }
  process.stdin.pause()
  write(`${SHOW_CURSOR}${LEAVE_ALT_SCREEN}`)
}

/**
 * Redraw in place rather than clearing first, so the frame does not flash.
 * Each line is cleared to its own end, which is what stops a short line from
 * leaving the tail of the previous, longer one behind it.
 */
export const paintFrame = (lines: ReadonlyArray<string>): void => {
  write(HOME + lines.map((line) => line + CLEAR_TO_LINE_END).join(NEWLINE) + CLEAR_TO_END)
}

const ETX = String.fromCharCode(3)
const CARRIAGE_RETURN = String.fromCharCode(13)
const BACKSPACE = String.fromCharCode(127)
const CTRL_H = String.fromCharCode(8)

/**
 * Normalised key names.
 *
 * `escape` and `backspace` matter more here than in any sibling preview: they
 * are the two keys `REBIND_CLEAR_KEYS` names (`domain/accessibility.ts:139-149`),
 * and Escape is also the key the whole modal stack is built around
 * (`domain/modal-stack.ts`). A terminal that reported Escape and an arrow key as
 * the same byte would make both untestable here.
 */
const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  [`${ESC}[A`, 'up'],
  [`${ESC}[B`, 'down'],
  [`${ESC}[C`, 'right'],
  [`${ESC}[D`, 'left'],
  [ESC, 'escape'],
  [ETX, 'ctrl-c'],
  [CARRIAGE_RETURN, 'enter'],
  [NEWLINE, 'enter'],
  [BACKSPACE, 'backspace'],
  [CTRL_H, 'backspace'],
  ['\t', 'tab'],
])

export const decodeKey = (chunk: string): string => KEY_NAMES.get(chunk) ?? chunk

const ARROWS: ReadonlyMap<string, string> = new Map([
  ['A', 'up'],
  ['B', 'down'],
  ['C', 'right'],
  ['D', 'left'],
])

/**
 * Split one stdin chunk into individual keys.
 *
 * A `data` event is a chunk of BYTES, not a keystroke. Typing quickly, holding a
 * key and pasting all deliver several at once, and an arrow key is three bytes
 * that must stay together.
 */
export const decodeKeys = (chunk: string): ReadonlyArray<string> => {
  const keys: Array<string> = []
  let index = 0

  while (index < chunk.length) {
    const character = chunk.charAt(index)
    const arrow =
      character === ESC && chunk.charAt(index + 1) === '[' ? ARROWS.get(chunk.charAt(index + 2)) : undefined

    if (arrow !== undefined) {
      keys.push(arrow)
      index += 3
    } else {
      keys.push(decodeKey(character))
      index += 1
    }
  }

  return keys
}

export const onKey = (handler: (key: string) => void): void => {
  process.stdin.on('data', (chunk: string | Buffer) => {
    for (const key of decodeKeys(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))) {
      handler(key)
    }
  })
}

/** End of input. Without this the app waits forever on a closed stdin. */
export const onInputEnd = (handler: () => void): void => {
  process.stdin.on('end', handler)
}

export const onResize = (handler: () => void): void => {
  process.stdout.on('resize', handler)
}

export const onExit = (handler: () => void): void => {
  process.on('exit', handler)
  process.on('SIGINT', () => {
    handler()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    handler()
    process.exit(0)
  })
}

/**
 * `KeyboardEvent.code` for a terminal keystroke, as far as one exists.
 *
 * The rebinding screen drives `rebind`, which takes a `code` — a browser
 * concept. A terminal delivers characters, not physical keys, so this mapping is
 * approximate BY NATURE: a terminal cannot tell `KeyA` from `a`, cannot see
 * modifier keys pressed alone, and cannot distinguish the two Shift keys.
 *
 * Being approximate is fine for what the preview is checking — that a conflict
 * is reported rather than silently resolved, that Escape and Backspace clear
 * rather than bind — and it is stated here rather than hidden, because a preview
 * whose input model differs from the real one has to say where.
 */
export const codeForKey = (key: string): string => {
  if (key === 'escape') {
    return 'Escape'
  }
  if (key === 'backspace') {
    return 'Backspace'
  }
  if (key === ' ') {
    return 'Space'
  }
  if (key === 'enter') {
    return 'Enter'
  }
  if (key === 'tab') {
    return 'Tab'
  }
  if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
    return `Arrow${key.charAt(0).toUpperCase()}${key.slice(1)}`
  }
  if (key.length === 1 && /[a-z]/iu.test(key)) {
    return `Key${key.toUpperCase()}`
  }
  if (key.length === 1 && /[0-9]/u.test(key)) {
    return `Digit${key}`
  }
  return key
}
