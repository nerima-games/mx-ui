/**
 * Pure view-model / state-derivation tests.
 *
 * No DOM anywhere, which is why these run under `environment: 'node'` and why
 * they are fast enough to be worth running on every save. plan.md §3.13's
 * DOM-flow tests come later and have their own rules — see docs/testing.md.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as ui from '../index'
import {
  applyColorVisionMatrix,
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_MODES,
  colorVisionAttribute,
  colorVisionMatrix,
  colorVisionMatrixValues,
} from '../domain/accessibility'
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
 * Two gaps that are NOT fixed, pinned so that closing them is a diff.
 *
 * `pnpm preview --stats` reports both. Neither can be closed by inventing the
 * missing piece here — that is what makes them gaps rather than bugs — so what
 * these tests assert is the ABSENCE, in the exact shape the addition will take.
 * A finding that lives only in a report is a finding nobody reads; a finding
 * that lives in a failing test is a finding that gets closed.
 */
describe('gaps the preview found that are recorded rather than filled', () => {
  it.effect('GAP: mx-ui defines no colours, so nothing here can be contrast-checked', () =>
    Effect.sync(() => {
      // F5, second half. The correction matrices above are now carried over and
      // they act on mc-render's canvas, so they are complete without a palette.
      // What is still missing is mx-ui's OWN colours: there is no token, no
      // theme and no stylesheet anywhere in the repository, so
      // `apps/preview-screens/palette.ts` measures colours the preview invented
      // and `--stats` §5 says so in a footnote.
      //
      // Inventing a palette to make the harness look finished would make the
      // gap invisible — the same mistake `screen-inventory.ts` refuses to make
      // by drawing a plausible grid. So: no palette, and this test names it.
      //
      // WHAT MUST EXIST when someone closes this. The preview's
      // `CRITICAL_PAIRS` is the specification: pairs of colours that MEAN
      // different things (heart full / heart empty, durability high /
      // durability low, xp bar / xp track, heart / shank, slot selected / slot
      // border) and must stay distinguishable under all four modes. A palette
      // that ships without those five pairs measured is a palette nobody has
      // checked. When the tokens land, this test is replaced by one that
      // asserts the pairs, and `palette.ts` imports them instead of inventing.
      const paletteNames = [
        'PALETTE',
        'COLORS',
        'COLOURS',
        'COLOR_TOKENS',
        'COLOUR_TOKENS',
        'THEME',
        'TOKENS',
        'HUD_COLORS',
        'HUD_COLOURS',
        'CRITICAL_PAIRS',
      ]
      for (const name of paletteNames) {
        expect(Object.keys(ui)).not.toContain(name)
      }
    }),
  )

  it.effect('GAP: inventory and crafting are screen ids, not derivations', () =>
    Effect.sync(() => {
      // F6. plan.md §3.13 names four screens; three have a pure derivation in
      // `domain/`. `inventory` and `crafting` exist only as two members of the
      // `ScreenId` union — the modal stack can open, raise and close them, and
      // that much is real and tested — but there is no slot grid, no stacking
      // rule and no recipe matcher.
      //
      // NOT FIXED, deliberately. mc-sim owns the inventory STATE (plan.md
      // §2.3-1) and has not published its shape. A derivation written now would
      // have to invent the snapshot type it reads, and `api-lock.md` would
      // publish that invention as this package's surface — where changing it
      // later is a breaking change for every consumer. That is the exact trap
      // `index.ts` already documents for `domain/frame-contract.ts`. Adding the
      // derivation once the shape is known is cheap; un-publishing a guessed
      // one is not.
      //
      // WHAT MUST EXIST when someone closes this: a pure
      // `inventoryViewModel(snapshot) => …` beside `hudViewModel`, taking
      // mc-sim's slot array and returning the screen's regions (main, hotbar,
      // armour, offhand, crafting grid) with the same per-slot projection
      // `hotbarSlotView` already performs — layout is mx-ui's, stacking rules
      // and recipes are mc-sim's.
      expect(ui.openScreen(ui.emptyModalStack, 'inventory')).toStrictEqual(['inventory'])
      expect(ui.openScreen(['inventory'], 'crafting')).toStrictEqual(['inventory', 'crafting'])

      const derivations = [
        'inventoryViewModel',
        'craftingViewModel',
        'INVENTORY_SLOT_COUNT',
        'CRAFTING_GRID_SIZE',
        'canStack',
        'matchRecipe',
      ]
      for (const name of derivations) {
        expect(Object.keys(ui)).not.toContain(name)
      }
    }),
  )
})
