/**
 * Named regression tests for the frame contract.
 *
 * mx-ui is where §2.3-1 is hardest to hold, because almost every UI element
 * displays the result of some rule that lives in another experience module. The
 * discipline is that mx-ui reads mc-sim and nothing else — see the note in
 * `../src/stages/stage-ids.ts`.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect, Ref, Schema } from 'effect'
import * as publicUi from '../src/index'
import {
  DeltaTimeSecs,
  EntityHealthPoints,
  StageId,
  type GameModule,
  type StageRegistration,
} from '@nerima-games/mc-kernel'
import { CAPTION_LIFETIME_SECS, captionLines } from '../src/domain/caption'
import type { CaptionEvent } from '@nerima-games/mc-audio'
import { HOTBAR_SLOT_COUNT, hudViewModel, spawnSnapshot } from '../src/domain/hud-view-model'
import {
  makeUiFrameState,
  makeUiStages,
  SelectedHotbarSlotSchema,
  uiModule,
  uiStages,
} from '../src/stages/registration'
import {
  EXPERIENCE_MODULE_STAGE_PREFIXES,
  OWN_STAGE_PREFIX,
  UI_STAGE_IDS,
  UPSTREAM_STAGE_IDS,
} from '../src/stages/stage-ids'
import { FrameServicesLayer } from './frame-services'
import { debugOverlayModel } from '../src/domain/debug-overlay'
import type { UiQaSnapshot } from '../src/domain/ui-qa'
import { createUiModuleInstance } from '../src/application/ui-module-instance'
import { captionEvent, captionTime } from './helpers/caption-event'

const QA_WORLD_Y = 64
const QA_WORLD_Z = -2
const QA_FRAME_DELTA_SECS = 0.5
const FIRST_QA_WORLD_X = 6
const SECOND_QA_WORLD_X = 7

const allAfterEdges = (stages: ReadonlyArray<StageRegistration>): ReadonlyArray<string> =>
  stages.flatMap((stage) => [...(stage.after ?? [])])

const EMPTY_HOTBAR_SLOTS = Array.from({ length: HOTBAR_SLOT_COUNT }, () => undefined)

describe('selected hotbar slot boundary', () => {
  it.effect('accepts every display slot and rejects invalid indices', () =>
    Effect.sync(() => {
      const isSelectedHotbarSlot = Schema.is(SelectedHotbarSlotSchema)
      expect(Array.from({ length: HOTBAR_SLOT_COUNT }, (_slot, index) => isSelectedHotbarSlot(index))).toStrictEqual(
        Array.from({ length: HOTBAR_SLOT_COUNT }, () => true),
      )
      expect([-1, HOTBAR_SLOT_COUNT, 1.5, Number.NaN].some(isSelectedHotbarSlot)).toBe(false)
    }),
  )
})

describe('§2.3-1 zero edges between experience modules', () => {
  it.effect(
    'REGRESSION: no `after` edge names another experience module — "the hotbar updates after mining" is NOT an ordering constraint on gameplay',
    () =>
      Effect.gen(function* () {
        const stages = yield* makeUiStages
        const foreign = allAfterEdges(stages).filter((edge) =>
          EXPERIENCE_MODULE_STAGE_PREFIXES.some(
            (prefix) => prefix !== OWN_STAGE_PREFIX && edge.startsWith(prefix),
          ),
        )

        // mx-gameplay writes to mc-sim's InventoryService and mx-ui reads
        // mc-sim, so what mx-ui actually needs is to run after the SIMULATION.
        // `after: [StageId('gameplay:interactions')]` would look right, would
        // pass `pnpm check:deps` (it is a string), and would make the HUD
        // undeliverable in any build that omits mx-gameplay.
        expect(foreign).toStrictEqual([])
      }),
  )

  it.effect('REGRESSION: every declared upstream stage belongs to a foundation repository', () =>
    Effect.sync(() => {
      for (const id of Object.values(UPSTREAM_STAGE_IDS)) {
        const isSibling = EXPERIENCE_MODULE_STAGE_PREFIXES.some(
          (prefix) => prefix !== OWN_STAGE_PREFIX && id.startsWith(prefix),
        )
        expect(isSibling).toBe(false)
      }
    }),
  )

  it.effect('REGRESSION: mx-ui does not order itself against mc-render either, though §4.2 puts hud-sync after post-fx', () =>
    Effect.gen(function* () {
      const stages = yield* makeUiStages
      const edges = allAfterEdges(stages)
      expect(edges.some((edge) => edge.startsWith('render:'))).toBe(false)
      // mc-render is not a parent of mx-ui, and the position of hud-sync in the
      // global skeleton is mc-compose's statement to make (plan.md §2.3-3).
    }),
  )
})

describe('§2.3-3 the total order belongs to mc-compose', () => {
  it.effect('REGRESSION: a registration carries constraints and nothing else — no priority, no index', () =>
    Effect.gen(function* () {
      const stages = yield* makeUiStages
      for (const stage of stages) {
        expect(Object.keys(stage).sort()).toStrictEqual(['after', 'id', 'run'])
      }
    }),
  )

  it.effect('the two registered stages split by what they read', () =>
    Effect.gen(function* () {
      const stages = yield* makeUiStages
      const byId = new Map(stages.map((stage) => [stage.id, stage]))

      expect(stages.map((stage) => stage.id)).toStrictEqual([
        UI_STAGE_IDS.hudSync,
        UI_STAGE_IDS.overlaySync,
      ])
      expect(byId.get(UI_STAGE_IDS.hudSync)?.after).toStrictEqual([UPSTREAM_STAGE_IDS.simPhysics])
      expect(byId.get(UI_STAGE_IDS.overlaySync)?.after).toStrictEqual([UI_STAGE_IDS.hudSync])
    }),
  )

  it.effect('StageId rejects a blank id', () =>
    Effect.sync(() => {
      expect(() => StageId('')).toThrow()
      expect(StageId('ui:hud-sync')).toBe('ui:hud-sync')
    }),
  )
})

// The tests below that RUN a stage provide `FrameServicesLayer` — see
// `./frame-services.ts` for why a layer that is empty today is not a line worth
// deleting.
describe('stage behaviour', () => {
  it.effect('hud-sync rebuilds the view model from the snapshot it was given', () =>
    Effect.gen(function* () {
      const state = yield* makeUiFrameState
      const hudSync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.hudSync)

      yield* Ref.set(state.snapshot, {
        ...spawnSnapshot,
        healthPoints: EntityHealthPoints(1),
      })
      yield* hudSync?.run(DeltaTimeSecs(0.016)) ?? Effect.void

      const model = yield* Ref.get(state.hud)
      expect(model.hearts[0]).toBe('half')
      expect(model.dead).toBe(false)
    }).pipe(Effect.provide(FrameServicesLayer)),
  )

  it.effect('REGRESSION: caption ageing is driven by accumulated `dt`, never by a wall clock', () =>
    Effect.gen(function* () {
      // plan.md §4.3 bans `Date.now()` outright and `pnpm check:deps` enforces
      // it. The practical benefit is right here: three seconds of caption
      // lifetime pass in a handful of microseconds.
      const state = yield* makeUiFrameState
      const overlaySync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.overlaySync)

      const events: ReadonlyArray<CaptionEvent> = [
        captionEvent('Creeper hisses', 0, -1, 'audible'),
      ]
      yield* Ref.set(state.captions, events)
      expect(captionLines(events, captionTime(0))).toHaveLength(1)

      yield* overlaySync?.run(DeltaTimeSecs(CAPTION_LIFETIME_SECS / 2)) ?? Effect.void
      expect(captionLines(events, captionTime(yield* Ref.get(state.elapsedSecs)))).toHaveLength(1)

      yield* overlaySync?.run(DeltaTimeSecs(CAPTION_LIFETIME_SECS / 2)) ?? Effect.void
      expect(captionLines(events, captionTime(yield* Ref.get(state.elapsedSecs)))).toHaveLength(0)
    }).pipe(Effect.provide(FrameServicesLayer)),
  )

  it.effect('every stage tolerates dt = 0', () =>
    Effect.gen(function* () {
      const state = yield* makeUiFrameState
      yield* Effect.forEach(uiStages(state), (stage) => stage.run(DeltaTimeSecs(0)))
      expect(yield* Ref.get(state.elapsedSecs)).toBe(0)
      expect(yield* Ref.get(state.fpsCounter)).toStrictEqual({
        elapsedSecs: 0,
        fps: 0,
        frameCount: 0,
      })
      expect(yield* Ref.get(state.hud)).toStrictEqual(
        hudViewModel(spawnSnapshot, EMPTY_HOTBAR_SLOTS, 0),
      )
    }).pipe(Effect.provide(FrameServicesLayer)),
  )

  it.effect('overlay-sync derives FPS from accumulated frame delta', () =>
    Effect.gen(function* () {
      const state = yield* makeUiFrameState
      const overlaySync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.overlaySync)

      yield* overlaySync?.run(DeltaTimeSecs(0.5)) ?? Effect.void
      expect(yield* Ref.get(state.fpsCounter)).toStrictEqual({
        elapsedSecs: 0.5,
        fps: 0,
        frameCount: 1,
      })

      yield* overlaySync?.run(DeltaTimeSecs(0.5)) ?? Effect.void
      expect(yield* Ref.get(state.fpsCounter)).toStrictEqual({
        elapsedSecs: 0,
        fps: 2,
        frameCount: 0,
      })
    }).pipe(Effect.provide(FrameServicesLayer)),
  )

  it.effect('each call to makeUiFrameState yields independent state (re-entrant initialisation)', () =>
    Effect.gen(function* () {
      // Each per-screen preview (plan.md §3.13) boots its own state in the same
      // page. Sharing one would make the inventory preview's mock leak into the
      // settings preview.
      const first = yield* makeUiFrameState
      const second = yield* makeUiFrameState

      yield* Ref.set(first.snapshot, {
        ...spawnSnapshot,
        healthPoints: EntityHealthPoints(3),
      })

      expect((yield* Ref.get(first.snapshot)).healthPoints).toBe(3)
      expect((yield* Ref.get(second.snapshot)).healthPoints).toBe(spawnSnapshot.healthPoints)
    }),
  )
})

describe('the DeltaTimeSecs brand is kernel’s', () => {
  /*
   * REGRESSION, carried over from when this repository restated kernel's
   * `DeltaTimeSecs` (`mc-kernel/domain/quantities.ts:37-42`) in a local
   * stand-in (Wave 1, W1-M7 repointed this file straight at kernel's own
   * export instead). The
   * risk that test named is still real for a BRAND specifically: it is keyed
   * by its STRING, so `Brand.Brand<'DeltaTimeSecs'>` written in two places is
   * ONE TYPE to TypeScript however differently the two constructors validate.
   * mc-physics once had exactly that — a local mirror refining to the
   * frame-loop clamp [0.001, 0.05] while kernel refines to "finite and
   * non-negative" — so a kernel-built `DeltaTimeSecs(30)` satisfied its
   * parameter types while breaking the invariant its comments claimed. This
   * test now exercises kernel's real constructor directly, and stays as the
   * check that its refinement is still the loose one this repository's stages
   * assume.
   *
   * Kernel's is the agreed refinement and it is deliberately LOOSE: a zero
   * delta is legal, because a frame may be scheduled twice inside one clock
   * tick, and the clamp of plan.md §3.4 is a frame-loop concern applied at the
   * boundary by whoever PRODUCES the delta — mc-sim's `frame-timing.ts`,
   * mc-physics' `clampDeltaTime` — never a property of the quantity itself.
   * A stage receives whatever the loop produced and must cope.
   */
  it.effect('accepts zero and any finite non-negative delta, and rejects nothing else', () =>
    Effect.sync(() => {
      expect(DeltaTimeSecs(0)).toBe(0)
      expect(DeltaTimeSecs(0.0001)).toBe(0.0001)
      // Out of the integrator's safe range, and still a valid quantity: this is
      // what a tab that was backgrounded for thirty seconds produces.
      expect(DeltaTimeSecs(30)).toBe(30)

      expect(() => DeltaTimeSecs(-0.000_001)).toThrow()
      expect(() => DeltaTimeSecs(Number.NaN)).toThrow()
      expect(() => DeltaTimeSecs(Number.POSITIVE_INFINITY)).toThrow()
    }),
  )
})


