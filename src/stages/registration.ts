/**
 * Mx-ui's contribution to the frame (plan.md §4.1).
 *
 * ---------------------------------------------------------------------------
 * What mx-ui's public API is, and why it is bigger than the other two
 * ---------------------------------------------------------------------------
 *
 * mx-gameplay and mx-redstone expose stage registration and essentially nothing
 * else (plan.md §3.12 is explicit about redstone). mx-ui has one more surface,
 * because a UI has to be MOUNTED: mc-compose needs to hand it a root element and
 * to know when a screen wants to be opened. That surface is deliberately small
 * and is described in docs/public-api.md; everything else here — view models,
 * caption queues, the modal stack — is internal, exported for this repository's
 * own previews and tests.
 *
 * ---------------------------------------------------------------------------
 * No DOM in this file
 * ---------------------------------------------------------------------------
 *
 * The stages below move data. Turning data into elements is the DOM layer's job
 * and lives in a module that imports this one, never the reverse. That is what
 * keeps the whole current test suite runnable under `environment: 'node'` —
 * see vitest.config.ts, and docs/testing.md for the `it.effect` + `Deferred`
 * deadlock the DOM suite has to avoid when it arrives.
 */
import {
  type CaptionQueue,
  type CaptionSettings,
  applyCaptionSettings,
  emptyCaptionQueue,
  expireCaptions,
} from '../domain/caption.js'
import type { DeltaTimeSecs, GameModule, StageRegistration } from '../domain/frame-contract.js'
import { Effect, Layer, Ref } from 'effect'
import {
  type FpsCounter,
  advanceFpsCounter,
  emptyFpsCounter,
} from '../domain/fps-counter.js'
import {
  type HudViewModel,
  type VitalsSnapshot,
  hudViewModel,
  spawnSnapshot,
} from '../domain/hud-view-model.js'
import { type ModalStack, emptyModalStack } from '../domain/modal-stack.js'
import { UI_STAGE_IDS, UPSTREAM_STAGE_IDS } from './stage-ids.js'

/** `elapsedSecs` starts at zero and only ever accumulates `dt`. */
const INITIAL_ELAPSED_SECS = 0

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  // Starts false because the browser's autoplay gate has not been satisfied on
  // The first frame. Captions appear anyway — see domain/caption.ts.
  audioUnlocked: false,
  captionsEnabled: true,
}

export type UiFrameState = {
  /**
   * The most recent snapshot handed over by mc-sim.
   *
   * A copy, not a live reference: mx-ui reads state and must never hold a
   * mutable handle on somebody else's. The reference's camera-ownership
   * inversion (plan.md §3.8) is what that rule is guarding against — once a
   * presentation layer holds the authoritative object, "who owns this value"
   * stops having an answer.
   */
  readonly snapshot: Ref.Ref<VitalsSnapshot>
  readonly hud: Ref.Ref<HudViewModel>
  readonly captions: Ref.Ref<CaptionQueue>
  /**
   * The player's caption choice, held so that `ui:overlay-sync` can ENFORCE it.
   *
   * It is a `Ref` rather than a constructor argument because it changes while
   * the session runs — that is the whole point of a settings screen — and
   * because the frame is the only place that can notice the change. Holding it
   * as a constant would reproduce exactly the defect
   * `applyCaptionSettings` exists to fix: a flag nobody re-reads.
   */
  readonly captionSettings: Ref.Ref<CaptionSettings>
  readonly modals: Ref.Ref<ModalStack>
  /** Monotonic seconds, accumulated from `dt`. Never read from a global. */
  readonly elapsedSecs: Ref.Ref<number>
  /** Average frame rate measured from the frame-supplied `dt`. */
  readonly fpsCounter: Ref.Ref<FpsCounter>
}

/**
 * An Effect rather than a constant, so a test, each per-screen preview and the
 * game can hold their own. plan.md §3.8 records app-scope singletons as among
 * the reference's worst bug sources.
 */
