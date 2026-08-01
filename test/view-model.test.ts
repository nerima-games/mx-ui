/**
 * Pure view-model / state-derivation tests.
 *
 * No DOM anywhere, which is why these run under `environment: 'node'` and why
 * they are fast enough to be worth running on every save. plan.md §3.13's
 * DOM-flow tests come later and have their own rules — see docs/testing.md.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as ui from '../src/index'
import {
  applyColorVisionMatrix,
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_MODES,
  colorVisionAttribute,
  colorVisionMatrix,
  colorVisionMatrixValues,
} from '../src/domain/accessibility'
import {
  CAPTION_LIFETIME_SECS,
  captionLines,
  emptyCaptionQueue,
  expireCaptions,
  MAX_VISIBLE_CAPTIONS,
  receiveCaption,
  type CaptionEvent,
  type CaptionSettings,
} from '../src/domain/caption'
import {
  DEFAULT_MAX_HEALTH_POINTS,
  HOTBAR_SLOT_COUNT,
  hudViewModel,
  iconRow,
  spawnSnapshot,
  type VitalsSnapshot,
} from '../src/domain/hud-view-model'
import {
  emptyInventorySnapshot,
  INVENTORY_MAIN_COLUMNS,
  INVENTORY_MAIN_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  inventoryViewModel,
  regionOf,
  type InventorySnapshot,
  type MirroredInventory,
} from '../src/domain/inventory-view-model'
import {
  COLLAPSE_SEPARATION,
  compositeOver,
  cssColor,
  hex,
  HEART,
  KNOWN_NEAR_COLLISIONS,
  relativeLuminance,
  SCRIM,
  SCRIM_ALPHA,
  separation,
  simulateColorVision,
  STATUS_ALERT,
  STATUS_BUSY,
  STATUS_OK,
  surveyPalette,
  TEXT_CONTRAST_MIN,
  UI_CONTRAST_MIN,
  type Rgb,
} from '../src/domain/palette'

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

  it.effect('REGRESSION: NaN is clamped like any other bad value — Math.min/Math.max pass it through', () =>
    Effect.sync(() => {
      // Found by `pnpm preview --stats` (F2). DN-UI-7 clamps because
      // `VitalsSnapshot` crosses a pinned version boundary from mc-sim, and NaN
      // is exactly that class of input: a divide by a zero maximum, a field
      // that changed meaning, a save read with the wrong shape. The old clamp
      // was `Math.min(Math.max(v, low), high)`, and every comparison against
      // NaN is false, so NaN came out the other side unchanged.
      expect(iconRow(Number.NaN, 20)).toHaveLength(10)
      expect(iconRow(Number.NaN, 20).every((icon) => icon === 'empty')).toBe(true)
    }),
  )

  it.effect('REGRESSION: a non-finite maximum yields no icons rather than throwing', () =>
    Effect.sync(() => {
      // `Math.ceil(Infinity / 2)` is Infinity and `Array.from({ length:
      // Infinity })` throws RangeError — the one outcome DN-UI-7 forbids
      // outright ("a HUD that throws is worse than a HUD that is briefly
      // wrong"). Zero icons is the only count that is not invented for a
      // maximum that is not a number.
      expect(() => iconRow(10, Number.POSITIVE_INFINITY)).not.toThrow()
      expect(iconRow(10, Number.POSITIVE_INFINITY)).toStrictEqual([])
      expect(iconRow(10, Number.NaN)).toStrictEqual([])
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

  it.effect('REGRESSION: an empty slot reports NO durability — every field goes, not just the obvious two', () =>
    Effect.sync(() => {
      // Found by `pnpm preview --stats` (F1). Reachable in play: a tool that
      // breaks leaves count 0 behind with a durability still attached. The
      // `empty` guard used to clear `itemId` and `countLabel` and not
      // `durabilityPercent`, and a DOM layer that draws the bar when the field
      // is present — the obvious way to write it — draws a durability bar
      // under an empty slot.
      const model = hudViewModel(
        withVitals({ hotbar: [{ itemId: undefined, count: 0, durability: 0.5 }] }),
      )

      expect(model.hotbar[0]).toStrictEqual({
        index: 0,
        itemId: undefined,
        countLabel: undefined,
        durabilityPercent: undefined,
        selected: true,
        empty: true,
      })

      // A broken tool: the item is still named but there are none left.
      const broken = hudViewModel(
        withVitals({ hotbar: [{ itemId: 'DIAMOND_PICKAXE', count: 0, durability: 0 }] }),
      )
      expect(broken.hotbar[0]?.empty).toBe(true)
      expect(broken.hotbar[0]?.durabilityPercent).toBeUndefined()
    }),
  )

  it.effect('REGRESSION: a NaN selected index still selects a slot, exactly as 9 and -1 do', () =>
    Effect.sync(() => {
      // Found by `pnpm preview --stats` (F3): the same NaN hole as the heart
      // row, one field along. The clamp exists so that a wrapping scroll wheel
      // "should not make the HUD disappear" (DN-UI-7), and NaN went straight
      // through it, leaving no slot highlighted at all. NaN gets the low bound
      // for the same reason -1 does: some slot must be lit, and slot 0 is the
      // one the player starts on.
      const model = hudViewModel(withVitals({ selectedHotbarIndex: Number.NaN }))

      expect(model.hotbar.filter((slot) => slot.selected)).toHaveLength(1)
      expect(model.hotbar[0]?.selected).toBe(true)
    }),
  )

  it.effect('REGRESSION: a NaN count is not drawn as the text "NaN"', () =>
    Effect.sync(() => {
      // `String(Math.max(0, Math.floor(NaN)))` is the string "NaN", and the DOM
      // layer would faithfully draw it on top of the slot. Same clamp, same
      // boundary, same rule.
      const model = hudViewModel(
        withVitals({ hotbar: [{ itemId: 'STONE', count: Number.NaN, durability: Number.NaN }] }),
      )

      expect(model.hotbar[0]?.countLabel).toBeUndefined()
      expect(model.hotbar[0]?.empty).toBe(true)
      expect(model.hotbar[0]?.durabilityPercent).toBeUndefined()
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

  it.effect('REGRESSION: the XP bar does not read 100% one level early', () =>
    Effect.sync(() => {
      // Found by `pnpm preview --stats` (F4). `Math.round(0.999 * 100)` is 100,
      // so the bar filled while the level label beside it still said 7 — a
      // contradiction the player can see, which reads as a HUD stuck at full
      // for the last fraction of every level. Floor never claims a threshold
      // that has not been crossed.
      const nearly = hudViewModel(withVitals({ experienceLevel: 7, experienceProgress: 0.999 }))
      expect(nearly.experiencePercent).toBe(99)
      expect(nearly.experienceLevelLabel).toBe('7')

      // 1.0 is the ONLY input that reaches 100, which is the whole point.
      expect(hudViewModel(withVitals({ experienceProgress: 1 })).experiencePercent).toBe(100)
      expect(hudViewModel(withVitals({ experienceProgress: 0.9999 })).experiencePercent).toBe(99)
    }),
  )

  it.effect('REGRESSION: NaN health makes the heart row and the `dead` flag agree', () =>
    Effect.sync(() => {
      // Found by `pnpm preview --stats` (F2). The row said "no health" and the
      // flag said "alive" — two answers to one question about one snapshot,
      // because `dead` was a separate expression and `NaN <= 0` is false. Both
      // now read the same clamped number, so they cannot diverge again.
      //
      // The clamp sends NaN to the LOW bound rather than the high one for the
      // same reason DN-UI-6 refuses to round a half heart up: showing a fuller
      // row than the snapshot claims is the lie that matters. The visible
      // consequence — a death screen on a garbage frame — is reportable; a
      // silently full heart row is not.
      const model = hudViewModel(withVitals({ healthPoints: Number.NaN }))

      expect(model.hearts.every((icon) => icon === 'empty')).toBe(true)
      expect(model.dead).toBe(true)

      // Still not clamped rather than rejected: nothing throws, whatever arrives.
      expect(() =>
        hudViewModel(
          withVitals({
            healthPoints: Number.NaN,
            maxHealthPoints: Number.NaN,
            hungerPoints: Number.POSITIVE_INFINITY,
            maxHungerPoints: Number.POSITIVE_INFINITY,
            experienceLevel: Number.NaN,
            experienceProgress: Number.NaN,
            selectedHotbarIndex: Number.NaN,
          }),
        ),
      ).not.toThrow()
    }),
  )

  it.effect('REGRESSION: a NaN experience level is not drawn as the text "NaN"', () =>
    Effect.sync(() => {
      expect(hudViewModel(withVitals({ experienceLevel: Number.NaN })).experienceLevelLabel).toBe('0')
      expect(hudViewModel(withVitals({ experienceProgress: Number.NaN })).experiencePercent).toBe(0)
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

/**
 * The daltonisation correction — the OTHER half of plan.md §3.13's colour
 * vision asset.
 *
 * The switch (`colorVisionAttribute`, `COLOR_VISION_FILTER_TARGET`) was carried
 * over first and the matrices were not, which left a hook with nothing behind
 * it: `data-color-vision="protanopia"` on `<body>` and no filter for the CSS to
 * point at. `pnpm preview --stats` reported that as F5. The matrices are now
 * here, transcribed from the reference's `index.html:445-460`, and these tests
 * are what makes a transcription error loud instead of invisible.
 */
