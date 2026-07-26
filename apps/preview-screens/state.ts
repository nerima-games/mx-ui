/**
 * The mocked state every screen is booted with.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * This is exactly what plan.md §3.13 asks for
 * ---------------------------------------------------------------------------
 *
 * 「各画面を単体で起動できる状態モック付きプレビュー」— each screen bootable on its
 * own with mocked state. The mock is this file: a plain record of the values
 * mc-sim and mc-audio will eventually supply, mutated by keystrokes.
 *
 * It is possible to write it this way because `domain/` is pure. `hudViewModel`
 * is a function from a snapshot to what the screen shows
 * (`domain/hud-view-model.ts:1-26`), so "boot the HUD with 3 hearts and a
 * nearly-broken pickaxe" is a literal, not a running game. That property is the
 * reason this preview exists at all and the reason it is honest: the preview
 * feeds the SAME function the game will.
 *
 * ---------------------------------------------------------------------------
 * The clock is a number in this record
 * ---------------------------------------------------------------------------
 *
 * `nowSecs` is advanced by a keystroke. `domain/caption.ts` never asks what time
 * it is — a caption's age is a subtraction against a caller-supplied value — and
 * `stages/registration.ts` accumulates that value from `dt`. Reading a wall
 * clock here would mean previewing a different module than the one that ships,
 * and `pnpm check:deps` bans it besides.
 */
import type { ColorVisionMode, InputAction, KeyBindings, MotionSetting } from '../../domain/accessibility'
import { COLOR_VISION_MODES, rebind } from '../../domain/accessibility'
import type { CaptionEvent, CaptionQueue, CaptionSettings } from '../../domain/caption'
import { emptyCaptionQueue, expireCaptions, receiveCaption } from '../../domain/caption'
import type { HotbarSlotSnapshot, VitalsSnapshot } from '../../domain/hud-view-model'
import {
  DEFAULT_MAX_HEALTH_POINTS,
  DEFAULT_MAX_HUNGER_POINTS,
  HOTBAR_SLOT_COUNT,
  spawnSnapshot,
} from '../../domain/hud-view-model'
import type { ModalStack, ScreenId } from '../../domain/modal-stack'
import { closeScreen, emptyModalStack, escapePressed, openScreen } from '../../domain/modal-stack'
import { DEFAULT_CAPTION_SETTINGS } from '../../stages/registration'

export type ScreenName = 'hud' | 'inventory' | 'settings' | 'captions'

export const SCREEN_NAMES: ReadonlyArray<ScreenName> = ['hud', 'inventory', 'settings', 'captions']

export const isScreenName = (value: string): value is ScreenName =>
  (SCREEN_NAMES as ReadonlyArray<string>).includes(value)

/** The actions the rebinding screen lists. */
export const PREVIEW_ACTIONS: ReadonlyArray<InputAction> = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'sneak',
  'sprint',
  'inventory',
  'drop',
  'chat',
]

/**
 * The vanilla defaults, minus two.
 *
 * `drop` and `chat` are deliberately left UNBOUND so the screen has something to
 * report: `unboundActions` exists because 「The screen must make these visible,
 * not hide them」(`domain/accessibility.ts:181-185`), and a preview where every
 * action is bound never exercises it.
 */
export const DEFAULT_BINDINGS: KeyBindings = new Map<InputAction, string>([
  ['moveForward', 'KeyW'],
  ['moveBack', 'KeyS'],
  ['moveLeft', 'KeyA'],
  ['moveRight', 'KeyD'],
  ['jump', 'Space'],
  ['sneak', 'ShiftLeft'],
  ['sprint', 'ControlLeft'],
  ['inventory', 'KeyE'],
])

/** A hotbar with something in it, because an empty one shows nothing. */
export const SAMPLE_HOTBAR: ReadonlyArray<HotbarSlotSnapshot> = [
  { itemId: 'diamond_pickaxe', count: 1, durability: 0.82 },
  { itemId: 'iron_sword', count: 1, durability: 0.12 },
  { itemId: 'torch', count: 64, durability: undefined },
  { itemId: 'cobblestone', count: 12, durability: undefined },
  { itemId: 'bread', count: 3, durability: undefined },
  { itemId: undefined, count: 0, durability: undefined },
  { itemId: 'oak_planks', count: 1, durability: undefined },
  { itemId: undefined, count: 0, durability: undefined },
  { itemId: 'water_bucket', count: 1, durability: undefined },
]

