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
 * caption events, the modal stack — is internal, exported for this repository's
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
import { type Brand, Effect, Layer, Ref, Schema } from 'effect'
import { type DeltaTimeSecs, type GameModule, type StageRegistration } from '@nerima-games/mc-kernel'
import {
  type FpsCounter,
  advanceFpsCounter,
  emptyFpsCounter,
} from '../domain/fps-counter.js'
import {
  HOTBAR_SLOT_COUNT,
  type HudViewModel,
  type VitalsSnapshot,
  hudViewModel,
  spawnSnapshot,
} from '../domain/hud-view-model.js'
import { type ModalStack, emptyModalStack } from '../domain/modal-stack.js'
import { UI_STAGE_IDS, UPSTREAM_STAGE_IDS } from './stage-ids.js'
import { type CaptionEvent } from '../domain/caption.js'
import { type InventoryCarriedSlot } from '@nerima-games/mc-sim'
import { emptyInventorySnapshot } from '../domain/inventory-view-model.js'

/** `elapsedSecs` starts at zero and only ever accumulates `dt`. */
const INITIAL_ELAPSED_SECS = 0
const FIRST_HOTBAR_SLOT = 0
const ONE = 1
const LAST_HOTBAR_SLOT = HOTBAR_SLOT_COUNT - ONE
const INITIAL_SELECTED_HOTBAR_SLOT = FIRST_HOTBAR_SLOT
const HOTBAR_START_INDEX = 0
const EMPTY_HOTBAR_SLOTS: ReadonlyArray<InventoryCarriedSlot> =
  emptyInventorySnapshot.inventory.slots.slice(HOTBAR_START_INDEX, HOTBAR_SLOT_COUNT)

export type SelectedHotbarSlot = number & Brand.Brand<'SelectedHotbarSlot'>
export const SelectedHotbarSlotSchema: Schema.Codec<SelectedHotbarSlot, number> = Schema.Int.check(
  Schema.isBetween({ maximum: LAST_HOTBAR_SLOT, minimum: FIRST_HOTBAR_SLOT }),
).pipe(Schema.brand('SelectedHotbarSlot'))

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
  readonly hotbarSlots: Ref.Ref<ReadonlyArray<InventoryCarriedSlot>>
  readonly selectedHotbarSlot: Ref.Ref<SelectedHotbarSlot>
  readonly hud: Ref.Ref<HudViewModel>
  /** Events from mc-audio; captionLines applies the owner's visibility policy. */
  readonly captions: Ref.Ref<ReadonlyArray<CaptionEvent>>
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
  const hotbarSlots = yield* Ref.make(EMPTY_HOTBAR_SLOTS)
  const selectedHotbarSlot = yield* Ref.make(
    Schema.decodeUnknownSync(SelectedHotbarSlotSchema)(INITIAL_SELECTED_HOTBAR_SLOT),
  )
  const hud = yield* Ref.make<HudViewModel>(
    hudViewModel(spawnSnapshot, EMPTY_HOTBAR_SLOTS, INITIAL_SELECTED_HOTBAR_SLOT),
  )
  const captions = yield* Ref.make<ReadonlyArray<CaptionEvent>>([])
  const modals = yield* Ref.make<ModalStack>(emptyModalStack)
  const elapsedSecs = yield* Ref.make(INITIAL_ELAPSED_SECS)
  const fpsCounter = yield* Ref.make<FpsCounter>(emptyFpsCounter)

  return {
    captions,
    elapsedSecs,
    fpsCounter,
    hotbarSlots,
    hud,
    modals,
    selectedHotbarSlot,
    snapshot,
  }
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
        // The owner state is written by whoever drives the frame.
        const vitals = yield* Ref.get(state.snapshot)
        const hotbarSlots = yield* Ref.get(state.hotbarSlots)
        const selectedHotbarSlot = yield* Ref.get(state.selectedHotbarSlot)
        yield* Ref.set(state.hud, hudViewModel(vitals, hotbarSlots, selectedHotbarSlot))
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
        yield* Ref.update(state.elapsedSecs, (elapsed) => elapsed + dt)
        yield* Ref.update(state.fpsCounter, (counter) => advanceFpsCounter(counter, dt))
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