describe('the module contract has caught up with this file’s shape', () => {
  const stageIds = (stages: ReadonlyArray<StageRegistration>): ReadonlyArray<string> =>
    stages.map((stage) => stage.id)

  /*
   * REGRESSION — the change the vertical-slice spike forced on mc-kernel.
   *
   * `stages/registration.ts` used to carry a comment saying it was "NOT yet a
   * `GameModule`" because the service set could not be named until mc-sim
   * published. That diagnosis was half wrong, and the wrong half is what the
   * spike found: mx-ui publishes no service through the frame contract; mounting a UI is a
   * separate surface. So its Layer is empty and always was.
   *
   * The real obstacle was that `GameModule.frameStages` was an ARRAY. These
   * stages are built from `Ref`s allocated in an Effect, so there was no way to
   * put them in a field typed `ReadonlyArray` — and, worse, an array gave NO
   * module anywhere a context in which to acquire a service in order to build a
   * stage, which forced every service any stage touched into `FrameServices`
   * and would have made kernel name mc-sim's and mc-render's services.
   *
   * kernel's `frameStages` is now an Effect. This test is what says the
   * repository actually took the shape, rather than the comment merely changing.
   */
  it.effect('REGRESSION: exports a real GameModule, not "stages alone, the Layer comes later"', () =>
    Effect.gen(function* () {
      const module: GameModule<never, never, never> = uiModule
      const stages = yield* module.frameStages

      expect(stageIds(stages)).toStrictEqual(Object.values(UI_STAGE_IDS))
    }),
  )

  it.effect('its frameStages IS the registration Effect this file already exported', () =>
    Effect.gen(function* () {
      expect(uiModule.frameStages).toBe(makeUiStages)

      // ...and it is re-entrant: two builds share no state, which is why it was
      // an Effect in the first place (plan.md §3.8 on app-scope singletons).
      const first = yield* uiModule.frameStages
      const second = yield* uiModule.frameStages
      expect(first).not.toBe(second)
    }),
  )

  it.effect('exposes the QA state operation through the public module and keeps its reader live', () =>
    Effect.gen(function* () {
      const publicModule = publicUi.uiModule
      const publicNamespace = publicModule.qa
      expect(publicNamespace).toBeDefined()
      if (publicNamespace === undefined) {
        return
      }

      expect(publicNamespace.name).toBe('ui')
      expect(publicNamespace.observe.state.name).toBe('state')
      const publicState = yield* publicNamespace.observe.state.run({})
      expect(publicState).toStrictEqual({ achievementToast: null, debugOverlay: null })
      expect(
        Schema.decodeUnknownSync(publicNamespace.observe.state.output, {
          onExcessProperty: 'error',
        })(publicState),
      ).toStrictEqual(publicState)

      const debugOverlayAt = (worldX: number) =>
        debugOverlayModel({
          cameraPose: undefined,
          dimension: undefined,
          frame: {
            cameraPosition: {
              worldX,
              worldY: QA_WORLD_Y,
              worldZ: QA_WORLD_Z,
            },
            deltaSecs: DeltaTimeSecs(QA_FRAME_DELTA_SECS),
          },
          gpuTimingSupported: undefined,
          latestGpuTimeMs: undefined,
          qualityPreset: undefined,
          worldTime: undefined,
        })

      let liveSnapshot: UiQaSnapshot = {
        debugOverlay: debugOverlayAt(FIRST_QA_WORLD_X),
      }
      const moduleInstance = createUiModuleInstance(uiModule.frameStages, () => liveSnapshot)
      const instanceNamespace = moduleInstance.qa
      expect(instanceNamespace).toBeDefined()
      if (instanceNamespace === undefined) {
        return
      }

      const firstState = yield* instanceNamespace.observe.state.run({})
      expect(firstState.debugOverlay?.coordinates).toStrictEqual({
        worldX: FIRST_QA_WORLD_X,
        worldY: QA_WORLD_Y,
        worldZ: QA_WORLD_Z,
      })

      liveSnapshot = {
        ...liveSnapshot,
        debugOverlay: debugOverlayAt(SECOND_QA_WORLD_X),
      }
      const updatedState = yield* instanceNamespace.observe.state.run({})
      expect(updatedState.debugOverlay?.coordinates).toStrictEqual({
        worldX: SECOND_QA_WORLD_X,
        worldY: QA_WORLD_Y,
        worldZ: QA_WORLD_Z,
      })
    }),
  )

  // `RRegister` defaults to `never`, which is what lets this repository keep
  // writing three parameters. When these stages start acquiring mc-sim's
  // services they acquire them HERE — in `frameStages` — and the fourth
  // parameter appears; `RIn` stays `never`, because this repository builds
  // nothing mc-sim has to supply.
  it.effect('needs nothing to register today, and says so in the type', () =>
    Effect.gen(function* () {
      const noRequirement: Effect.Effect<unknown, never, never> = uiModule.frameStages
      expect(yield* noRequirement).toBeDefined()
    }),
  )
})