export const SAMPLE_CAPTIONS: ReadonlyArray<{
  readonly cueId: string
  readonly text: string
  readonly direction: CaptionEvent['direction']
}> = [
  { cueId: 'entity.creeper.primed', text: 'Creeper hisses', direction: 'behind' },
  { cueId: 'entity.skeleton.shoot', text: 'Arrow fires', direction: 'left' },
  { cueId: 'block.water.ambient', text: 'Water flows', direction: 'right' },
  { cueId: 'entity.zombie.ambient', text: 'Zombie groans', direction: 'ahead' },
  { cueId: 'block.stone.break', text: 'Block breaks', direction: undefined },
  { cueId: 'entity.player.hurt', text: 'You are hurt', direction: undefined },
]

export type PreviewState = {
  screen: ScreenName
  vitals: VitalsSnapshot
  captions: CaptionQueue
  captionSettings: CaptionSettings
  /** Monotonic seconds. A keystroke moves it; nothing else may. */
  nowSecs: number
  nextCaption: number

  colorVision: ColorVisionMode
  /** Whether the frame is drawn through a deficiency SIMULATION. Preview-local. */
  simulate: boolean
  motion: MotionSetting
  systemPrefersReducedMotion: boolean

  bindings: KeyBindings
  actionIndex: number
  rebinding: boolean
  rebindNote: string

  modals: ModalStack
  escapeLog: Array<string>

  showHelp: boolean
  note: string
}

export const makeState = (): PreviewState => ({
  screen: 'hud',
  vitals: {
    ...spawnSnapshot,
    healthPoints: 15,
    hungerPoints: 17,
    experienceLevel: 12,
    experienceProgress: 0.4,
    hotbar: SAMPLE_HOTBAR,
    selectedHotbarIndex: 0,
  },
  captions: emptyCaptionQueue,
  captionSettings: DEFAULT_CAPTION_SETTINGS,
  nowSecs: 0,
  nextCaption: 0,

  colorVision: 'off',
  simulate: false,
  motion: 'system',
  systemPrefersReducedMotion: false,

  bindings: DEFAULT_BINDINGS,
  actionIndex: 0,
  rebinding: false,
  rebindNote: '',

  modals: emptyModalStack,
  escapeLog: [],

  showHelp: false,
  note: '',
})

// ---------------------------------------------------------------------------
// Mutations. Each one is a keystroke.
// ---------------------------------------------------------------------------

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

export const adjustHealth = (state: PreviewState, delta: number): string => {
  const healthPoints = clamp(state.vitals.healthPoints + delta, 0, state.vitals.maxHealthPoints)
  state.vitals = { ...state.vitals, healthPoints }
  return `health ${String(healthPoints)}/${String(state.vitals.maxHealthPoints)}`
}

export const adjustHunger = (state: PreviewState, delta: number): string => {
  const hungerPoints = clamp(state.vitals.hungerPoints + delta, 0, state.vitals.maxHungerPoints)
  state.vitals = { ...state.vitals, hungerPoints }
  return `hunger ${String(hungerPoints)}/${String(state.vitals.maxHungerPoints)}`
}

export const adjustExperience = (state: PreviewState, delta: number): string => {
  const raw = state.vitals.experienceProgress + delta
  const levelUp = raw >= 1 ? 1 : raw < 0 ? -1 : 0
  const experienceProgress = raw >= 1 ? raw - 1 : raw < 0 ? raw + 1 : raw
  const experienceLevel = Math.max(0, state.vitals.experienceLevel + levelUp)
  state.vitals = { ...state.vitals, experienceProgress, experienceLevel }
  return `xp ${String(experienceLevel)} + ${(experienceProgress * 100).toFixed(0)}%`
}

export const selectSlot = (state: PreviewState, delta: number): string => {
  const selectedHotbarIndex =
    (((state.vitals.selectedHotbarIndex + delta) % HOTBAR_SLOT_COUNT) + HOTBAR_SLOT_COUNT) %
    HOTBAR_SLOT_COUNT
  state.vitals = { ...state.vitals, selectedHotbarIndex }
  return `slot ${String(selectedHotbarIndex + 1)}`
}

/**
 * Wear down the held item.
 *
 * Also the way to reproduce the empty-slot durability bug by hand: damage a
 * slot to nothing with `d`, empty it with `E`, and watch the durability bar stay.
 */
export const damageHeld = (state: PreviewState, delta: number): string => {
  const index = state.vitals.selectedHotbarIndex
  const slot = state.vitals.hotbar[index]
  if (slot?.durability === undefined) {
    return 'nothing in hand that can wear out'
  }
  const durability = clamp(slot.durability + delta, 0, 1)
  const hotbar = state.vitals.hotbar.map((existing, position) =>
    position === index ? { ...existing, durability } : existing,
  )
  state.vitals = { ...state.vitals, hotbar }
  return `durability ${(durability * 100).toFixed(0)}%`
}

