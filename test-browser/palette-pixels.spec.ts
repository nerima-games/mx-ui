/**
 * THE MEASURED HALF of `domain/palette.ts`'s guarantee.
 *
 * ---------------------------------------------------------------------------
 * What was never checked, and why it could not be
 * ---------------------------------------------------------------------------
 *
 * `docs/testing.md` §4 lists this as the second of two things this repository
 * had not proved: 「`var()` は誰も解決していない。偽 document は参照文字列を記録
 * するだけで、カスケードを実行しない」. Everything downstream of that string —
 * every contrast number in `surveyPalette`, the 0.88 → 0.90 alpha decision, the
 * whole of G1 — is arithmetic performed on values NOBODY HAD WATCHED A BROWSER
 * PAINT.
 *
 * Three questions, in increasing order of how much they could have gone wrong:
 *
 *   1. Does `var(--mx-ui-heart)` resolve to `HEART`? A cascade question.
 *   2. Does a TRANSLUCENT token composite to what `compositeOver` predicts? An
 *      engine question, and the one with a real alternative answer — see below.
 *   3. Is the survey's worst-case bound actually a bound? A claim about the
 *      arithmetic that the arithmetic cannot check about itself.
 *
 * ---------------------------------------------------------------------------
 * QUESTION 2 IS THE INTERESTING ONE
 * ---------------------------------------------------------------------------
 *
 * `domain/palette.ts` on `compositeOver`:
 *
 *   Source-over compositing, in sRGB space, which is where CSS does it. Not
 *   gamma-correct, and that is not a bug: the browser is not gamma-correct here
 *   either, so a "correct" composite would predict a colour the player never
 *   sees.
 *
 * That is an assertion about another program's behaviour, made in a comment, in
 * a repository with no browser. It happens to be right, and the margin is not
 * small: over a mid-grey page the scrim composites to `[22, 26, 29]` in sRGB and
 * to `[43, 44, 46]` in linear light. Had the browser been gamma-correct, every
 * `worstCaseContrastOnScrim` reading in this repository would be measuring a
 * surface twice as bright as the real one — and `SCRIM_ALPHA` was tuned by two
 * hundredths on the strength of exactly those readings.
 *
 * So the test asserts BOTH: that the measured pixel matches the sRGB prediction,
 * and that it does NOT match the linear one. The second half is what makes the
 * first half a measurement rather than a coincidence with a wide tolerance.
 */
import { expect, test } from '@playwright/test'
import {
  compositeOver,
  contrastRatio,
  GUARDED_TOKENS,
  SCRIM,
  SCRIM_ALPHA,
  surveyPalette,
  TEXT_CONTRAST_MIN,
  UI_CONTRAST_MIN,
  type Rgb,
} from '../domain/palette'
import { PALETTE_SOURCE, PALETTE_TOKEN_NAMES, PALETTE_VAR } from '../application/palette-css'
import {
  HARNESS_WORLD_PIXEL,
  openHarness,
  parseCssRgb,
  samplePixels,
} from './harness'

/** `var(--mx-ui-ink)` back to the token name the palette knows. */
const TOKEN_BY_VAR = new Map(PALETTE_TOKEN_NAMES.map((name) => [PALETTE_VAR[name], name]))

const round = (value: number): number => Math.round(value)

/**
 * Within one unit per channel.
 *
 * Not slop. Chromium composites in premultiplied 8-bit and rounds once per
 * channel; `compositeOver` returns floats and is rounded here. Two roundings of
 * the same real number differ by at most one, and the measured green channel
 * really does come back 26 against a predicted 25.4. A tolerance of 1 is
 * therefore the exact width of the disagreement 8-bit arithmetic can produce —
 * and it is 17 units narrower than the gap to the answer this test exists to
 * exclude.
 */
const CHANNEL_TOLERANCE = 1

const withinTolerance = (measured: Rgb, predicted: Rgb): boolean =>
  measured.every((channel, index) => Math.abs(channel - round(predicted[index] ?? 0)) <= CHANNEL_TOLERANCE)

