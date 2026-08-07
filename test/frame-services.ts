/**
 * The context a frame stage runs in, for tests.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT LOOKS LIKE IT DOES NOTHING
 * ---------------------------------------------------------------------------
 *
 * This is the ONE place at which this repository hands a deterministic clock
 * to the stages its tests run. Keeping it as a layer avoids repeating the
 * runtime dependency at every test call site.
 *
 * `FrameServices` is the kernel's `ClockPort` tag. Stages therefore require a
 * clock environment, and each test execution provides this layer explicitly.
 *
 * Every stage-running test provides `FrameServicesLayer`, including the DOM
 * oracle that executes through `Effect.runPromise` (DN-UI-2). The layer uses
 * kernel's fixed clock:
 *
 *     import { EpochMillis, FixedClockLayer, MonotonicTimeSecs } from '@nerima-games/mc-kernel'
 *
 *     export const FrameServicesLayer: Layer.Layer<FrameServices> = FixedClockLayer({
 *       monotonicSecs: MonotonicTimeSecs(0),
 *       wallClockEpochMillis: EpochMillis(0),
 *     })
 *
 * DO NOT SIMPLIFY THE CALL SITES. `FrameServices` is the kernel's `ClockPort`,
 * so every call site must provide an explicit deterministic clock. Keeping the
 * pipe visible makes that dependency explicit and prevents a future caller
 * from silently falling back to an ambient clock.
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
 * has to be written by hand again; when this file needs one it takes kernel's,
 * and the substitution above is the whole of the work.
 */
import {
  EpochMillis,
  FixedClockLayer,
  type FrameServices,
  MonotonicTimeSecs,
} from '@nerima-games/mc-kernel'
import { Layer } from 'effect'

const TEST_MONOTONIC_SECS = 0
const TEST_WALL_CLOCK_EPOCH_MILLIS = 0

/**
 * Everything a stage of this repository may assume is present when it runs.
 *
 * The fixed values make frame tests deterministic while satisfying the kernel
 * clock contract.
 */
// eslint-disable-next-line new-cap
export const FrameServicesLayer: Layer.Layer<FrameServices> = FixedClockLayer({
  // Effect Brand constructors are callable validation functions, not classes.
  // eslint-disable-next-line new-cap
  monotonicSecs: MonotonicTimeSecs(TEST_MONOTONIC_SECS),
  // eslint-disable-next-line new-cap
  wallClockEpochMillis: EpochMillis(TEST_WALL_CLOCK_EPOCH_MILLIS),
})