export const emptyHeldSlot = (state: PreviewState): string => {
  const index = state.vitals.selectedHotbarIndex
  const hotbar = state.vitals.hotbar.map((existing, position) =>
    position === index ? { ...existing, itemId: undefined, count: 0 } : existing,
  )
  state.vitals = { ...state.vitals, hotbar }
  return `slot ${String(index + 1)} emptied — look at what the view model still reports for it`
}

export const resetVitals = (state: PreviewState): string => {
  state.vitals = {
    ...spawnSnapshot,
    maxHealthPoints: DEFAULT_MAX_HEALTH_POINTS,
    maxHungerPoints: DEFAULT_MAX_HUNGER_POINTS,
    hotbar: SAMPLE_HOTBAR,
  }
  return 'vitals reset to a fresh spawn'
}

/**
 * Feed the view model a value that came across a version boundary and is not a
 * number.
 *
 * `domain/hud-view-model.ts:78-90` says out-of-range input is clamped rather
 * than rejected because 「the snapshot comes from another repository across a
 * version boundary」. NaN is the same class of input, so the preview has a key
 * for it.
 */
export const injectNaNHealth = (state: PreviewState): string => {
  state.vitals = { ...state.vitals, healthPoints: Number.NaN }
  return 'healthPoints = NaN — compare the heart row against the death flag'
}

// ---------------------------------------------------------------------------
// Captions and the virtual clock
// ---------------------------------------------------------------------------

/**
 * Advance time.
 *
 * Expiry runs here rather than in the renderer, mirroring `ui:overlay-sync`
 * (`stages/registration.ts:104-114`), which accumulates `dt` and calls
 * `expireCaptions`. The preview's "frame" is a keystroke, and `dt` is whatever
 * the key says — which is what lets a three-second lifetime be stepped through
 * in quarter seconds without waiting three seconds.
 */
export const advanceClock = (state: PreviewState, dtSecs: number): string => {
  state.nowSecs += dtSecs
  const before = state.captions.visible.length
  state.captions = expireCaptions(state.captions, state.nowSecs)
  const dropped = before - state.captions.visible.length
  return `t = ${state.nowSecs.toFixed(2)}s${dropped > 0 ? `, ${String(dropped)} caption(s) expired` : ''}`
}

export const emitCaption = (state: PreviewState): string => {
  const sample = SAMPLE_CAPTIONS[state.nextCaption % SAMPLE_CAPTIONS.length]
  if (sample === undefined) {
    return 'no sample captions'
  }
  state.nextCaption += 1
  const before = state.captions
  state.captions = receiveCaption(
    state.captions,
    { cueId: sample.cueId, text: sample.text, direction: sample.direction, atSecs: state.nowSecs },
    state.captionSettings,
  )
  return state.captions === before
    ? `${sample.cueId} was dropped — captions are switched off`
    : `${sample.cueId} at t = ${state.nowSecs.toFixed(2)}s`
}

/** Emit the SAME cue again, which is how the de-duplication rule is checked. */
export const repeatCaption = (state: PreviewState): string => {
  const sample = SAMPLE_CAPTIONS[(state.nextCaption - 1 + SAMPLE_CAPTIONS.length) % SAMPLE_CAPTIONS.length]
  if (sample === undefined) {
    return 'nothing emitted yet'
  }
  state.captions = receiveCaption(
    state.captions,
    { cueId: sample.cueId, text: sample.text, direction: sample.direction, atSecs: state.nowSecs },
    state.captionSettings,
  )
  return `${sample.cueId} again — one entry refreshed, not two entries stacked`
}

export const toggleCaptions = (state: PreviewState): string => {
  state.captionSettings = {
    ...state.captionSettings,
    captionsEnabled: !state.captionSettings.captionsEnabled,
  }
  return `captions ${state.captionSettings.captionsEnabled ? 'on' : 'off'}`
}

/**
 * Flip the browser's autoplay gate.
 *
 * The interesting thing about this key is that NOTHING HAPPENS. plan.md §3.6
 * fixes captions as firing BEFORE the audio gate, so `receiveCaption` does not
 * read `audioUnlocked` at all (`domain/caption.ts:1-23`). A deaf player must see
 * captions before they have clicked anything, and the preview shows that the
 * omission is deliberate by giving it a key that visibly does nothing.
 */