describe('colour vision correction (the feColorMatrix matrices themselves)', () => {
  /**
   * Byte-for-byte from `takeokunn/ts-minecraft` `index.html:451-459`, with the
   * row-separating double spaces left in so the comparison below is against the
   * source text rather than against a re-typing of it.
   */
  const REFERENCE_VALUES = new Map<string, string>([
    ['protanopia', '1 0 0 0 0  -0.2549 1.2549 0 0 0  0.3031 -0.5451 1.242 0 0  0 0 0 1 0'],
    ['deuteranopia', '1 0 0 0 0  -0.4375 1.4375 0 0 0  0.2625 -0.5625 1.3 0 0  0 0 0 1 0'],
    ['tritanopia', '1 0 0 0 0  0.035 1.532 -0.567 0 0  0.035 -0.51 1.475 0 0  0 0 0 1 0'],
  ])

  it.effect('REGRESSION: every mode that sets the attribute also has a matrix, and `off` has neither', () =>
    Effect.sync(() => {
      // The two halves have to agree on `off` or the DOM layer removes the
      // attribute and leaves a filter installed, or the reverse.
      for (const mode of COLOR_VISION_MODES) {
        expect(colorVisionMatrix(mode) === undefined).toBe(colorVisionAttribute(mode) === undefined)
      }
      expect(colorVisionMatrix('off')).toBeUndefined()
      expect(colorVisionMatrixValues('off')).toBeUndefined()
    }),
  )

  it.effect('the matrices are the reference’s, number for number', () =>
    Effect.sync(() => {
      for (const [mode, values] of REFERENCE_VALUES) {
        expect(colorVisionMatrixValues(mode as never)).toBe(values.split(/\s+/u).join(' '))
      }
    }),
  )

  it.effect('REGRESSION: every row sums to 1, so greys and whites pass through unchanged', () =>
    Effect.sync(() => {
      // The reference states this invariant in `index.html:445-447`. It is what
      // keeps a correction from tinting the whole scene, and it is exact — a
      // sign transcribed wrong breaks it immediately, which is the failure this
      // catches.
      for (const mode of COLOR_VISION_MODES) {
        const matrix = colorVisionMatrix(mode)
        if (matrix === undefined) {
          continue
        }
        for (const row of [0, 1, 2]) {
          const sum = matrix
            .slice(row * 5, row * 5 + 3)
            .reduce((total, coefficient) => total + coefficient, 0)
          expect(sum).toBeCloseTo(1, 10)
        }

        for (const grey of [0, 0.25, 0.5, 0.75, 1]) {
          const [r, g, b] = applyColorVisionMatrix([grey, grey, grey], matrix)
          expect(r).toBeCloseTo(grey, 10)
          expect(g).toBeCloseTo(grey, 10)
          expect(b).toBeCloseTo(grey, 10)
        }
      }
    }),
  )

  it.effect('the red-green corrections move red into the blue channel, which is the channel that is intact', () =>
    Effect.sync(() => {
      // This is what daltonisation IS: the information lost with the missing
      // cone is redistributed onto the ones that remain. A protanope cannot
      // separate red from green by hue, so the correction separates them by
      // blue instead. A matrix that failed this would still sum to 1 per row
      // and still be a valid filter — and would correct nothing.
      for (const mode of ['protanopia', 'deuteranopia'] as const) {
        const matrix = colorVisionMatrix(mode)
        if (matrix === undefined) {
          throw new Error(`${mode} lost its matrix`)
        }
        const red = applyColorVisionMatrix([1, 0, 0], matrix)
        const green = applyColorVisionMatrix([0, 1, 0], matrix)

        expect(red[2]).toBeGreaterThan(green[2])
        // Red keeps its red channel; the correction adds, it does not repaint.
        expect(red[0]).toBe(1)
      }
    }),
  )

  it.effect('the ALPHA and OFFSET columns are applied, though no shipped matrix uses them', () =>
    Effect.sync(() => {
      // FOUND BY A MUTATION. Deleting `+ alpha` from the row sum, and deleting
      // `+ offset`, both left the whole suite green — because all four shipped
      // matrices carry `0, 0` in those two columns, so the terms contribute
      // nothing and every existing assertion is about the 3x3 part.
      //
      // That is not a reason to drop them. `applyColorVisionMatrix` is
      // published and takes an arbitrary `ColorVisionMatrix`, and the type's own
      // header is explicit that this is a 4x5 `feColorMatrix` in the order the
      // SVG attribute wants — 「the fifth column of each row is a constant offset
      // in intensity units」. A version that quietly ignored two of the five
      // columns would agree with the browser on today's matrices and disagree
      // with it on the first one that uses an offset, which is exactly the class
      // of divergence `test/fixtures/dom-surface.ts` exists to prevent elsewhere:
      // a fake that is subtly not the real thing.
      //
      // So the columns are driven directly, one at a time, with a matrix that
      // does nothing else. A grey input keeps the arithmetic readable: each row
      // is `0 * channels + alpha + offset`.
      const identityRow = [0, 0, 0] as const

      const offsetOnly = applyColorVisionMatrix([0.5, 0.5, 0.5], [
        ...identityRow, 0, 0.25,
        ...identityRow, 0, 0,
        ...identityRow, 0, 0,
        ...identityRow, 0, 0,
      ])
      expect(offsetOnly[0]).toBeCloseTo(0.25, 10)
      expect(offsetOnly[1]).toBeCloseTo(0, 10)

      const alphaOnly = applyColorVisionMatrix([0.5, 0.5, 0.5], [
        ...identityRow, 0, 0,
        ...identityRow, 0.4, 0,
        ...identityRow, 0, 0,
        ...identityRow, 0, 0,
      ])
      expect(alphaOnly[0]).toBeCloseTo(0, 10)
      expect(alphaOnly[1]).toBeCloseTo(0.4, 10)

      // The two ADD rather than one winning, which is what `+ alpha + offset`
      // says and what a spelling that picked one of them would not.
      const both = applyColorVisionMatrix([0.5, 0.5, 0.5], [
        ...identityRow, 0, 0,
        ...identityRow, 0, 0,
        ...identityRow, 0.3, 0.2,
        ...identityRow, 0, 0,
      ])
      expect(both[2]).toBeCloseTo(0.5, 10)

      // Still clamped into 0-1: `feColorMatrix` works in intensities and a
      // channel above 1 is not a brighter colour, it is a number the browser
      // will clamp anyway and a number this repository would then disagree with.
      const overflowing = applyColorVisionMatrix([0.5, 0.5, 0.5], [
        ...identityRow, 0, 3,
        ...identityRow, 0, -3,
        ...identityRow, 0, 0,
        ...identityRow, 0, 0,
      ])
      expect(overflowing[0]).toBe(1)
      expect(overflowing[1]).toBe(0)
    }),
  )

  it.effect('REGRESSION: the filter is declared in sRGB, not the SVG default', () =>
    Effect.sync(() => {
      // `index.html:448-450`: the matrices are derived in sRGB, and SVG's
      // default of linearRGB over-brightens midtones. One attribute, and the
      // difference between a correction and a washed-out scene.
      expect(COLOR_VISION_FILTER_COLOR_SPACE).toBe('sRGB')
    }),
  )
})

