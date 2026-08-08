/**
 * The loading screen's state, and the floor under how long it stays up.
 *
 * ---------------------------------------------------------------------------
 * Why a minimum duration is a decision and not a delay
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/packages/app/application/main/session-loading-gates-state.ts:1`
 * holds `MIN_LOADING_SCREEN_DURATION_MS = 2500` and
 * `<reference-impl>/e2e/ui/loading-screen.e2e.ts` is one Playwright test whose
 * entire job is to prove the screen was not dismissed early. It could only ask
 * that with a stopwatch — start a session, watch for the overlay, sleep, check it
 * is still there — and it had to hedge the number to 1,800 ms for CI jitter.
 *
 * The floor exists because a loading screen that appears and disappears inside
 * two frames is not a fast load, it is a FLASH: the player clicks Confirm, the
 * screen jump-cuts to a world, and nothing ever acknowledged the click. Worse,
 * the flash is machine-dependent, so the one player who sees it is the one whose
 * hardware made everything else feel fine.
 *
 * What that means for this module: **`ready` is not the same question as
 * `visible`.** The host says the world is ready; this decides whether the screen
 * comes down. Keeping those two apart is the whole content of the reference's
 * test, and here it is arithmetic rather than a stopwatch.
 *
 * ---------------------------------------------------------------------------
 * No clock (DN-UI-10)
 * ---------------------------------------------------------------------------
 *
 * plan.md §4.3 bans `Date.now()`, `new Date()` and `performance.now()`
 * repository-wide and `pnpm check:deps` enforces it. The shape is the one
 * `domain/save-status.ts` uses: the caller supplies the monotonic timestamp it
 * already has, `startedAtSecs` is the moment the screen became VISIBLE, and
 * `loadingScreenView` takes `nowSecs` as a parameter. A two-and-a-half second
 * floor is therefore testable in microseconds.
 *
 * ---------------------------------------------------------------------------
 * A failure is not a slow load
 * ---------------------------------------------------------------------------
 *
 * `failed` does not expire and the floor does not apply to it, which is the same
 * asymmetry `domain/save-status.ts` argues at length: a confirmation is a
 * receipt and a failure is a warning, and the player who most needs to read
 * 「we could not build this world」 is the one who had looked away. A failure that
 * a duration could hide would be a failure the player learns about by finding
 * themselves back at a menu with no explanation.
 */

/**
 * How long the screen stays up once there is nothing left to wait for.
 *
 * 2.5 seconds, which is the reference's own
 * (`session-loading-gates-state.ts:1`). Carried over rather than re-chosen: the
 * number is not derivable from anything, and inventing a different one here
 * would make this repository's floor and the reference's finding two unrelated
 * facts.
 */
export const LOADING_MINIMUM_VISIBLE_SECS = 2.5

/**
 * What the host is telling us, which is about the WORLD and not about the
 * screen.
 *
 * `ready` is a claim about terrain and layers, not a request to hide anything —
 * see the header. `reason` rides on `failed` alone so that a caller cannot
 * describe a failure that is not one, which is the shape
 * `domain/inventory-view-model.ts` uses to keep 「empty」 and 「unknown」 apart.
 */
export type LoadingProgress =
  | { readonly kind: 'preparing' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly reason: string }

export type LoadingStatus = {
  readonly progress: LoadingProgress
  /**
   * Monotonic seconds at which the screen became VISIBLE — supplied by the
   * caller, never read from a global (DN-UI-10).
   *
   * Visible, not "loading began". The reference's test starts its stopwatch at
   * the moment it can SEE the overlay for exactly this reason: a floor measured
   * from a moment the player could not observe is a floor about nothing.
   */
  readonly startedAtSecs: number
}

/**
 * Enter a state at a monotonic time.
 *
 * A non-finite time becomes 0, which makes the floor elapse immediately rather
 * than never. That is the opposite call from `saveStatus`, and deliberately: a
 * `NaN` there would pin a receipt on screen forever, whereas a `NaN` here would
 * pin the player in front of a loading screen with a finished world behind it.
 * Both choices avoid the outcome that traps somebody.
 */
const NON_FINITE_START_FALLBACK_SECS = 0

const normalizedStartedAtSecs = (atSecs: number): number => {
  if (Number.isFinite(atSecs)) {
    return atSecs
  }
  return NON_FINITE_START_FALLBACK_SECS
}

export const loadingStatus = (progress: LoadingProgress, atSecs: number): LoadingStatus => ({
  progress,
  startedAtSecs: normalizedStartedAtSecs(atSecs),
})

/** Nothing is loading, so nothing is on screen. */
export const IDLE_LOADING_STATUS: LoadingStatus = {
  progress: { kind: 'ready' },
  startedAtSecs: 0,
}

/**
 * What the screen shows right now, or `undefined` for nothing at all.
 *
 * `held` is the distinction the reference needed a stopwatch to observe: the
 * work is DONE and the screen is up only because of the floor. It is published
 * rather than folded into `preparing` because they are different facts about the
 * session — one of them means the host is still working — and a host that wants
 * to know whether it is waiting on terrain or on a timer should not have to
 * re-derive it. DN-UI-7c is the record of what a second derivation costs.
 */
export type LoadingScreenView =
  | { readonly kind: 'preparing'; readonly held: boolean }
  | { readonly kind: 'failed'; readonly reason: string }

export const loadingScreenView = (
  status: LoadingStatus,
  nowSecs: number,
  minimumVisibleSecs: number = LOADING_MINIMUM_VISIBLE_SECS,
): LoadingScreenView | undefined => {
  const {progress} = status
  if (progress.kind === 'failed') {
    return { kind: 'failed', reason: progress.reason }
  }
  if (progress.kind === 'preparing') {
    return { held: false, kind: 'preparing' }
  }
  const elapsed = nowSecs - status.startedAtSecs
  // A NaN or a backwards clock keeps the screen UP for one more frame rather
  // Than tearing it away mid-transition. Same call as `saveStatusMessage`:
  // Choose the outcome that does not invent a claim, and here hiding is the
  // Claim ("the world is ready and you have had time to see that it was not").
  if (Number.isNaN(elapsed) || elapsed < minimumVisibleSecs) {
    return { held: true, kind: 'preparing' }
  }
  return
}
