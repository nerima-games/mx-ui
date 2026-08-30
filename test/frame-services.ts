/**
 * The context a frame stage runs in, for tests.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE PROVIDES A REAL CLOCK, AND WHY EVERY STAGE CALL PIPES IT
 * ---------------------------------------------------------------------------
 *
 * `FrameServices` is `@nerima-games/mc-kernel`'s `ClockPort` (Wave 1, W1-M7 —
 * this file used to import a local stand-in that aliased `FrameServices` to
 * `never`, back when kernel was unpublished). Every `stage.run(dt)` in this
 * repository's tests is therefore an `Effect<void, never, ClockPort>`, which
 * neither `it.effect` nor `Effect.runPromise` can run unless something
 * discharges `ClockPort` first — hence `FixedClockLayer` below, and hence
 * every call site piping `Effect.provide(FrameServicesLayer)` even though no
 * stage this repository registers reads the clock itself yet.
 *
 * DO NOT SIMPLIFY THE CALL SITES. Deleting an
 * `Effect.provide(FrameServicesLayer)` looks harmless precisely because
 * nothing reads `ClockPort` today, but the requirement is real at the type
 * level regardless, and a stage that starts reading the clock would silently
 * lose its test coverage at every call site the provide was trimmed from.
 *
 * ---------------------------------------------------------------------------
 * Why a layer and not a hand-rolled clock
 * ---------------------------------------------------------------------------
 *
 * Nothing here may read a wall clock. plan.md §5.1-3 bans it and
 * `pnpm check:deps` enforces it, and a test clock is precisely where somebody
 * reaches for `Date.now()` on the grounds that it is only a test. This
 * repository has more reason than most to hold that line: `domain/caption.ts`
 * and `domain/save-status.ts` both take the monotonic instant as an ARGUMENT
 * so that a caption's lifetime is driven by accumulated `dt` and never by a
 * global, and `test/stage-registration.test.ts` carries a named regression
 * saying so. Kernel ships `FixedClockLayer` so that a deterministic clock never
 * has to be written by hand again; this file takes kernel's rather than
 * rolling its own.
 */
import { Layer } from 'effect'
import { EpochMillis, FixedClockLayer, MonotonicTimeSecs, type FrameServices } from '@nerima-games/mc-kernel'

/** Everything a stage of this repository may assume is present when it runs. */
export const FrameServicesLayer: Layer.Layer<FrameServices> = FixedClockLayer({
  monotonicSecs: MonotonicTimeSecs(0),
  wallClockEpochMillis: EpochMillis(0),
})
