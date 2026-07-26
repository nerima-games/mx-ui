/**
 * Named regression tests for the frame contract.
 *
 * mx-ui is where §2.3-1 is hardest to hold, because almost every UI element
 * displays the result of some rule that lives in another experience module. The
 * discipline is that mx-ui reads mc-sim and nothing else — see the note in
 * `../stages/stage-ids.ts`.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { DeltaTimeSecs, StageId, type StageRegistration } from '../domain/frame-contract'
import { CAPTION_LIFETIME_SECS, receiveCaption } from '../domain/caption'
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import {
  DEFAULT_CAPTION_SETTINGS,
  makeUiFrameState,
  makeUiStages,
  uiStages,
} from '../stages/registration'
import {
  EXPERIENCE_MODULE_STAGE_PREFIXES,
  OWN_STAGE_PREFIX,
  UI_STAGE_IDS,
  UPSTREAM_STAGE_IDS,
} from '../stages/stage-ids'

const allAfterEdges = (stages: ReadonlyArray<StageRegistration>): ReadonlyArray<string> =>
  stages.flatMap((stage) => [...(stage.after ?? [])])

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

describe('stage behaviour', () => {
  it.effect('hud-sync rebuilds the view model from the snapshot it was given', () =>
    Effect.gen(function* () {
      const state = yield* makeUiFrameState
      const hudSync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.hudSync)

      yield* Ref.set(state.snapshot, { ...spawnSnapshot, healthPoints: 1 })
      yield* hudSync?.run(DeltaTimeSecs(0.016)) ?? Effect.void

      const model = yield* Ref.get(state.hud)
      expect(model.hearts[0]).toBe('half')
      expect(model.dead).toBe(false)
    }),
  )

  it.effect('REGRESSION: caption ageing is driven by accumulated `dt`, never by a wall clock', () =>
    Effect.gen(function* () {
      // plan.md §4.3 bans `Date.now()` outright and `pnpm check:deps` enforces
      // it. The practical benefit is right here: three seconds of caption
      // lifetime pass in a handful of microseconds.
      const state = yield* makeUiFrameState
      const overlaySync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.overlaySync)

      yield* Ref.update(state.captions, (queue) =>
        receiveCaption(
          queue,
          { cueId: 'creeper.primed', text: 'Creeper hisses', direction: 'left', atSecs: 0 },
          DEFAULT_CAPTION_SETTINGS,
        ),
      )
      expect((yield* Ref.get(state.captions)).visible).toHaveLength(1)

      yield* overlaySync?.run(DeltaTimeSecs(CAPTION_LIFETIME_SECS / 2)) ?? Effect.void
      expect((yield* Ref.get(state.captions)).visible).toHaveLength(1)

      yield* overlaySync?.run(DeltaTimeSecs(CAPTION_LIFETIME_SECS / 2)) ?? Effect.void
      expect((yield* Ref.get(state.captions)).visible).toHaveLength(0)
    }),
  )

  it.effect('REGRESSION: the default caption settings have audio LOCKED, and captions still work', () =>
    Effect.sync(() => {
      // The first frame happens before the browser's autoplay gate is
      // satisfied. That must not be the frame on which captions are lost.
      expect(DEFAULT_CAPTION_SETTINGS.audioUnlocked).toBe(false)
      expect(DEFAULT_CAPTION_SETTINGS.captionsEnabled).toBe(true)
    }),
  )

  it.effect('every stage tolerates dt = 0', () =>
    Effect.gen(function* () {
      const state = yield* makeUiFrameState
      yield* Effect.forEach(uiStages(state), (stage) => stage.run(DeltaTimeSecs(0)))
      expect(yield* Ref.get(state.elapsedSecs)).toBe(0)
      expect(yield* Ref.get(state.hud)).toStrictEqual(hudViewModel(spawnSnapshot))
    }),
  )

  it.effect('each call to makeUiFrameState yields independent state (re-entrant initialisation)', () =>
    Effect.gen(function* () {
      // Each per-screen preview (plan.md §3.13) boots its own state in the same
      // page. Sharing one would make the inventory preview's mock leak into the
      // settings preview.
      const first = yield* makeUiFrameState
      const second = yield* makeUiFrameState

      yield* Ref.set(first.snapshot, { ...spawnSnapshot, healthPoints: 3 })

      expect((yield* Ref.get(first.snapshot)).healthPoints).toBe(3)
      expect((yield* Ref.get(second.snapshot)).healthPoints).toBe(spawnSnapshot.healthPoints)
    }),
  )
})

describe('the mirrored DeltaTimeSecs brand is kernel’s', () => {
  /*
   * REGRESSION. `domain/frame-contract.ts` restates kernel's `DeltaTimeSecs`
   * (`mc-kernel/domain/quantities.ts:37-42`), and a brand is keyed by its
   * STRING: `Brand.Brand<'DeltaTimeSecs'>` here and in kernel are ONE TYPE to
   * TypeScript, however differently the two constructors validate. So a mirror
   * that refined differently would be a false guarantee the compiler could
   * never contradict — which is exactly what mc-physics had, refining to the
   * frame-loop clamp [0.001, 0.05] while kernel refines to "finite and
   * non-negative". A kernel-built `DeltaTimeSecs(30)` satisfied its parameter
   * types while breaking the invariant its comments claimed.
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