export const toggleAudioUnlocked = (state: PreviewState): string => {
  state.captionSettings = {
    ...state.captionSettings,
    audioUnlocked: !state.captionSettings.audioUnlocked,
  }
  return `audioUnlocked = ${String(state.captionSettings.audioUnlocked)} — captions are unaffected, on purpose`
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

export const cycleColorVision = (state: PreviewState): string => {
  const index = COLOR_VISION_MODES.indexOf(state.colorVision)
  state.colorVision = COLOR_VISION_MODES[(index + 1) % COLOR_VISION_MODES.length] ?? 'off'
  return `colour vision mode: ${state.colorVision}`
}

export const toggleSimulation = (state: PreviewState): string => {
  state.simulate = !state.simulate
  return state.simulate
    ? 'simulating the deficiency — this is what a player SEES, not what daltonisation does'
    : 'simulation off'
}

const MOTION_SETTINGS: ReadonlyArray<MotionSetting> = ['system', 'full', 'reduced']

export const cycleMotion = (state: PreviewState): string => {
  const index = MOTION_SETTINGS.indexOf(state.motion)
  state.motion = MOTION_SETTINGS[(index + 1) % MOTION_SETTINGS.length] ?? 'system'
  return `motion setting: ${state.motion}`
}

export const toggleSystemMotion = (state: PreviewState): string => {
  state.systemPrefersReducedMotion = !state.systemPrefersReducedMotion
  return `OS prefers-reduced-motion: ${String(state.systemPrefersReducedMotion)}`
}

export const moveActionCursor = (state: PreviewState, delta: number): string => {
  const count = PREVIEW_ACTIONS.length
  state.actionIndex = ((state.actionIndex + delta) % count + count) % count
  return `action: ${String(PREVIEW_ACTIONS[state.actionIndex])}`
}

export const beginRebind = (state: PreviewState): string => {
  state.rebinding = true
  return `press a key to bind to ${String(PREVIEW_ACTIONS[state.actionIndex])} — Escape or Backspace clears it`
}

/**
 * Apply the captured key.
 *
 * Every branch of `RebindResult` is surfaced, and the conflict branch is the one
 * that matters: `domain/accessibility.ts:151-179` reports conflicts rather than
 * resolving them, 「Automatically unbinding the other action is how a player ends
 * up unable to jump and with no idea why」. A preview that swallowed the conflict
 * would be reproducing that bug in the tool built to find it.
 */
export const applyRebind = (state: PreviewState, code: string): string => {
  const action = PREVIEW_ACTIONS[state.actionIndex]
  state.rebinding = false
  if (action === undefined) {
    return 'no action selected'
  }

  const result = rebind(state.bindings, action, code)
  if (result.kind === 'conflict') {
    state.rebindNote = `${code} is already held by ${result.heldBy} — nothing was changed`
    return state.rebindNote
  }

  state.bindings = result.bindings
  state.rebindNote =
    result.kind === 'cleared'
      ? `${action} unbound (${code} is a clear key, so it can never be bound to anything)`
      : `${action} -> ${code}`
  return state.rebindNote
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

export const MODAL_SCREENS: ReadonlyArray<ScreenId> = [
  'inventory',
  'crafting',
  'chat',
  'settings',
  'achievements',
  'statistics',
  'pause',
]

export const openModal = (state: PreviewState, screen: ScreenId): string => {
  const before = state.modals.length
  state.modals = openScreen(state.modals, screen)
  return before === state.modals.length
    ? `${screen} was already open — raised to the top rather than pushed twice`
    : `opened ${screen}`
}

export const closeModal = (state: PreviewState, screen: ScreenId): string => {
  state.modals = closeScreen(state.modals, screen)
  return `closed ${screen}`
}

/**
 * THE single Escape decision.
 *
 * `escapePressed` returns an action as well as a stack, because 「the caller
 * cannot infer "open pause" from an unchanged stack without re-deriving the
 * decision」 (`domain/modal-stack.ts:87-101`). This is the one place in the app
 * that acts on it, which is the shape the doc asks for: one handler, at frame
 * level, deciding what Escape means.
 */
export const pressEscape = (state: PreviewState): string => {
  const outcome = escapePressed(state.modals)
  state.modals = outcome.stack

  if (outcome.action === 'open-pause') {
    state.modals = openScreen(state.modals, 'pause')
    state.escapeLog = [...state.escapeLog, 'nothing was open -> open-pause'].slice(-6)
    return 'nothing open, so Escape means pause — the handler opened it, the outcome only said to'
  }

  state.escapeLog = [...state.escapeLog, `closed ${String(outcome.closed)}`].slice(-6)
  return `closed ${String(outcome.closed)} — one modal per press, top down`
}