/**
 * The palette (was G1).
 *
 * These replace `GAP: mx-ui defines no colours, so nothing here can be
 * contrast-checked`, which asserted the ABSENCE of a token set. The tokens now
 * exist, so the assertions are about what they guarantee — and the guarantee is
 * narrow on purpose, because the wide version ("WCAG AA on a Minecraft HUD") is
 * not honourable over a backdrop the renderer chooses.
 *
 * Everything below reads ONE derivation, `surveyPalette()`, which is the same
 * one `pnpm preview --stats` prints. A second copy of this arithmetic in the
 * preview is how the report and the tests would eventually disagree.
 */
describe('the palette keeps its guarantee', () => {
  it.effect('a channel that is not a number becomes 0 rather than the string "NaN" in a CSS colour', () =>
    Effect.sync(() => {
      // `hex` and `cssColor` write straight into a `style` property, and CSS has
      // no error channel: `#NaN0000` is not a parse failure the player sees, it
      // is a declaration the browser DROPS, so the element keeps whatever colour
      // it had before. A heart that silently stays the colour of the token
      // above it is a worse failure than a heart that is black, because nothing
      // anywhere reports it.
      //
      // The direction is 0 and not 255 for the reason `hud-view-model.ts` gives
      // about clamping to `low`: 0 is the only replacement that does not INVENT
      // a brightness the caller never asked for.
      expect(hex([Number.NaN, 0, 0])).toBe('#000000')
      expect(hex([0, Number.NaN, Number.NaN])).toBe('#000000')
      // …and a finite channel is unaffected, so this is a guard and not a
      // formatter that lost its arguments.
      expect(hex([255, 128, 0])).toBe('#ff8000')
      // Out-of-range finite values clamp to the ends rather than wrapping,
      // which is the other half of the same function.
      expect(hex([300, -20, 12.6])).toBe('#ff000d')
    }),
  )

  it.effect('a scrim alpha that is not a number composites as FULLY OPAQUE, which is the safe direction', () =>
    Effect.sync(() => {
      // `compositeOver` is what turns `SCRIM` plus a world pixel into the
      // backdrop every contrast floor in this file is measured against. A `NaN`
      // alpha propagating through it would make every one of those ratios
      // `NaN`, and `NaN >= floor` is false — so the survey would report the
      // whole palette below floor and nobody would be able to tell a real
      // regression from a broken number.
      //
      // 1 rather than 0 is chosen and is the OPPOSITE of `clampChannel`'s
      // direction: an opaque scrim is the backdrop this repository controls, so
      // the fallback is the case the palette was designed against. A fallback of
      // 0 would be a fully transparent scrim, i.e. measuring HUD text directly
      // against an arbitrary world pixel — which is the guarantee failing open.
      expect(compositeOver([255, 255, 255], Number.NaN, [0, 0, 0])).toStrictEqual([255, 255, 255])
      expect(compositeOver([255, 255, 255], 1, [0, 0, 0])).toStrictEqual([255, 255, 255])

      // The ordinary path still blends, and out-of-range alphas clamp.
      expect(compositeOver([255, 255, 255], 0, [0, 0, 0])).toStrictEqual([0, 0, 0])
      expect(compositeOver([200, 100, 0], 0.5, [0, 0, 0])).toStrictEqual([100, 50, 0])
      expect(compositeOver([255, 255, 255], -3, [0, 0, 0])).toStrictEqual([0, 0, 0])
      expect(compositeOver([255, 255, 255], 9, [0, 0, 0])).toStrictEqual([255, 255, 255])
    }),
  )

  it.effect('REGRESSION: every guarded token clears its floor over ANY world pixel', () =>
    Effect.sync(() => {
      // G1. HUD text does not sit on a colour this repository controls — it
      // sits on `SCRIM`, which is translucent, over whatever mc-render drew.
      // So the ratio is taken against the worst pixel there is rather than a
      // convenient one, and the bound is exact rather than sampled because
      // composite luminance is monotone in the backdrop. `boundIsExact` is the
      // side condition that makes the two-endpoint check valid; a token that
      // failed it would be one that vanishes into the scrim over some world,
      // and it is reported as below-floor rather than measured wrongly.
      const survey = surveyPalette()

      expect(survey.tokensBelowFloor).toStrictEqual([])
      expect(survey.tokens.length).toBeGreaterThan(0)
      for (const token of survey.tokens) {
        expect(token.boundIsExact).toBe(true)
        expect(token.worstContrast).toBeGreaterThanOrEqual(token.floor)
      }

      // The floors are WCAG 2.2's, not house numbers: §1.4.3 for text, §1.4.11
      // for icons, meters and borders.
      expect(TEXT_CONTRAST_MIN).toBe(4.5)
      expect(UI_CONTRAST_MIN).toBe(3)
    }),
  )

  it.effect('REGRESSION: no critical pair collapses under any of the four colour-vision modes', () =>
    Effect.sync(() => {
      // G2, and the reason it matters here rather than somewhere else: DN-UI-1a
      // scopes the daltonisation correction to the CANVAS, so it never touches
      // one colour in `domain/palette.ts`. These pairs have to survive
      // un-corrected or they do not survive.
      const survey = surveyPalette()

      expect(survey.collapsedPairs).toStrictEqual([])
      for (const reading of survey.pairs) {
        expect(reading.worstSeparation).toBeGreaterThanOrEqual(COLLAPSE_SEPARATION)
        // All four modes measured, `off` included — a pair that only works for
        // trichromats is the failure, and a pair that only works for
        // dichromats would be a different one.
        expect(reading.perMode.map((mode) => mode.mode)).toStrictEqual([...COLOR_VISION_MODES])
      }

      // The five pairs the preview named as the specification while there was
      // nothing to measure are all still on the list.
      const named = survey.pairs.map((reading) => `${reading.pair.left.name} / ${reading.pair.right.name}`)
      expect(named).toContain('heart full / heart empty')
      expect(named).toContain('durability high / durability low')
      expect(named).toContain('xp fill / xp track')
      expect(named).toContain('heart full / shank full')
      expect(named).toContain('slot selected / slot border')
    }),
  )

  it.effect('REGRESSION: the pair the reference collapses is the pair this palette fixed', () =>
    Effect.sync(() => {
      // The survey's actual finding, kept as a test so that anyone tempted to
      // "restore the reference values" is told why they were changed.
      //
      // `<reference-impl>/index.html:159` inks a successful autosave `#d7f7c2`
      // and `:212` inks a FAILED one `#ffd6d2`. Simulated, those two are 12
      // units apart under protanopia and 22 under deuteranopia, against a
      // collapse threshold of 24 out of the 442-unit cube — so a red-green
      // dichromat cannot tell "world saved" from "save failed", two strings of
      // similar length in the same place on the same backdrop.
      //
      // Nothing in the reference could have caught it:
      // `<reference-impl>/e2e/ui/accessibility.e2e.ts:10` compares a text node
      // against its own background and never one STATE against another.
      const REFERENCE_OK: Rgb = [215, 247, 194] // index.html:159
      const REFERENCE_ERROR: Rgb = [255, 214, 210] // index.html:212

      const worstReference = Math.min(
        ...COLOR_VISION_MODES.map((mode) =>
          separation(
            simulateColorVision(REFERENCE_OK, mode),
            simulateColorVision(REFERENCE_ERROR, mode),
          ),
        ),
      )
      expect(worstReference).toBeLessThan(COLLAPSE_SEPARATION)

      const worstOurs = Math.min(
        ...COLOR_VISION_MODES.map((mode) =>
          separation(simulateColorVision(STATUS_OK, mode), simulateColorVision(STATUS_ALERT, mode)),
        ),
      )
      expect(worstOurs).toBeGreaterThanOrEqual(COLLAPSE_SEPARATION)

      // And the fix is a LUMINANCE ladder, not a hue swap. That is the general
      // rule the survey forced: dichromacy compresses hue and largely preserves
      // luminance, so a set separated by luminance survives by construction.
      expect(relativeLuminance(STATUS_OK)).toBeGreaterThan(relativeLuminance(STATUS_BUSY))
      expect(relativeLuminance(STATUS_BUSY)).toBeGreaterThan(relativeLuminance(STATUS_ALERT))
    }),
  )

  it.effect('REGRESSION: shape coding is not the only distinguisher, and it is not optional either', () =>
    Effect.sync(() => {
      // G3, and it is BOTH directions on purpose.
      //
      // Colour may not be the only channel: `<reference-impl>/index.html:416`
      // scopes the daltonisation filter to the canvas and justifies leaving the
      // DOM HUD un-corrected by asserting the HUD "already carries
      // icon/shape/numeric redundancy". A palette that removed the redundancy
      // would invalidate a decision taken in another repository.
      //
      // And shape may not be the only channel either: a pair cannot buy its way
      // past the separation test by declaring a glyph. Both lists are empty.
      const survey = surveyPalette()

      expect(survey.pairsWithoutRedundancy).toStrictEqual([])
      expect(survey.collapsedPairs).toStrictEqual([])
      for (const reading of survey.pairs) {
        expect(reading.pair.alsoDistinguishedBy.length).toBeGreaterThan(0)
      }

      // Health versus hunger is the pair that proves the point rather than
      // merely passing it: it clears the separation floor, but its contrast
      // ratio is under 3:1 in every mode, so it is separated by CHROMA — the
      // channel dichromacy compresses hardest. The three icon shapes are most
      // of that signal, which is why `IconState` has three members and not a
      // percentage.
      const heartVsShank = survey.pairs.find(
        (reading) => reading.pair.left.name === 'heart full' && reading.pair.right.name === 'shank full',
      )
      expect(heartVsShank?.hueOnly).toBe(true)
      expect(heartVsShank?.pair.alsoDistinguishedBy).toContain('shape')
    }),
  )

  it.effect('REGRESSION: a token that lands on top of another is a failure until somebody explains it', () =>
    Effect.sync(() => {
      // The sweep runs over EVERY pair of meaning-bearing tokens, not just the
      // declared ones, so adding a colour that happens to collide with one
      // already there fails here rather than in a bug report. The escape hatch
      // is `KNOWN_NEAR_COLLISIONS`, which costs a written reason.
      const survey = surveyPalette()
      expect(survey.undeclaredNearCollisions).toStrictEqual([])

      // There is exactly one acknowledged collision and it records a limit of
      // the colour space rather than a slip: searching sRGB for an "alert"
      // colour that clears 4.5:1 over the worst world pixel AND stays clear of
      // hunger-orange under all three dichromacies returns only greys and
      // purples. On a dark HUD there is no red that is both an alarm and
      // distinct from hunger.
      expect(KNOWN_NEAR_COLLISIONS).toHaveLength(1)
      for (const collision of KNOWN_NEAR_COLLISIONS) {
        expect(collision.why.length).toBeGreaterThan(40)
      }
    }),
  )

  it.effect('the tokens render for a stylesheet through exactly one function', () =>
    Effect.sync(() => {
      // The DOM layer must not hand-write `rgba(...)`. The reference had to
      // write the same contrast fix into four files because there was no token
      // to change; the same absence is what produces four spellings of one
      // colour.
      expect(hex(HEART)).toBe('#e02828')
      expect(cssColor(HEART)).toBe('#e02828')
      expect(cssColor(SCRIM, SCRIM_ALPHA)).toBe('rgba(10, 14, 18, 0.9)')
      // Alpha is clamped rather than validated, for the reason DN-UI-7 clamps:
      // a stylesheet that throws is worse than one that is briefly wrong.
      expect(cssColor(SCRIM, 5)).toBe('#0a0e12')
      expect(cssColor(SCRIM, Number.NaN)).toBe('#0a0e12')
    }),
  )

  it.effect('REGRESSION: the SIMULATION is not the CORRECTION, and neither file holds both', () =>
    Effect.sync(() => {
      // DN-UI-1a: a simulation shows what a player SEES, a correction changes
      // what is DRAWN. Swapping them breaks precisely what the setting exists
      // to fix. They live in two modules that point at each other; this asserts
      // they have not converged.
      const red: Rgb = [255, 0, 0]
      const simulated = simulateColorVision(red, 'protanopia')

      // The simulation DESTROYS the red/green distinction — that is its job.
      expect(simulated[0]).toBeLessThan(255)
      // The correction preserves the red channel and redistributes into blue,
      // which `test/view-model.test.ts` above already pins. The two transforms
      // therefore disagree about red, and that disagreement is the invariant.
      const correction = colorVisionMatrix('protanopia')
      if (correction === undefined) {
        throw new Error('protanopia lost its correction matrix')
      }
      const corrected = applyColorVisionMatrix([1, 0, 0], correction)
      expect(corrected[0]).toBe(1)
      expect(simulateColorVision(red, 'off')).toStrictEqual(red)
    }),
  )
})

