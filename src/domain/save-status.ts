/**
 * The autosave indicator's state — the component the palette survey's headline
 * finding is about.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 *
 * `domain/palette.ts` records a real defect found in the reference
 * implementation: `<reference-impl>/index.html:159` inks a successful autosave
 * `#d7f7c2` and `:212` inks a FAILED one `#ffd6d2`. Simulated, those two are 12
 * units apart under protanopia and 22 under deuteranopia, against a collapse
 * threshold of 24 out of the 442-unit sRGB diagonal. **A red-green dichromat —
 * roughly one man in twelve — cannot tell "world saved" from "save failed",** and
 * the two strings are the same length in the same place on the same backdrop.
 *
 * The palette fixed the VALUES with a luminance ladder (`STATUS_OK` 0.85,
 * `STATUS_BUSY` 0.57, `STATUS_ALERT` 0.29). It could not fix the SCREEN, because
 * there was no component to show them: `test/palette-css.test.ts` pinned
 * `STATUS_OK` and `STATUS_BUSY` as declared-but-never-referenced, and
 * `docs/testing.md` §4 criterion 4 called that out as the uncomfortable one. A
 * fix nobody can see is a fix about numbers.
 *
 * This module is the state half of the component; `application/save-indicator.ts`
 * is the elements half. Nothing here touches `document`, so the timing below is
 * arithmetic and runs under `environment: 'node'` like every other derivation in
 * this directory.
 *
 * ---------------------------------------------------------------------------
 * THE STATES, AND HOW LONG EACH IS SHOWN
 * ---------------------------------------------------------------------------
 *
 * | state    | on screen | for how long                                        |
 * | -------- | --------- | --------------------------------------------------- |
 * | `idle`   | nothing   | —                                                   |
 * | `saving` | yes       | until the host says otherwise. NOT timed here.      |
 * | `saved`  | yes       | `SAVED_VISIBLE_SECS`, then nothing                  |
 * | `failed` | yes       | until the host says otherwise. It does NOT expire.  |
 *
 * Three of those four rows are decisions rather than defaults.
 *
 * **`saving` is not timed by mx-ui.** A save takes as long as it takes, and this
 * repository does not own the save (mc-sim does). An indicator that gave up after
 * N seconds would tell the player the write finished when it had not — the same
 * class of lie DN-UI-6 refuses when it declines to round a half heart away.
 *
 * **`failed` does not expire.** This is the asymmetry that matters. A
 * confirmation is a receipt: missing it costs nothing, because the thing it
 * confirms already happened. A failure is a warning: missing it costs the world.
 * The player who most needs to see "save failed" is the one who was looking at
 * the game and not at the corner of the HUD, and a three-second toast is exactly
 * the mechanism that loses them. So the only thing that clears a failure is
 * another save attempt saying something different.
 *
 * That asymmetry is also the second, independent channel on which the two states
 * the reference collapsed differ: one of them goes away and the other stays. It
 * is not a `Distinguisher` in `domain/palette.ts` — that union covers channels a
 * player reads in a single glance — but it is real, and it is free.
 *
 * **`saved` borrows `CAPTION_LIFETIME_SECS`' three seconds on purpose.** Two
 * transient lines on the same HUD that vanish at different rates read as a bug in
 * one of them; see `SAVED_VISIBLE_SECS`.
 *
 * ---------------------------------------------------------------------------
 * No clock (DN-UI-10)
 * ---------------------------------------------------------------------------
 *
 * plan.md §4.3 bans `Date.now()`, `new Date()` and `performance.now()`
 * repository-wide, and `pnpm check:deps` enforces it. `domain/caption.ts` states
 * the shape this file copies: 「the caller supplies the monotonic timestamp it
 * already has」. `SaveStatus.sinceSecs` is the moment the state was ENTERED and
 * `saveStatusMessage` takes `nowSecs` as a parameter, so a test can age a
 * three-second confirmation in microseconds.
 *
 * Note what this file does NOT need, and `domain/caption.ts` does: a stage.
 * `ui:overlay-sync` prunes the caption queue because the queue GROWS — expiry
 * there is a deletion. A save status is one value, so its expiry is a
 * subtraction performed at read time, and there is nothing for a frame stage to
 * do. The status arrives the same way `VitalsSnapshot` does: from whoever drives
 * the frame.
 */

/** The three states that put something on screen. `idle` puts nothing. */
export type SaveMessage = 'saving' | 'saved' | 'failed'

export type SaveState = 'idle' | SaveMessage

export type SaveStatus = {
  readonly state: SaveState
  /**
   * Monotonic seconds at which `state` was ENTERED — supplied by the caller,
   * never read from a global (DN-UI-10). Only `saved` reads it.
   */
  readonly sinceSecs: number
}

/** Nothing has been saved yet, so nothing is on screen. */
export const IDLE_SAVE_STATUS: SaveStatus = { state: 'idle', sinceSecs: 0 }

/**
 * How long "World saved" stays up.
 *
 * Three seconds, which is `CAPTION_LIFETIME_SECS`, and the agreement is
 * deliberate rather than a coincidence to be tidied away later: a caption and a
 * save confirmation are both transient lines on the same HUD, and two of them
 * disappearing at visibly different rates reads as a bug in whichever one the
 * player noticed second.
 *
 * It applies to `saved` and to nothing else. See the table in the header for why
 * `saving` and `failed` have no duration at all.
 */
export const SAVED_VISIBLE_SECS = 3

/**
 * Enter a state at a monotonic time.
 *
 * A one-line constructor, and it exists so that `sinceSecs` is named at every
 * call site as the time the state was ENTERED rather than the time somebody
 * happened to be rendering. A non-finite time becomes 0: a `saved` whose
 * `sinceSecs` is `NaN` would otherwise be a confirmation that never expires,
 * which is the one behaviour reserved for a failure.
 */
export const saveStatus = (state: SaveState, atSecs: number): SaveStatus => ({
  state,
  sinceSecs: Number.isFinite(atSecs) ? atSecs : 0,
})

/**
 * What the indicator shows right now, or `undefined` for nothing at all.
 *
 * The one derivation, shared by the DOM layer and by the tests — the same
 * discipline `surveyPalette` follows, and for the reason DN-UI-7c records: a
 * second copy of "is it still up?" is a second answer.
 *
 * `NaN` anywhere in the subtraction keeps the message VISIBLE. That is the same
 * call `domain/hud-view-model.ts` makes when it clamps NaN to `low`: choose the
 * outcome that does not invent a claim. Hiding a save status is a claim ("there
 * is nothing to tell you"); leaving it up for another frame is not.
 */
export const saveStatusMessage = (
  status: SaveStatus,
  nowSecs: number,
  savedVisibleSecs: number = SAVED_VISIBLE_SECS,
): SaveMessage | undefined => {
  if (status.state === 'idle') {
    return undefined
  }
  // `saving` and `failed` have no duration; see the table in the header.
  if (status.state !== 'saved') {
    return status.state
  }
  const remaining = savedVisibleSecs - (nowSecs - status.sinceSecs)
  return Number.isNaN(remaining) || remaining > 0 ? 'saved' : undefined
}