export const makeUiFrameState: Effect.Effect<UiFrameState> = Effect.gen(function*  makeUiFrameState() {
  const snapshot = yield* Ref.make<VitalsSnapshot>(spawnSnapshot)
  const hud = yield* Ref.make<HudViewModel>(hudViewModel(spawnSnapshot))
  const captions = yield* Ref.make<CaptionQueue>(emptyCaptionQueue)
  const captionSettings = yield* Ref.make<CaptionSettings>(DEFAULT_CAPTION_SETTINGS)
  const modals = yield* Ref.make<ModalStack>(emptyModalStack)
  const elapsedSecs = yield* Ref.make(INITIAL_ELAPSED_SECS)
  const fpsCounter = yield* Ref.make<FpsCounter>(emptyFpsCounter)

  return { captionSettings, captions, elapsedSecs, fpsCounter, hud, modals, snapshot }
})

/**
 * The two stages mx-ui registers.
 *
 * Neither resolves an order; each carries `after` constraints and mc-compose
 * sorts the union (plan.md §2.3-3). The array order here is for human reading.
 */
export const uiStages = (state: UiFrameState): ReadonlyArray<StageRegistration> => [
  {
    after: [UPSTREAM_STAGE_IDS.simPhysics],
    id: UI_STAGE_IDS.hudSync,
    run: () =>
      Effect.gen(function*  run() {
        // FIRST CUT: the snapshot is written into `state.snapshot` by whoever
        // Drives the frame. When mc-sim is published this stage reads its
        // Services directly and the Ref becomes an implementation detail of the
        // Previews.
        const snapshot = yield* Ref.get(state.snapshot)
        yield* Ref.set(state.hud, hudViewModel(snapshot))
      }),
  },
  {
    after: [UI_STAGE_IDS.hudSync],
    id: UI_STAGE_IDS.overlaySync,
    run: (dt: DeltaTimeSecs) =>
      Effect.gen(function*  run() {
        // Time comes from `dt`, which the frame supplies. plan.md §4.3 bans
        // Reading a global clock, and `pnpm check:deps` enforces it — so a
        // Caption's age is an accumulation, not a reading.
        const nowSecs = yield* Ref.updateAndGet(state.elapsedSecs, (elapsed) => elapsed + dt)
        yield* Ref.update(state.fpsCounter, (counter) => advanceFpsCounter(counter, dt))
        // SETTINGS FIRST, then age. `receiveCaption` gates admission and cannot
        // Reach a caption that is already up, so turning captions off would
        // Otherwise leave the visible ones to drain through `expireCaptions` —
        // For the rest of their lifetime, and forever if `dt` stops arriving.
        // See `applyCaptionSettings`.
        const settings = yield* Ref.get(state.captionSettings)
        yield* Ref.update(state.captions, (queue) =>
          expireCaptions(applyCaptionSettings(queue, settings), nowSecs),
        )
      }),
  },
]

/**
 * Build the module's state and its stages together.
 *
 * This is exactly `GameModule.frameStages` — see `uiModule` below.
 */
export const makeUiStages: Effect.Effect<ReadonlyArray<StageRegistration>> = Effect.map(
  makeUiFrameState,
  uiStages,
)

/**
 * Mx-ui as a `GameModule` (plan.md §4.1).
 *
 * This used to say "not yet a `GameModule`: that type carries a
 * `Layer.Layer<ROut, E, RIn>`, and `RIn` cannot be named until mc-sim's and
 * mc-audio's public APIs exist". The Layer was never the obstacle — mx-ui
 * provides no service through the frame contract; mounting a UI is a separate,
 * deliberately small surface (see the module header and docs/public-api.md).
 * The obstacle was that `frameStages` was an ARRAY, and these stages are built
 * from `Ref`s allocated in an Effect. The vertical-slice spike made it an
 * Effect, and the shape this file had already been forced into became the
 * contract.
 *
 * `RIn` is `never` and stays `never`. When `ui:hud-sync` starts reading mc-sim
 * and `ui:overlay-sync` starts asking mc-audio whether the autoplay gate has
 * opened, those services are acquired in `frameStages` — the `RRegister`
 * parameter — because this repository builds nothing they have to supply.
 */
export const uiModule: GameModule<never, never, never> = {
  frameStages: makeUiStages,
  layers: Layer.empty,
}