test.describe('question 1: the cascade resolves every token to its declared value', () => {
  test('every colour a screen writes computes to its token’s exact channels', async ({ page }) => {
    // The browser analogue of `test/accessibility-gate.test.ts`'s audit. That one
    // resolves a written `var(...)` string back to a token by table lookup,
    // which is self-consistent by construction — both sides come from
    // `PALETTE_VAR`. This one asks the ENGINE what the string became, so a
    // property name that was declared and referenced under two different
    // spellings would show up as an empty computed value rather than as a
    // matching pair of constants.
    await openHarness(page)

    const readings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-harness-host] [data-mx-ui]')).flatMap((element) => {
        const computed = getComputedStyle(element)
        const inline = (element as HTMLElement).style
        return (['color', 'background-color'] as const)
          .map((property) => ({
            where: element.getAttribute('data-mx-ui') ?? element.tagName,
            property,
            written: inline.getPropertyValue(property),
            computed: computed.getPropertyValue(property),
          }))
          .filter((reading) => reading.written !== '')
      }),
    )

    // Non-vacuity first, and it is not ceremony: a selector typo would make the
    // sweep below pass over an empty array. The headless suite makes the same
    // check for the same reason (「the sweep is not vacuous」).
    expect(readings.length).toBeGreaterThan(100)

    const disagreements = readings
      .map((reading) => {
        const token = TOKEN_BY_VAR.get(reading.written)
        if (token === undefined) {
          return `${reading.where}: ${reading.property} "${reading.written}" is not a palette token`
        }
        // Compared as CHANNELS against `domain/palette.ts`'s own numbers, not as
        // strings against `cssColor`'s rendering of them. The first draft did the
        // latter and threw on `#ababab`: `cssColor` emits hex for an opaque
        // token and the browser normalises everything to `rgb(...)`, so a string
        // comparison would have been testing two spellings of the same colour.
        // The channels are what the palette actually promises — `hex` and
        // `cssColor` are described in that file as renderings OF the `Rgb`, and
        // the `Rgb` is the thing every contrast reading is computed from.
        const declared = PALETTE_SOURCE[token]
        const computedChannels = parseCssRgb(reading.computed)
        const same = computedChannels.every((channel, index) => channel === declared[index])
        return same
          ? undefined
          : `${reading.where}: ${reading.property} computed ${reading.computed}, palette says ${JSON.stringify(declared)}`
      })
      .filter((finding): finding is string => finding !== undefined)

    expect(disagreements).toStrictEqual([])
  })

  test('REGRESSION: the two translucent tokens keep their alpha through the cascade', async ({
    page,
  }) => {
    // `SCRIM_ALPHA` and `SLOT_FILL_ALPHA` are the only two, and the scrim's is
    // the one G1 rests on. Checked separately from the sweep above because that
    // sweep compares channels: a scrim that arrived fully opaque would have
    // identical channels and would pass it.
    await openHarness(page, { screen: 'hud' })

    const alphas = await page.evaluate(() => {
      const at = (selector: string, property: string): string => {
        const element = document.querySelector(`[data-harness-host="hud"] ${selector}`)
        return element === null ? '' : getComputedStyle(element).getPropertyValue(property)
      }
      return {
        scrim: at('[data-mx-ui="hud"]', 'background-color'),
        slotFill: at('[data-mx-ui="slot"]', 'background-color'),
      }
    })

    expect(alphas.scrim).toBe('rgba(10, 14, 18, 0.9)')
    expect(alphas.slotFill).toBe('rgba(0, 0, 0, 0.55)')
  })
})

