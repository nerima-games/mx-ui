/**
 * The context a frame stage runs in, for tests.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT LOOKS LIKE IT DOES NOTHING
 * ---------------------------------------------------------------------------
 *
 * `Layer.empty` below is not a placeholder waiting to be inlined away. It is
 * the ONE place at which this repository will have to hand a real clock to the
 * stages its tests run, and it is written as a layer today so that the day it
 * has to carry one is a one-line edit here rather than an edit at every test
 * that runs a stage.
 *
 * `domain/frame-contract.ts` aliases `FrameServices` to `never` and gives the
 * argument for it: mc-kernel is unpublished, and restating its `ClockPort`
 * locally would mean a second `Context.Tag` carrying kernel's identifier
 * string. Kernel's own alias is `ClockPort`. So on the day that mirror is
 * deleted and its importers repointed at `@nerima-games/mc-kernel`, every
 * `stage.run(dt)` in this repository's tests stops being an
 * `Effect<void, never, never>` and becomes an `Effect<void, never, ClockPort>`
 * — which neither `it.effect` nor `Effect.runPromise` can run, because a test
 * context that was never given a clock cannot discharge it.
 *
 * That is measured rather than predicted. mc-dev-meta's `pnpm check:repoint`
 * performs the repoint on a throwaway copy and compiles it; before this file
 * existed it reported FIVE such call sites in this repository — three in
 * `test/stage-registration.test.ts` and two in `test/caption-oracle.test.ts`,
 * which drives `ui:overlay-sync` through `Effect.runPromise` because it is a
 * DOM oracle and runs on plain `it` (DN-UI-2). Each of them now provides
 * `FrameServicesLayer`, so the count is one — this declaration — and the
 * remaining fix is to replace `Layer.empty` with kernel's own fixed clock:
 *
 *     import { FixedClockLayer, MonotonicTimeSecs, EpochMillis } from '@nerima-games/mc-kernel'
 *
 *     export const FrameServicesLayer: Layer.Layer<FrameServices> = FixedClockLayer({
 *       monotonicSecs: MonotonicTimeSecs(0),
 *       wallClockEpochMillis: EpochMillis(0),
 *     })
 *
 * DO NOT SIMPLIFY THE CALL SITES. Deleting an
 * `Effect.provide(FrameServicesLayer)` is invisible today — the layer is empty,
 * so providing it changes neither type nor behaviour — and silently re-opens
 * that call site on the day of the repoint. The pipe is load-bearing in the
 * future tense, which is the only tense a mirror lives in.
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
import { Layer } from 'effect'
import type { FrameServices } from '../domain/frame-contract'

/**
 * Everything a stage of this repository may assume is present when it runs.
 *
 * Empty today because `FrameServices` is `never` today. The TYPE is what
 * carries the intent: it tracks the contract rather than the current state of
 * the mirror, so widening the alias moves this declaration and nothing else.
 */
export const FrameServicesLayer: Layer.Layer<FrameServices> = Layer.empty
