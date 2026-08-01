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
import { pointerLockReleased, type ModalStack } from './modal-stack'

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
   * Monotonic seconds at which the last hit LANDED, or `undefined` for none —
   * supplied by the caller, never read from a global (DN-UI-10).
   */
  readonly lastHitAtSecs: number | undefined
  /**
   * Active block-breaking progress, where zero is a started but empty bar.
   * `undefined` means no block is currently being broken.
   */
  readonly breakProgress?: number | undefined
}

export const IDLE_CROSSHAIR_STATUS: CrosshairStatus = {
  modals: [],
  lastHitAtSecs: undefined,
}

/**
 * What the crosshair shows right now, or `undefined` for nothing at all.
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

export const crosshairViewModel = (
  status: CrosshairStatus,
  nowSecs: number,
  pulseSecs: number = CROSSHAIR_PULSE_SECS,
): CrosshairViewModel | undefined => {
  if (pointerLockReleased(status.modals)) {
    return undefined
  }
  const suppliedProgress = status.breakProgress
  const breakProgress =
    suppliedProgress !== undefined && Number.isFinite(suppliedProgress)
      ? Math.min(1, Math.max(0, suppliedProgress))
      : undefined
  const at = status.lastHitAtSecs
  if (at === undefined) {
    return { hit: false, breakProgress }
  }
  const since = nowSecs - at
  // A NaN or a backwards clock shows NO hit, which is the opposite call from
  // `saveStatusMessage` and `loadingScreenView` and for the same underlying
  // rule: choose the outcome that does not invent a claim. There, keeping a
  // message up claims nothing new. Here, a hit marker IS the claim — 「you struck
  // something」 — and one that stuck because of a bad subtraction would tell the
  // player they connected when they missed.
  return {
    hit: Number.isFinite(since) && since >= 0 && since < pulseSecs,
    breakProgress,
  }
}