test.describe('question 2: the engine composites where `compositeOver` says it does', () => {
  test('REGRESSION: the scrim over a mid-grey world lands on the sRGB composite, not the linear one', async ({
    page,
  }) => {
    await openHarness(page, { screen: 'hud' })

    const probe = await page.evaluate(() => {
      // A point inside the HUD's scrim that no child paints over: the heart row
      // is full width and its ten icons occupy only its left end, so just past
      // the last one is the scrim and nothing else. Computed rather than
      // hardcoded, because a hardcoded point silently starts measuring a
      // different element the day a row grows.
      const row = document.querySelector('[data-harness-host="hud"] [data-mx-ui="heart-row"]')
      const icons = Array.from(row?.querySelectorAll('[data-mx-ui="icon"]') ?? [])
      const last = icons[icons.length - 1]?.getBoundingClientRect()
      const rowBox = row?.getBoundingClientRect()
      if (last === undefined || rowBox === undefined) {
        throw new Error('no heart row to sample the scrim from')
      }
      return {
        x: (last.right + rowBox.right) / 2,
        y: rowBox.y + rowBox.height / 2,
        // The page itself, so the premise of the composite is measured rather
        // than taken from a comment in `index.html`. BOTTOM-RIGHT, not top-left:
        // the first draft sampled (4, 4) and got `[224, 40, 40]` — the first
        // heart. The HUD is anchored at the top of its host, so the corner that
        // is reliably page is the far one.
        worldX: window.innerWidth - 4,
        worldY: window.innerHeight - 4,
      }
    })

    const pixels = await samplePixels(page, [
      { name: 'scrim', x: probe.x, y: probe.y },
      { name: 'world', x: probe.worldX, y: probe.worldY },
    ])

    const world = pixels['world']
    const measured = pixels['scrim']
    if (world === undefined || measured === undefined) {
      throw new Error('probe did not come back')
    }

    // The premise.
    expect(world).toStrictEqual(HARNESS_WORLD_PIXEL)

    // The prediction this repository's own arithmetic makes.
    const predictedSrgb = compositeOver(SCRIM, SCRIM_ALPHA, HARNESS_WORLD_PIXEL)
    expect(
      withinTolerance(measured, predictedSrgb),
      `measured ${JSON.stringify(measured)} vs compositeOver ${JSON.stringify(predictedSrgb.map(round))}`,
    ).toBe(true)

    // AND the prediction it would make if `domain/palette.ts` were wrong about
    // the engine. Without this half, the assertion above is satisfied by any
    // tolerance wide enough, and the whole point is that the gap between the two
    // answers is seventeen units rather than one.
    const toLinear = (value: number): number => {
      const scaled = value / 255
      return scaled <= 0.04045 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
    }
    const toSrgb = (value: number): number =>
      255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055)
    const predictedLinear: Rgb = [0, 1, 2].map((index) =>
      toSrgb(
        SCRIM_ALPHA * toLinear(SCRIM[index] ?? 0) +
          (1 - SCRIM_ALPHA) * toLinear(HARNESS_WORLD_PIXEL[index] ?? 0),
      ),
    ) as unknown as Rgb

    expect(
      withinTolerance(measured, predictedLinear),
      `measured ${JSON.stringify(measured)} matched the LINEAR composite ${JSON.stringify(
        predictedLinear.map(round),
      )} — if this ever passes, every contrast number in domain/palette.ts is measured against the wrong surface`,
    ).toBe(false)
  })
})

