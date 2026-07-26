/**
 * mx-ui's contribution to the frame (plan.md §4.1).
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
import { Effect, Layer, Ref } from 'effect'
import {
  emptyCaptionQueue,
  expireCaptions,
  type CaptionQueue,
  type CaptionSettings,
} from '../domain/caption'
import type { DeltaTimeSecs, GameModule, StageRegistration } from '../domain/frame-contract'
import {
  hudViewModel,
  spawnSnapshot,
  type HudViewModel,
  type VitalsSnapshot,
} from '../domain/hud-view-model'
import { emptyModalStack, type ModalStack } from '../domain/modal-stack'
import { UI_STAGE_IDS, UPSTREAM_STAGE_IDS } from './stage-ids'

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  captionsEnabled: true,
  // Starts false because the browser's autoplay gate has not been satisfied on
  // the first frame. Captions appear anyway — see domain/caption.ts.
  audioUnlocked: false,
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
  readonly modals: Ref.Ref<ModalStack>
  /** Monotonic seconds, accumulated from `dt`. Never read from a global. */
  readonly elapsedSecs: Ref.Ref<number>
}

/**
 * An Effect rather than a constant, so a test, each per-screen preview and the
 * game can hold their own. plan.md §3.8 records app-scope singletons as among
 * the reference's worst bug sources.
 */
export const makeUiFrameState: Effect.Effect<UiFrameState> = Effect.gen(function* () {
  const snapshot = yield* Ref.make<VitalsSnapshot>(spawnSnapshot)
  const hud = yield* Ref.make<HudViewModel>(hudViewModel(spawnSnapshot))
  const captions = yield* Ref.make<CaptionQueue>(emptyCaptionQueue)
  const modals = yield* Ref.make<ModalStack>(emptyModalStack)
  const elapsedSecs = yield* Ref.make(0)

  return { snapshot, hud, captions, modals, elapsedSecs }
})

/**
 * The two stages mx-ui registers.
 *
 * Neither resolves an order; each carries `after` constraints and mc-compose
 * sorts the union (plan.md §2.3-3). The array order here is for human reading.
 */
export const uiStages = (state: UiFrameState): ReadonlyArray<StageRegistration> => [
  {
    id: UI_STAGE_IDS.hudSync,
    after: [UPSTREAM_STAGE_IDS.simPhysics],
    run: () =>
      Effect.gen(function* () {
        // FIRST CUT: the snapshot is written into `state.snapshot` by whoever
        // drives the frame. When mc-sim is published this stage reads its
        // services directly and the Ref becomes an implementation detail of the
        // previews.
        const snapshot = yield* Ref.get(state.snapshot)
        yield* Ref.set(state.hud, hudViewModel(snapshot))
      }),
  },
  {
    id: UI_STAGE_IDS.overlaySync,
    after: [UI_STAGE_IDS.hudSync],
    run: (dt: DeltaTimeSecs) =>
      Effect.gen(function* () {
        // Time comes from `dt`, which the frame supplies. plan.md §4.3 bans
        // reading a global clock, and `pnpm check:deps` enforces it — so a
        // caption's age is an accumulation, not a reading.
        const nowSecs = yield* Ref.updateAndGet(state.elapsedSecs, (elapsed) => elapsed + dt)
        yield* Ref.update(state.captions, (queue) => expireCaptions(queue, nowSecs))
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
 * mx-ui as a `GameModule` (plan.md §4.1).
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
  layers: Layer.empty,
  frameStages: makeUiStages,
}