/**
 * The inventory and crafting screens (was G2).
 *
 * These replace `GAP: inventory and crafting are screen ids, not derivations`,
 * which asserted the absence of a derivation. The derivation exists now; what
 * these assert is the part the deferral was right about — that mx-ui must not
 * answer a question mc-sim owns, and must say so rather than guess.
 */
describe('inventory and crafting project state without interpreting it', () => {
  const inventoryWith = (overrides: Partial<InventorySnapshot>): InventorySnapshot => ({
    ...emptyInventorySnapshot,
    ...overrides,
  })

  const filled = (index: number, item: string, count: number): MirroredInventory => ({
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) =>
      slot === index ? { item, count } : undefined,
    ),
  })

  it.effect('the projection is pure, total and the same for the same input', () =>
    Effect.sync(() => {
      const snapshot = inventoryWith({ inventory: filled(0, 'DIAMOND_PICKAXE', 1) })

      expect(inventoryViewModel(snapshot)).toStrictEqual(inventoryViewModel(snapshot))
      // Nothing is mutated: the caller's snapshot is a value, not a handle.
      expect(snapshot.inventory.slots).toHaveLength(INVENTORY_SLOT_COUNT)
      expect(() => inventoryViewModel(emptyInventorySnapshot)).not.toThrow()
    }),
  )

  it.effect('REGRESSION: the slot projection is SHARED with the hotbar, never re-derived', () =>
    Effect.sync(() => {
      // The point of the whole exercise. DN-UI-7c is the record of what a
      // second per-slot projection costs: the `empty` guard cleared `itemId`
      // and `countLabel` and not `durabilityPercent`, and a DOM layer drew a
      // durability bar under an empty slot. An inventory screen with its own
      // copy would have reproduced that bug once more, in a screen where a
      // player looks at thirty-six slots instead of nine.
      const model = inventoryViewModel(
        inventoryWith({
          inventory: filled(0, 'DIAMOND_PICKAXE', 1),
          durabilityBySlot: new Map([[0, 0.5]]),
        }),
      )
      const hotbar = regionOf(model, 'hotbar')
      if (hotbar?.kind !== 'slots') {
        throw new Error('the hotbar region should be projected')
      }

      // Byte for byte what `hudViewModel` produces for the same slot.
      expect(hotbar.slots[0]).toStrictEqual(
        hudViewModel(
          withVitals({
            hotbar: [{ itemId: 'DIAMOND_PICKAXE', count: 1, durability: 0.5 }],
            selectedHotbarIndex: 0,
          }),
        ).hotbar[0],
      )

      // Including the empty-slot rule, which is the one that was got wrong.
      const emptied = inventoryViewModel(
        inventoryWith({ inventory: { slots: [] }, durabilityBySlot: new Map([[0, 0.5]]) }),
      )
      const emptyHotbar = regionOf(emptied, 'hotbar')
      if (emptyHotbar?.kind !== 'slots') {
        throw new Error('the hotbar region should be projected')
      }
      expect(emptyHotbar.slots[0]?.empty).toBe(true)
      expect(emptyHotbar.slots[0]?.durabilityPercent).toBeUndefined()
    }),
  )

  it.effect('layout is mx-ui’s: 36 flat slots become a hotbar and a 9x3 grid', () =>
    Effect.sync(() => {
      // mc-sim hands over a flat array and says nothing about shape, which is
      // correct — "nine of these are a hotbar" is a fact about a screen. Every
      // region is a fixed length however short the input, so the DOM layer
      // never reasons about a short array (the same call `hudViewModel` makes).
      const model = inventoryViewModel(inventoryWith({ inventory: { slots: [] } }))
      const hotbar = regionOf(model, 'hotbar')
      const main = regionOf(model, 'main')

      if (hotbar?.kind !== 'slots' || main?.kind !== 'slots') {
        throw new Error('both player regions should be projected')
      }
      expect(hotbar.slots).toHaveLength(HOTBAR_SLOT_COUNT)
      expect(main.slots).toHaveLength(INVENTORY_MAIN_SLOT_COUNT)
      expect(main.columns).toBe(INVENTORY_MAIN_COLUMNS)
      expect(HOTBAR_SLOT_COUNT + INVENTORY_MAIN_SLOT_COUNT).toBe(INVENTORY_SLOT_COUNT)

      // The hotbar carries the selection; the grid has none of its own.
      expect(hotbar.slots.filter((slot) => slot.selected)).toHaveLength(1)
      expect(main.slots.filter((slot) => slot.selected)).toHaveLength(0)
    }),
  )

  it.effect('REGRESSION: a state this repository cannot interpret is UNKNOWN, never guessed', () =>
    Effect.sync(() => {
      // The one that matters. Three separate questions mc-sim owns, each of
      // which has a plausible wrong answer that looks like progress:
      const model = inventoryViewModel(emptyInventorySnapshot)

      // 1. Recipes. mc-sim has no recipe model at all — there is no `Recipe` in
      //    its api-lock — so "does this grid make anything" is unanswered.
      //    Drawing an EMPTY output square would say "nothing you can make",
      //    which is a claim this repository is not entitled to make and which
      //    is wrong exactly when the player is confused about a recipe.
      expect(model.crafting).toStrictEqual({ kind: 'unknown' })
      expect(model.crafting).not.toStrictEqual({ kind: 'no-match' })

      // 2. Stacking. Whether the carried stack merges into a slot is a stacking
      //    rule, and `mc-sim/domain/inventory.ts` owns it — top up partial
      //    stacks first, cap at MAX_STACK_COUNT. Comparing item ids here would
      //    reproduce a third of that rule, get the cap wrong, and be wrong
      //    silently inside a highlight the player reads as a promise.
      expect(model.mergeTargets).toStrictEqual({ kind: 'unknown' })

      // 3. Regions mc-sim does not have. Four empty squares tell the player
      //    they are wearing no armour; mc-sim has said nothing at all.
      const armour = regionOf(model, 'armour')
      const offhand = regionOf(model, 'offhand')
      expect(armour?.kind).toBe('unknown')
      expect(offhand?.kind).toBe('unknown')
      expect(regionOf(model, 'crafting-grid')?.kind).toBe('unknown')

      // An unknown region explains itself, so the absence is legible in a
      // preview instead of looking like a rendering bug.
      if (armour?.kind !== 'unknown') {
        throw new Error('armour should be unknown')
      }
      expect(armour.why.length).toBeGreaterThan(0)
    }),
  )

  it.effect('an armour rack and an offhand mc-sim DOES supply are projected as slots, not as unknown', () =>
    Effect.sync(() => {
      // The other side of the `unknown` regression above, and the one nothing
      // asked for: every existing test drives `armour: undefined` and
      // `offhand: undefined`, because that is what mc-sim answers today. So the
      // whole suite passes against a projection that answered `unknown`
      // UNCONDITIONALLY — the `undefined` check would be doing nothing and
      // nobody would know until mc-sim grew the fields and the screen kept
      // saying "no armour rack" over a full set of armour.
      //
      // `| undefined` rather than optional is the shape that makes this a
      // question a caller can answer (`domain/inventory-view-model.ts`:
      // 「the frame has to SAY it does not know」), and a question nobody has
      // ever answered YES is a question whose yes-branch has never run.
      const model = inventoryViewModel(
        inventoryWith({
          armour: [
            { item: 'IRON_HELMET', count: 1 },
            undefined,
            undefined,
            { item: 'IRON_BOOTS', count: 1 },
          ],
          offhand: { item: 'SHIELD', count: 1 },
        }),
      )

      const armour = regionOf(model, 'armour')
      const offhand = regionOf(model, 'offhand')

      expect(armour?.kind).toBe('slots')
      expect(offhand?.kind).toBe('slots')

      if (armour?.kind !== 'slots' || offhand?.kind !== 'slots') {
        throw new Error('a supplied rack projects as slots')
      }

      // The rack keeps its own length — four squares for four pieces, not
      // padded to the inventory's 36 — because the region's width is the thing
      // mc-sim said and not a layout constant.
      expect(armour.slots).toHaveLength(4)
      expect(armour.slots[0]?.itemId).toBe('IRON_HELMET')
      // An EMPTY armour square is empty, which is a different claim from the
      // whole rack being unknown, and the distinction only exists once the rack
      // is supplied at all.
      expect(armour.slots[1]?.empty).toBe(true)
      expect(armour.slots[3]?.itemId).toBe('IRON_BOOTS')

      expect(offhand.slots).toHaveLength(1)
      expect(offhand.slots[0]?.itemId).toBe('SHIELD')

      // …and supplying them changed nothing about the regions that were already
      // known, so the two projections are independent.
      expect(regionOf(model, 'hotbar')?.kind).toBe('slots')
      expect(regionOf(model, 'crafting-grid')?.kind).toBe('unknown')
    }),
  )

  it.effect('“no recipe matches” and “mc-sim has not answered” are DIFFERENT screens', () =>
    Effect.sync(() => {
      // Three-valued on purpose. Collapsing the middle value is the bug: a
      // player staring at a grid needs to know whether the game has decided
      // there is nothing to make, or has not looked yet.
      const grid = { gridWidth: 2, grid: [undefined, undefined, undefined, undefined] }

      expect(
        inventoryViewModel(inventoryWith({ crafting: { ...grid, result: undefined } })).crafting,
      ).toStrictEqual({ kind: 'unknown' })

      expect(
        inventoryViewModel(inventoryWith({ crafting: { ...grid, result: { _tag: 'NoMatch' } } }))
          .crafting,
      ).toStrictEqual({ kind: 'no-match' })

      const matched = inventoryViewModel(
        inventoryWith({
          crafting: { ...grid, result: { _tag: 'Match', output: { item: 'OAK_PLANKS', count: 4 } } },
        }),
      )
      expect(matched.crafting.kind).toBe('match')
      if (matched.crafting.kind !== 'match') {
        throw new Error('should have matched')
      }
      // Projected through the SAME `slotView` as everything else, so the output
      // square and a hotbar slot cannot disagree about when to print a count.
      expect(matched.crafting.output.itemId).toBe('OAK_PLANKS')
      expect(matched.crafting.output.countLabel).toBe('4')
    }),
  )

  it.effect('one derivation serves both screens — the grid width comes from the snapshot', () =>
    Effect.sync(() => {
      // plan.md §3.13 names inventory and crafting separately, but they differ
      // only in how wide the grid is, and mc-sim's container knows that. A
      // second `craftingViewModel` would be a second derivation of one
      // projection, which is the mistake DN-UI-7c records.
      const twoByTwo = inventoryViewModel(
        inventoryWith({ crafting: { gridWidth: 2, grid: Array.from({ length: 4 }), result: undefined } }),
      )
      const threeByThree = inventoryViewModel(
        inventoryWith({ crafting: { gridWidth: 3, grid: Array.from({ length: 9 }), result: undefined } }),
      )

      const gridOf = (model: ReturnType<typeof inventoryViewModel>): number => {
        const region = regionOf(model, 'crafting-grid')
        return region?.kind === 'slots' ? region.columns : 0
      }
      expect(gridOf(twoByTwo)).toBe(2)
      expect(gridOf(threeByThree)).toBe(3)

      // A width this module cannot read is a container it does not know, not a
      // 2x2 with a typo.
      const nonsense = inventoryViewModel(
        inventoryWith({ crafting: { gridWidth: Number.NaN, grid: [], result: undefined } }),
      )
      expect(regionOf(nonsense, 'crafting-grid')?.kind).toBe('unknown')
    }),
  )

  it.effect('REGRESSION: this repository implements no stacking rule and no recipe matcher', () =>
    Effect.sync(() => {
      // plan.md §2.3-1 assigns both to mc-sim. The barrel is the place a
      // violation would show up, because a helper this useful does not stay
      // private for long.
      for (const name of ['canStack', 'matchRecipe', 'mergeStacks', 'craftingResult', 'MAX_STACK_COUNT']) {
        expect(Object.keys(ui)).not.toContain(name)
      }

      // And the projection does not answer either question even when the
      // answer looks obvious: two identical items, no merge highlight, because
      // nobody was asked.
      const model = inventoryViewModel(
        inventoryWith({
          inventory: filled(0, 'COBBLESTONE', 32),
          carried: { item: 'COBBLESTONE', count: 32 },
        }),
      )
      expect(model.carried?.itemId).toBe('COBBLESTONE')
      expect(model.mergeTargets).toStrictEqual({ kind: 'unknown' })
    }),
  )

  it.effect('a snapshot from across a version boundary is clamped, exactly as the HUD’s is', () =>
    Effect.sync(() => {
      // DN-UI-7 applies here for the same reason it applies there: the value
      // crosses a pinned version boundary from mc-sim. A screen that throws is
      // worse than a screen that is briefly wrong.
      const model = inventoryViewModel(
        inventoryWith({
          inventory: filled(0, 'STONE', Number.NaN),
          selectedHotbarIndex: Number.NaN,
        }),
      )
      const hotbar = regionOf(model, 'hotbar')
      if (hotbar?.kind !== 'slots') {
        throw new Error('the hotbar region should be projected')
      }

      expect(hotbar.slots.filter((slot) => slot.selected)).toHaveLength(1)
      expect(hotbar.slots[0]?.selected).toBe(true)
      expect(hotbar.slots[0]?.countLabel).toBeUndefined()
      expect(hotbar.slots[0]?.empty).toBe(true)

      expect(() =>
        inventoryViewModel(inventoryWith({ selectedHotbarIndex: Number.POSITIVE_INFINITY })),
      ).not.toThrow()
    }),
  )

  it.effect('the modal stack still owns opening and closing these two screens', () =>
    Effect.sync(() => {
      // Carried over from the test this block replaces: the part that WAS real
      // before the derivation existed is still real and still checked.
      expect(ui.openScreen(ui.emptyModalStack, 'inventory')).toStrictEqual(['inventory'])
      expect(ui.openScreen(['inventory'], 'crafting')).toStrictEqual(['inventory', 'crafting'])
    }),
  )
})