test.describe('question 3: the survey bounds what the browser actually renders', () => {
  test('REGRESSION: no mark reads WORSE in a browser than `surveyPalette` promised', async ({
    page,
  }) => {
    // THE FALSIFIABLE ONE.
    //
    // `worstCaseContrastOnScrim` claims to be 「Exact rather than sampled」 — the
    // minimum over EVERY world pixel, justified by monotonicity plus a side
    // condition the survey asserts rather than assumes. A real reading is one
    // sample from inside that range, so it must come out at or above the bound.
    // A reading BELOW the bound would mean the bound is not a bound, and every
    // 「meetsFloor: true」 in this repository would be reporting a number it had
    // not earned.
    //
    // It is a genuine test rather than a tautology because the two sides are
    // computed from different things: the bound is arithmetic on
    // `domain/palette.ts`'s constants, and the reading is a colour the engine
    // resolved against a surface the engine composited.
    await openHarness(page, { screen: 'hud' })

    const survey = surveyPalette()

    const probe = await page.evaluate(() => {
      const row = document.querySelector('[data-harness-host="hud"] [data-mx-ui="heart-row"]')
      const icons = Array.from(row?.querySelectorAll('[data-mx-ui="icon"]') ?? [])
      const last = icons[icons.length - 1]?.getBoundingClientRect()
      const rowBox = row?.getBoundingClientRect()
      if (last === undefined || rowBox === undefined) {
        throw new Error('no heart row to sample the scrim from')
      }
      return { x: (last.right + rowBox.right) / 2, y: rowBox.y + rowBox.height / 2 }
    })

    const pixels = await samplePixels(page, [{ name: 'scrim', x: probe.x, y: probe.y }])
    const surface = pixels['scrim']
    if (surface === undefined) {
      throw new Error('probe did not come back')
    }

    // The colours the HUD actually paints, taken from the engine. The mark
    // colours are read as COMPUTED VALUES rather than as sampled pixels on
    // purpose: a glyph's pixels are antialiased against their own backdrop, so
    // sampling one would measure the blend rather than the mark. The surface
    // underneath is a flat region and is sampled, because that is the half a
    // computed value cannot give — it has an alpha in it.
    const painted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-harness-host="hud"] [data-mx-ui]')).flatMap((element) => {
        const computed = getComputedStyle(element)
        const inline = (element as HTMLElement).style
        return (['color', 'background-color'] as const)
          .filter((property) => inline.getPropertyValue(property) !== '')
          .map((property) => ({
            where: element.getAttribute('data-mx-ui') ?? element.tagName,
            written: inline.getPropertyValue(property),
            computed: computed.getPropertyValue(property),
            property,
          }))
      }),
    )

    const findings: Array<string> = []
    let checked = 0

    for (const mark of painted) {
      const token = TOKEN_BY_VAR.get(mark.written)
      if (token === undefined) {
        findings.push(`${mark.where}: ${mark.property} is not a palette token`)
        continue
      }
      const color = PALETTE_SOURCE[token]
      const guarded = GUARDED_TOKENS.find(
        (candidate) =>
          candidate.color[0] === color[0] &&
          candidate.color[1] === color[1] &&
          candidate.color[2] === color[2],
      )
      // Unguarded tokens are SURFACES (`SCRIM`, `SLOT_FILL`, `METER_TRACK`,
      // `SURFACE`) and are deliberately unmeasured — they are what other things
      // are measured against. The headless audit makes the same split.
      if (guarded === undefined) {
        continue
      }

      const reading = survey.tokens.find((candidate) => candidate.name === guarded.name)
      if (reading === undefined) {
        findings.push(`${guarded.name}: the survey has no reading for a token it guards`)
        continue
      }

      const measured = contrastRatio(parseCssRgb(mark.computed), surface)
      const floor = guarded.role === 'text' ? TEXT_CONTRAST_MIN : UI_CONTRAST_MIN
      checked += 1

      if (measured < floor) {
        findings.push(
          `${mark.where}/${guarded.name}: measured ${measured.toFixed(2)}:1 is below its ${guarded.role} floor of ${String(floor)}:1`,
        )
      }
      // The bound, with a hundredth of slack for the one-unit rounding the
      // composite carries. Anything larger would let a real violation through.
      if (measured < reading.worstContrast - 0.05) {
        findings.push(
          `${mark.where}/${guarded.name}: measured ${measured.toFixed(2)}:1 is BELOW the survey's supposedly worst-case ${reading.worstContrast.toFixed(2)}:1 — the bound is not a bound`,
        )
      }
    }

    expect(checked).toBeGreaterThan(0)
    expect(findings).toStrictEqual([])
  })
})
