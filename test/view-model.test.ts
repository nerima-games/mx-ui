/**
 * Pure view-model / state-derivation tests.
 *
 * No DOM anywhere, which is why these run under `environment: 'node'` and why
 * they are fast enough to be worth running on every save. plan.md §3.13's
 * DOM-flow tests come later and have their own rules — see docs/testing.md.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  CAPTION_LIFETIME_SECS,
  captionLines,
  emptyCaptionQueue,
  expireCaptions,
  MAX_VISIBLE_CAPTIONS,
  receiveCaption,
  type CaptionEvent,
  type CaptionSettings,
} from '../domain/caption'
import {
  DEFAULT_MAX_HEALTH_POINTS,
  HOTBAR_SLOT_COUNT,
  hudViewModel,
  iconRow,
  spawnSnapshot,
  type VitalsSnapshot,
} from '../domain/hud-view-model'

const withVitals = (overrides: Partial<VitalsSnapshot>): VitalsSnapshot => ({
  ...spawnSnapshot,
  ...overrides,
})

describe('hearts and hunger shanks', () => {
  it.effect('full health is ten full hearts', () =>
    Effect.sync(() => {
      expect(iconRow(20, 20).filter((icon) => icon === 'full')).toHaveLength(10)
      expect(iconRow(20, 20)).toHaveLength(10)
    }),
  )

  it.effect('REGRESSION: an odd health total shows a HALF heart rather than rounding it away', () =>
    Effect.sync(() => {
      // A player on one health point must see half a heart. Rounding down shows
      // them an empty row and rounding up shows them a full one; both are lies
      // at the exact moment the truth matters most.
      expect(iconRow(19, 20)).toStrictEqual([
        'full', 'full', 'full', 'full', 'full', 'full', 'full', 'full', 'full', 'half',
      ])
      expect(iconRow(1, 20)).toStrictEqual([
        'half', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty',
      ])
    }),
  )

  it.effect('zero health is ten empty hearts, not an empty array', () =>
    Effect.sync(() => {
      expect(iconRow(0, 20)).toHaveLength(10)
      expect(iconRow(0, 20).every((icon) => icon === 'empty')).toBe(true)
    }),
  )

  it.effect('a snapshot from across a version boundary is clamped rather than trusted', () =>
    Effect.sync(() => {
      // A HUD that throws is worse than a HUD that is briefly wrong.
      expect(iconRow(999, 20).every((icon) => icon === 'full')).toBe(true)
      expect(iconRow(-5, 20).every((icon) => icon === 'empty')).toBe(true)
      expect(iconRow(7.9, 20).filter((icon) => icon === 'full')).toHaveLength(3)
    }),
  )

  it.effect('an odd maximum still gets a row long enough to hold it', () =>
    Effect.sync(() => {
      expect(iconRow(5, 5)).toStrictEqual(['full', 'full', 'half'])
    }),
  )
})

describe('hotbar projection', () => {
  it.effect(`the view model always has exactly ${String(HOTBAR_SLOT_COUNT)} slots, however short the snapshot`, () =>
    Effect.sync(() => {
      expect(hudViewModel(withVitals({ hotbar: [] })).hotbar).toHaveLength(HOTBAR_SLOT_COUNT)
      expect(
        hudViewModel(withVitals({ hotbar: [{ itemId: 'STONE', count: 3, durability: undefined }] }))
          .hotbar,
      ).toHaveLength(HOTBAR_SLOT_COUNT)
    }),
  )

  it.effect('REGRESSION: an out-of-range selected index is clamped, so the HUD never loses its selection', () =>
    Effect.sync(() => {
      // A wrapping scroll wheel, an old save, a QA API call — all deliver 9 or
      // -1 sooner or later, and none of them should blank the hotbar.
      const high = hudViewModel(withVitals({ selectedHotbarIndex: 99 }))
      const low = hudViewModel(withVitals({ selectedHotbarIndex: -3 }))

      expect(high.hotbar.filter((slot) => slot.selected)).toHaveLength(1)
      expect(high.hotbar[HOTBAR_SLOT_COUNT - 1]?.selected).toBe(true)
      expect(low.hotbar[0]?.selected).toBe(true)
    }),
  )

  it.effect('a stack of one shows no count label, as in vanilla', () =>
    Effect.sync(() => {
      const model = hudViewModel(
        withVitals({
          hotbar: [
            { itemId: 'DIAMOND_PICKAXE', count: 1, durability: 0.5 },
            { itemId: 'COBBLESTONE', count: 64, durability: undefined },
          ],
        }),
      )

      expect(model.hotbar[0]?.countLabel).toBeUndefined()
      expect(model.hotbar[0]?.durabilityPercent).toBe(50)
      expect(model.hotbar[1]?.countLabel).toBe('64')
      expect(model.hotbar[1]?.durabilityPercent).toBeUndefined()
    }),
  )

  it.effect('a slot holding zero of something is empty, not a zero-count item', () =>
    Effect.sync(() => {
      const model = hudViewModel(
        withVitals({ hotbar: [{ itemId: 'STONE', count: 0, durability: undefined }] }),
      )
      expect(model.hotbar[0]?.empty).toBe(true)
      expect(model.hotbar[0]?.itemId).toBeUndefined()
    }),
  )
})

describe('experience and death', () => {
  it.effect('experience progress becomes a clamped whole percentage', () =>
    Effect.sync(() => {
      expect(hudViewModel(withVitals({ experienceProgress: 0.333 })).experiencePercent).toBe(33)
      expect(hudViewModel(withVitals({ experienceProgress: 1.5 })).experiencePercent).toBe(100)
      expect(hudViewModel(withVitals({ experienceProgress: -1 })).experiencePercent).toBe(0)
    }),
  )

  it.effect('the model reports death, so the death screen is driven by the same derivation as the HUD', () =>
    Effect.sync(() => {
      expect(hudViewModel(withVitals({ healthPoints: 0 })).dead).toBe(true)
      expect(hudViewModel(withVitals({ healthPoints: 1 })).dead).toBe(false)
      expect(hudViewModel(spawnSnapshot).dead).toBe(false)
    }),
  )

  it.effect('a spawn snapshot renders as a full, empty-handed HUD', () =>
    Effect.sync(() => {
      const model = hudViewModel(spawnSnapshot)
      expect(model.hearts.every((icon) => icon === 'full')).toBe(true)
      expect(model.shanks).toHaveLength(DEFAULT_MAX_HEALTH_POINTS / 2)
      expect(model.hotbar.every((slot) => slot.empty)).toBe(true)
      expect(model.experienceLevelLabel).toBe('0')
    }),
  )
})

describe('captions fire before the audio gate', () => {
  const event = (cueId: string, atSecs: number): CaptionEvent => ({
    cueId,
    text: cueId,
    direction: undefined,
    atSecs,
  })

  const settings = (overrides: Partial<CaptionSettings> = {}): CaptionSettings => ({
    captionsEnabled: true,
    audioUnlocked: true,
    ...overrides,
  })

  it.effect('REGRESSION: a caption is shown even when the browser has not unlocked audio', () =>
    Effect.sync(() => {
      // plan.md §3.6: 「音が出せない状態でも字幕は出る」. Gating captions on the
      // autoplay unlock means a deaf player sees nothing until they happen to
      // click, and nothing at all if they play muted.
      const locked = receiveCaption(emptyCaptionQueue, event('creeper.primed', 0), settings({ audioUnlocked: false }))
      const unlocked = receiveCaption(emptyCaptionQueue, event('creeper.primed', 0), settings({ audioUnlocked: true }))

      expect(locked.visible).toHaveLength(1)
      // Identical output: `audioUnlocked` is present in the settings type and is
      // deliberately not consulted.
      expect(locked).toStrictEqual(unlocked)
    }),
  )

  it.effect('the player turning captions off DOES suppress them, because that is an explicit choice', () =>
    Effect.sync(() => {
      const queue = receiveCaption(emptyCaptionQueue, event('creeper.primed', 0), settings({ captionsEnabled: false }))
      expect(queue).toBe(emptyCaptionQueue)
    }),
  )

  it.effect('REGRESSION: repeating a cue refreshes it instead of stacking duplicates', () =>
    Effect.sync(() => {
      // Eight footsteps in a second are one fact, not eight lines of text.
      let queue = emptyCaptionQueue
      for (let step = 0; step < 8; step += 1) {
        queue = receiveCaption(queue, event('player.step', step * 0.1), settings())
      }
      expect(queue.visible).toHaveLength(1)
      expect(queue.visible[0]?.atSecs).toBeCloseTo(0.7, 10)
    }),
  )

  it.effect(`at most ${String(MAX_VISIBLE_CAPTIONS)} captions are visible, newest first`, () =>
    Effect.sync(() => {
      let queue = emptyCaptionQueue
      for (const cue of ['a', 'b', 'c', 'd', 'e', 'f']) {
        queue = receiveCaption(queue, event(cue, 0), settings())
      }
      expect(queue.visible.map((caption) => caption.cueId)).toStrictEqual(['f', 'e', 'd', 'c'])
    }),
  )

  it.effect('REGRESSION: expiry takes the time as an argument — nothing here reads a clock', () =>
    Effect.sync(() => {
      // `Date.now()` is banned repository-wide and enforced by `pnpm check:deps`
      // (plan.md §4.3). Passing the instant in is also what lets a scenario test
      // fast-forward three seconds without waiting three seconds.
      const queue = receiveCaption(emptyCaptionQueue, event('creeper.primed', 10), settings())

      expect(expireCaptions(queue, 10 + CAPTION_LIFETIME_SECS - 0.01).visible).toHaveLength(1)
      expect(expireCaptions(queue, 10 + CAPTION_LIFETIME_SECS).visible).toHaveLength(0)
      // Unchanged queues are returned by identity, so a still frame allocates
      // nothing.
      expect(expireCaptions(queue, 10)).toBe(queue)
    }),
  )

  it.effect('caption lines carry a directional arrow and a freshness that fades to zero', () =>
    Effect.sync(() => {
      const queue = receiveCaption(
        emptyCaptionQueue,
        { cueId: 'creeper.primed', text: 'Creeper hisses', direction: 'left', atSecs: 0 },
        settings(),
      )

      expect(captionLines(queue, 0)).toStrictEqual([
        { text: 'Creeper hisses', arrow: '←', freshness: 1 },
      ])
      expect(captionLines(queue, CAPTION_LIFETIME_SECS)[0]?.freshness).toBe(0)
      expect(captionLines(queue, CAPTION_LIFETIME_SECS / 2)[0]?.freshness).toBeCloseTo(0.5, 10)
    }),
  )

  it.effect('a zero lifetime yields zero freshness instead of dividing by zero', () =>
    Effect.sync(() => {
      // Reachable from the settings screen: a "caption duration" slider at its
      // minimum. `Infinity` freshness would render as a permanently opaque
      // caption that never goes away.
      const queue = receiveCaption(emptyCaptionQueue, event('creeper.primed', 0), settings())
      expect(captionLines(queue, 0, 0)[0]?.freshness).toBe(0)
    }),
  )

  it.effect('a non-positional sound gets no arrow', () =>
    Effect.sync(() => {
      const queue = receiveCaption(emptyCaptionQueue, event('music.calm', 0), settings())
      expect(captionLines(queue, 0)[0]?.arrow).toBeUndefined()
    }),
  )
})
