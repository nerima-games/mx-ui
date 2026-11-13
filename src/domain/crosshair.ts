/**
 * The crosshair's state — and the one mark in this repository that is drawn over
 * the world rather than over a panel.
 *
 * ---------------------------------------------------------------------------
 * Why it is mx-ui's, which was doubted twice
 * ---------------------------------------------------------------------------
 *
 * `docs/e2e-triage.md` #15 carried a plausible guess for a while: a centre-screen
 * reticle is the camera's centre, so it belongs to whoever owns the camera. The
 * reference contradicts it twice. The file is
 * `<reference-impl>/packages/presentation/hud/crosshair.ts` — under `hud/`, not
 * under rendering, and not in the scene graph. And
 * `<reference-impl>/index.html:124` lists `body.hud-hidden #crosshair` in the
 * same `display: none` rule as `#survival-hud`, `#xp-display`,
 * `#autosave-status` and `#sound-captions`. Whoever wrote that rule treated
 * hiding the HUD as hiding the crosshair — and mx-ui demonstrably owns the last
 * two of those.
 *
 * ---------------------------------------------------------------------------
 * VISIBILITY IS NOT A NEW FLAG
 * ---------------------------------------------------------------------------
 *
 * The reference has `show()` / `hide()` / `toggle()` and a `visibleRef`, which is
 * a second copy of "is the player in the world" living inside a renderer. It is
 * already derivable: a crosshair is an aiming mark, aiming needs pointer lock,
 * and `pointerLockReleased` in `domain/modal-stack.ts` already answers when the
 * pointer is gone. So this module asks that function rather than keeping a flag
 * beside it — DN-UI-7c is the record of what a second copy of one answer costs.
 *
 * The consequence is a property the reference could not state: opening ANY screen
 * takes the crosshair down, including a screen nobody has written yet, because
 * the stack is what is consulted rather than a list of cases.
 *
 * ---------------------------------------------------------------------------
 * The hit marker, without a timer (DN-UI-10)
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/packages/presentation/hud/crosshair.ts:141` implements the
 * hit marker as `setTimeout(resetPulse, CROSSHAIR_PULSE_MS)` — a wall-clock timer
 * owned by a renderer, which plan.md §4.3 bans repository-wide and
 * `pnpm check:deps` enforces.
 *
 * It does not need one. The pulse is a duration measured from a moment, which is
 * the shape `domain/save-status.ts` and `domain/loading-screen.ts` already use:
 * the caller supplies the monotonic timestamp it already has, `lastHitAtSecs` is
 * when the hit LANDED, and `crosshairViewModel` takes `nowSecs` as a parameter. The
 * frame sets a field; nothing here schedules anything.
 *
 * That also removes a bug class the reference has to manage by hand: it keeps a
 * `pulseTimeoutRef` and clears it on `hide`, on `toggle` and on every re-pulse,
 * because a timer that outlives the thing it was about will fire into a
 * crosshair that has since been taken down.
 */
import { type ModalStack, type ScreenId, pointerLockReleased } from './modal-stack.js'
import { Result } from 'effect'

/**
 * How long a landed hit is marked.
 *
 * 0.12 s, which is the reference's `CROSSHAIR_PULSE_MS = 120`
 * (`crosshair.ts:5`). Carried over rather than re-chosen: hit feedback that
 * outlasts the swing reads as a second hit, and the number is not derivable from
 * anything this repository knows.
 */
export const CROSSHAIR_PULSE_SECS = 0.12

export type CrosshairStatus = {
  /**
   * The modal stack. The crosshair is not drawn while a screen is up — see the
   * header on why this is asked rather than mirrored.
   */
  readonly modals: ModalStack
  /**
   * Monotonic seconds at which the last hit LANDED, or absent for none —
   * supplied by the caller, never read from a global (DN-UI-10).
   */
  readonly lastHitAtSecs?: number | undefined
  /**
   * Active block-breaking progress, where zero is a started but empty bar.
   * `undefined` means no block is currently being broken.
   */
  readonly breakProgress?: number | undefined
}

export const IDLE_CROSSHAIR_STATUS: CrosshairStatus = {
  modals: [],
}

/**
 * What the crosshair shows right now, or `undefined` for nothing at all.
 * Invalid input returns a typed failure.
 *
 * Named `CrosshairViewModel` rather than `CrosshairView` to leave the second name
 * to `application/crosshair-view.ts`, exactly as `HudViewModel` and
 * `InventoryViewModel` do. The two used to collide, and the barrel said so.
 *
 * `hit` is a BOOLEAN rather than a remaining duration on purpose. A renderer
 * handed 「43 ms left」 would have to
 * decide what that looks like, which is the arithmetic this module exists to keep
 * out of `application/` (`domain/hud-view-model.ts`: 「a rendering bug and a
 * derivation bug are never the same bug」).
 */
