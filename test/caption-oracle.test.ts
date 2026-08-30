/**
 * Sound captions, against the reference's oracle.
 *
 * Ported from `<reference-impl>/packages/presentation/test/sound-captions.test.ts`
 * (9 tests). `docs/dom-oracle-triage.md` records the per-claim verdicts; this
 * file holds the ones that survive, and the reason the surviving set is small is
 * that most of the reference's caption claims were ALREADY held by
 * `test/view-model.test.ts` and `test/screen-views.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * The one that was not held, and it was a defect
 * ---------------------------------------------------------------------------
 *
 * `sound-captions.test.ts:124` — 「clears all rows when captions are turned
 * off」. mx-ui had no operation that could do this. `receiveCaption` gates
 * ADMISSION, so it answers 「a caption arrives while captions are off」 and is
 * structurally unable to answer 「captions are turned off while captions are on
 * screen」 — which is the case a player produces, because the reason anybody
 * opens settings and switches captions off is that captions are in the way at
 * that moment.
 *
 * **And the existing test looked like it covered this.**
 * `test/view-model.test.ts` 「the player turning captions off DOES suppress
 * them」 passes `emptyCaptionQueue`, so the only queue it ever observes is one
 * with nothing to clear. That test is correct and is not touched here; it simply
 * asks a narrower question than its name suggests. The fix is
 * `applyCaptionSettings` plus its call in `ui:overlay-sync`.
 *
 * Plain `it`, not `it.effect`, per DN-UI-2 and `docs/testing.md` §3 — this file
 * drives a DOM view. The stage assertions run through `Effect.runPromise` for
 * the same reason.
 */
import { Effect, Ref } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  applyCaptionSettings,
  captionLines,
  emptyCaptionQueue,
  expireCaptions,
  MAX_VISIBLE_CAPTIONS,
  receiveCaption,
  type CaptionEvent,
  type CaptionQueue,
  type CaptionSettings,
} from '../src/domain/caption'
import { createCaptionView } from '../src/application/caption-view'
import { DeltaTimeSecs } from '@nerima-games/mc-kernel'
import { makeUiFrameState, uiStages } from '../src/stages/registration'
import { UI_STAGE_IDS } from '../src/stages/stage-ids'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'
import { FrameServicesLayer } from './frame-services'

const ON: CaptionSettings = { captionsEnabled: true, audioUnlocked: false }
const OFF: CaptionSettings = { captionsEnabled: false, audioUnlocked: false }

const event = (cueId: string, atSecs: number): CaptionEvent => ({
  cueId,
  text: cueId,
  direction: undefined,
  atSecs,
})

/** A queue holding `count` distinct live captions, all raised at `atSecs`. */
const queueOf = (count: number, atSecs = 0): CaptionQueue => {
  let queue = emptyCaptionQueue
  for (let index = 0; index < count; index += 1) {
    queue = receiveCaption(queue, event(`cue-${String(index)}`, atSecs), ON)
  }
  return queue
}

const mount = () => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement
  const view = createCaptionView(factory, parent, 'reduced')
  return { factory, view, root: view.root as FakeElement }
}

/** The text of every caption line the reader would actually be given. */
const visibleText = (root: FakeElement): ReadonlyArray<string> =>
  root
    .findAll('data-mx-ui', 'caption-line')
    .filter((line) => !line.attributes.has('hidden'))
    .map((line) => line.find('data-mx-ui', 'caption-text')?.textContent ?? '')

describe('turning captions off takes down the captions that are already up', () => {
  it('REGRESSION: a live queue is cleared by the setting, not merely closed to new arrivals', () => {
    // `<reference-impl>/packages/presentation/test/sound-captions.test.ts:124`.
    // The reference clears its active rows inside `setSoundCaptionsEnabled`;
    // here the queue is a value, so the clearing is a function on it.
    const live = queueOf(3)
    expect(live.visible).toHaveLength(3)

    expect(applyCaptionSettings(live, OFF)).toBe(emptyCaptionQueue)
  })

  it('REGRESSION: an ENABLED setting returns the queue by identity, so a still frame allocates nothing', () => {
    // Same discipline as `expireCaptions`: this runs every frame.
    const live = queueOf(2)
    expect(applyCaptionSettings(live, ON)).toBe(live)
    // And an already-empty queue is not replaced with a different empty one.
    expect(applyCaptionSettings(emptyCaptionQueue, OFF)).toBe(emptyCaptionQueue)
  })

  it('REGRESSION: expiry alone could NOT have done this, which is why admission-gating was not enough', () => {
    // The heart of the defect. `expireCaptions` drains on `nowSecs`, so at the
    // instant the player flips the switch every caption is still inside its
    // lifetime and every one of them stays on screen. If the frame is not
    // advancing — `dt` of zero — they stay up with no bound at all.
    const live = queueOf(4, 100)

    expect(expireCaptions(live, 100).visible).toHaveLength(4)
    // A whole lifetime later they would have gone anyway; the complaint is
    // about the seconds in between, which is all the player is looking at.
    expect(applyCaptionSettings(live, OFF).visible).toHaveLength(0)
  })

  it('REGRESSION: ui:overlay-sync enforces the setting, so the fix is reachable from a frame', () => {
    // A domain function nobody calls would leave the defect exactly where it
    // was. This drives the real stage.
    const program = Effect.gen(function* () {
      const state = yield* makeUiFrameState
      const overlaySync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.overlaySync)

      yield* Ref.set(state.captions, queueOf(3, 0))
      yield* Ref.set(state.captionSettings, OFF)
      yield* overlaySync?.run(DeltaTimeSecs(0.016)) ?? Effect.void

      return yield* Ref.get(state.captions)
    })

    // `FrameServicesLayer` is what `program` runs a stage AGAINST; see
    // `./frame-services.ts`. Empty today, and not removable.
    return Effect.runPromise(program.pipe(Effect.provide(FrameServicesLayer))).then((queue) => {
      expect(queue.visible).toHaveLength(0)
    })
  })

  it('REGRESSION: the frame leaves a live queue ALONE while captions are on', () => {
    // The other half, and the one that would catch a fix written as
    // "clear the captions every frame".
    const program = Effect.gen(function* () {
      const state = yield* makeUiFrameState
      const overlaySync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.overlaySync)

      yield* Ref.set(state.captions, queueOf(3, 0))
      yield* Ref.set(state.captionSettings, ON)
      yield* overlaySync?.run(DeltaTimeSecs(0.016)) ?? Effect.void

      return yield* Ref.get(state.captions)
    })

    return Effect.runPromise(program.pipe(Effect.provide(FrameServicesLayer))).then((queue) => {
      expect(queue.visible).toHaveLength(3)
    })
  })

  it('REGRESSION: the cleared queue reaches the DOM as empty lines, not as stale text', () => {
    // The reference's assertion is `rows.every((row) => row.removed)`. mx-ui has
    // no `removeChild` (`application/dom-surface.ts`), so 「gone」 is the `hidden`
    // attribute and the observable claim is that no line still carries words.
    const { view, root } = mount()
    view.render(captionLines(queueOf(3), 0))
    expect(visibleText(root)).toHaveLength(3)
    // NAMED AND IN ORDER, not merely counted. `view-model.test.ts` pins that
    // the QUEUE is newest-first; nothing pinned that `captionLines` carries
    // that order through to the reader. A projection that reversed it would
    // leave a correct queue and a screen listing the oldest caption first, and
    // a length is blind to the whole of that. `queueOf` raises cue-0 first, so
    // newest-first is the descending sequence.
    expect(visibleText(root)).toStrictEqual(['cue-2', 'cue-1', 'cue-0'])

    view.render(captionLines(applyCaptionSettings(queueOf(3), OFF), 0))
    expect(visibleText(root)).toStrictEqual([])
  })
})

describe('the caption cap and the reference’s, which are different numbers on purpose', () => {
  it('holds at most MAX_VISIBLE_CAPTIONS, and the DOM allocates exactly that many lines', () => {
    // `sound-captions.test.ts:113` 「evicts the oldest row beyond the cap」 caps
    // at 5 by evicting after the fact; mx-ui caps at 4 by construction, so
    // there is never a row to evict. The DOM consequence is the one worth
    // pinning: the line elements are allocated ONCE at the bound, so a caption
    // storm during combat allocates nothing.
    const { factory, view, root } = mount()
    const overfull = queueOf(MAX_VISIBLE_CAPTIONS + 3)

    expect(overfull.visible).toHaveLength(MAX_VISIBLE_CAPTIONS)
    expect(root.findAll('data-mx-ui', 'caption-line')).toHaveLength(MAX_VISIBLE_CAPTIONS)

    view.render(captionLines(overfull, 0))
    const before = factory.mark()
    view.render(captionLines(overfull, 0))
    // Re-rendering the same lines writes nothing — `writeNames` because a raw
    // `Mutation[]` is cyclic and deep-equalling it on failure kills the runner.
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})