export type CrosshairViewModel = {
  readonly hit: boolean
  /** Normalised block-breaking progress, or `undefined` when no bar is drawn. */
  readonly breakProgress?: number | undefined
}

const ZERO = 0
const PROGRESS_UPPER_BOUND = 1

type InvalidCrosshairViewModelInput = Readonly<{
  readonly _tag: 'InvalidCrosshairViewModelInput'
  readonly field: 'breakProgress' | 'lastHitAtSecs' | 'modals' | 'nowSecs' | 'pulseSecs' | 'status'
}>

const SCREEN_IDS: ReadonlyArray<ScreenId> = [
  'pause',
  'settings',
  'inventory',
  'crafting',
  'chat',
  'achievements',
  'statistics',
]

const isScreenId = (input: unknown): input is ScreenId =>
  typeof input === 'string' && SCREEN_IDS.some((screen) => screen === input)

const isFiniteSeconds = (input: unknown): input is number =>
  typeof input === 'number' && Number.isFinite(input)

const isModalStack = (input: unknown): input is ModalStack => {
  if (!Array.isArray(input)) {
    return false
  }
  for (const screen of input) {
    if (!isScreenId(screen)) {
      return false
    }
  }
  return true
}

const invalidCrosshairViewModelInput = (
  field: InvalidCrosshairViewModelInput['field'],
): Result.Result<never, InvalidCrosshairViewModelInput> => Result.fail({
  _tag: 'InvalidCrosshairViewModelInput',
  field,
})

/** Clamp finite progress to 0-1 and preserve undefined as the no-progress state. */
const clampBreakProgress = (
  supplied: unknown,
): Result.Result<number | undefined, InvalidCrosshairViewModelInput> => {
  if (typeof supplied === 'undefined') {
    // eslint-disable-next-line no-undefined -- Undefined represents the no-progress state.
    return Result.succeed(undefined)
  }
  if (typeof supplied !== 'number' || !Number.isFinite(supplied)) {
    return invalidCrosshairViewModelInput('breakProgress')
  }
  return Result.succeed(Math.min(PROGRESS_UPPER_BOUND, Math.max(ZERO, supplied)))
}

// eslint-disable-next-line no-undefined -- Undefined is the public no-view state.
const noCrosshairView = (): Result.Result<undefined, never> => Result.succeed(undefined)

const isRecentHit = (
  lastHitAtSecs: number | undefined,
  nowSecs: number,
  pulseSecs: number,
): boolean => {
  if (typeof lastHitAtSecs === 'undefined') {
    return false
  }
  const since = nowSecs - lastHitAtSecs
  // A NaN or a backwards clock shows NO hit, which is the opposite call from
  // `saveStatusMessage` and `loadingScreenView` and for the same underlying
  // Rule: choose the outcome that does not invent a claim. There, keeping a
  // Message up claims nothing new. Here, a hit marker IS the claim: a hit that
  // Stuck because of a bad subtraction would tell the player they connected
  // When they missed.
  return Number.isFinite(since) && since >= ZERO && since < pulseSecs
}

export const crosshairViewModel = (
  status: CrosshairStatus,
  nowSecs: number,
  pulseSecs: number = CROSSHAIR_PULSE_SECS,
): Result.Result<CrosshairViewModel | undefined, InvalidCrosshairViewModelInput> => {
  if (status === null || typeof status !== 'object' || Array.isArray(status)) {
    return invalidCrosshairViewModelInput('status')
  }
  const modals = Reflect.get(status, 'modals')
  if (!isModalStack(modals)) {
    return invalidCrosshairViewModelInput('modals')
  }
  const breakProgress = clampBreakProgress(Reflect.get(status, 'breakProgress'))
  if (Result.isFailure(breakProgress)) {
    return Result.fail(breakProgress.failure)
  }
  const lastHitAtSecs = Reflect.get(status, 'lastHitAtSecs') as unknown
  if (typeof lastHitAtSecs !== 'undefined' && !isFiniteSeconds(lastHitAtSecs)) {
    return invalidCrosshairViewModelInput('lastHitAtSecs')
  }
  if (!isFiniteSeconds(nowSecs)) {
    return invalidCrosshairViewModelInput('nowSecs')
  }
  if (!isFiniteSeconds(pulseSecs) || pulseSecs < ZERO) {
    return invalidCrosshairViewModelInput('pulseSecs')
  }
  if (pointerLockReleased(modals)) {
    return noCrosshairView()
  }
  return Result.succeed({
    breakProgress: breakProgress.success,
    hit: isRecentHit(lastHitAtSecs, nowSecs, pulseSecs),
  })
}
