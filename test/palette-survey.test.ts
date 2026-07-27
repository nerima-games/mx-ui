/**
 * `surveyPalette` measured against palettes that are DELIBERATELY WRONG.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 *
 * `test/accessibility-gate.test.ts` and `test/view-model.test.ts` assert that
 * the four lists at the bottom of a survey are EMPTY for this repository's
 * palette. That is the right assertion and it has a hole in it: every one of
 * those tests also passes against
 *
 *     const surveyPalette = () => ({ tokensBelowFloor: [], collapsedPairs: [], … })
 *
 * Nothing established that the survey can FAIL. Coverage is what made it
 * visible — the reporting paths (`undeclared.push`, the pair-name formatter, the
 * non-scrim backdrop) had never executed once, in a module whose entire job is
 * to notice things. A guard nobody has watched fire is a guard nobody knows is
 * connected to anything.
 *
 * So each test below breaks ONE property and checks the survey NAMES it, and
 * checks the OTHER lists stay empty — because a survey that failed everything
 * whenever anything was wrong would be no more useful than one that failed
 * nothing.
 *
 * ---------------------------------------------------------------------------
 * These are fixtures, not proposals
 * ---------------------------------------------------------------------------
 *
 * Every palette here is hand-written and none of them is a colour anybody should
 * ship. The real palette is `THIS_PALETTE`, it is surveyed by the two files
 * named above, and nothing here can change what those two measure.
 */
import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_SEPARATION,
  INK,
  relativeLuminance,
  SCRIM_OVER_BRIGHTEST_WORLD,
  SCRIM_OVER_DARKEST_WORLD,
  SURFACE,
  SURFACE_RAISED,
  surveyPalette,
  TEXT_CONTRAST_MIN,
  THIS_PALETTE,
  UI_CONTRAST_MIN,
  type CriticalPair,
  type GuardedToken,
  type PaletteUnderSurvey,
  type Rgb,
} from '../domain/palette'

const NEAR_BLACK: Rgb = [12, 12, 12]
const WHITE: Rgb = [255, 255, 255]

const palette = (over: Partial<PaletteUnderSurvey>): PaletteUnderSurvey => ({
  tokens: [],
  pairs: [],
  knownNearCollisions: [],
  ...over,
})

const token = (over: Partial<GuardedToken>): GuardedToken => ({
  name: 'TOKEN',
  color: INK,
  role: 'text',
  on: 'scrim',
  ...over,
})

const pair = (over: Partial<CriticalPair>): CriticalPair => ({
  left: { name: 'LEFT', color: INK },
  right: { name: 'RIGHT', color: WHITE },
  why: 'a fixture',
  alsoDistinguishedBy: ['shape'],
  ...over,
})

describe('the empty palette is the control', () => {
  it('surveys to four empty lists, so an empty list means "nothing wrong" and not "nothing measured"', () => {
    // Stated first because every other test below reads "the list is empty" as
    // a pass. If the survey answered empty lists for reasons of its own, none
    // of them would mean anything.
    const survey = surveyPalette(palette({}))

    expect(survey.tokens).toStrictEqual([])
    expect(survey.pairs).toStrictEqual([])
    expect(survey.tokensBelowFloor).toStrictEqual([])
    expect(survey.collapsedPairs).toStrictEqual([])
    expect(survey.pairsWithoutRedundancy).toStrictEqual([])
    expect(survey.undeclaredNearCollisions).toStrictEqual([])
  })

  it('defaults to THIS palette, so the production measurement did not change shape', () => {
    // `surveyPalette()` grew a parameter for the tests' sake. This is the check
    // that the default is the real palette and not a fixture that leaked.
    expect(surveyPalette()).toStrictEqual(surveyPalette(THIS_PALETTE))
    expect(THIS_PALETTE.tokens.length).toBeGreaterThan(0)
  })
})

describe('a token below its contrast floor is NAMED', () => {
  it('reports a text token that cannot be read on the scrim', () => {
    // Near-black ink over a near-black backdrop. The survey has to say so, and
    // it has to say WHICH — the lists carry names rather than counts precisely
    // so that a red build tells you where to look.
    const survey = surveyPalette(palette({ tokens: [token({ name: 'GHOST', color: NEAR_BLACK })] }))

    expect(survey.tokensBelowFloor).toStrictEqual(['GHOST'])
    expect(survey.tokens[0]?.meetsFloor).toBe(false)
    expect(survey.tokens[0]?.floor).toBe(TEXT_CONTRAST_MIN)
    // …and it did not also invent a pair problem out of a palette with no pairs.
    expect(survey.collapsedPairs).toStrictEqual([])
  })

  it('holds `ui` to 3:1 and `text` to 4.5:1, which is the whole point of the role', () => {
    // The same colour, twice, differing only in role. WCAG §1.4.11 asks 3:1 of a
    // non-text mark and §1.4.3 asks 4.5:1 of text, and a palette that applied one
    // floor to both would either forbid usable icons or ship unreadable prose.
    // 3.96:1 over the worst scrim — above the `ui` floor of 3, below the `text`
    // floor of 4.5. The only band in which the two roles can disagree.
    const between: Rgb = [130, 130, 130]
    const survey = surveyPalette(
      palette({
        tokens: [
          token({ name: 'AS_TEXT', color: between, role: 'text' }),
          token({ name: 'AS_UI', color: between, role: 'ui' }),
        ],
      }),
    )

    expect(survey.tokens[0]?.floor).toBe(TEXT_CONTRAST_MIN)
    expect(survey.tokens[1]?.floor).toBe(UI_CONTRAST_MIN)
    // One colour, two verdicts. If this ever reads the same for both, the role
    // column has stopped doing anything.
    expect(survey.tokensBelowFloor).toStrictEqual(['AS_TEXT'])
  })
})

describe('a token on an OPAQUE panel is measured against that panel', () => {
  it('uses SURFACE and SURFACE_RAISED rather than the scrim, and the bound is exact', () => {
    // `GuardedToken.on` offers three backdrops and all fourteen of this
    // repository's tokens are HUD tokens, so this palette alone can never
    // exercise two of them — which is why `surfaceOf` had never run. It is not
    // dead code: an opaque panel is a DIFFERENT and easier measurement, and a
    // token drawn on one must be judged against it rather than against the
    // worst world pixel it will never sit over.
    //
    // `boundIsExact` is the tell. On the scrim the survey can only bound the
    // contrast, because the backdrop depends on the world underneath; on an
    // opaque panel the ratio is a fact, so the bound is exact by construction.
    const survey = surveyPalette(
      palette({
        tokens: [
          token({ name: 'ON_SURFACE', color: WHITE, on: 'surface' }),
          token({ name: 'ON_RAISED', color: WHITE, on: 'surfaceRaised' }),
          token({ name: 'ON_SCRIM', color: WHITE, on: 'scrim' }),
        ],
      }),
    )

    expect(survey.tokensBelowFloor).toStrictEqual([])
    for (const reading of survey.tokens) {
      expect(reading.worstContrast).toBeGreaterThan(TEXT_CONTRAST_MIN)
    }

    // The two panels are different colours, so the two readings must differ —
    // this is what fails if `surfaceOf` starts answering the same backdrop for
    // both, which is the shape a `??` fallback would have.
    expect(SURFACE).not.toStrictEqual(SURFACE_RAISED)
    expect(survey.tokens[0]?.worstContrast).not.toBe(survey.tokens[1]?.worstContrast)

    // Exact on a panel, bounded on the scrim.
    expect(survey.tokens[0]?.boundIsExact).toBe(true)
    expect(survey.tokens[1]?.boundIsExact).toBe(true)
  })

  it('`boundIsExact` is about WHERE the token sits in the scrim range, on both sides of it', () => {
    // The scrim reading is a bound taken over the scrim composited with the
    // darkest and the brightest world pixel. That bound is the true worst case
    // only when the token's own luminance sits OUTSIDE those two; BETWEEN them
    // the worst backdrop is one this survey never composites, so the number is
    // an over-estimate — and an over-estimate on a contrast floor is a token
    // that reads as passing.
    //
    // Both sides are asserted because they are different lines. The bright side
    // is the one this palette exercises (its ink is far brighter than any
    // scrim); the DARK side had never run, so nothing established that a token
    // below the range is measured exactly rather than falling through to
    // "unknown".
    const belowRange = surveyPalette(
      palette({ tokens: [token({ name: 'BELOW_RANGE', color: [10, 10, 10] })] }),
    )
    expect(relativeLuminance([10, 10, 10])).toBeLessThan(
      relativeLuminance(SCRIM_OVER_DARKEST_WORLD),
    )
    expect(belowRange.tokens[0]?.boundIsExact).toBe(true)
    // Exact, and still hopeless: a bound you can trust is not a bound that
    // passes. Both facts are reported, and they are separate columns.
    expect(belowRange.tokensBelowFloor).toStrictEqual(['BELOW_RANGE'])

    const aboveRange = surveyPalette(palette({ tokens: [token({ name: 'INK', color: INK })] }))
    expect(relativeLuminance(INK)).toBeGreaterThan(relativeLuminance(SCRIM_OVER_BRIGHTEST_WORLD))
    expect(aboveRange.tokens[0]?.boundIsExact).toBe(true)
    expect(aboveRange.tokensBelowFloor).toStrictEqual([])

    // And in between: the measurement is not trustworthy and the survey says
    // so, rather than reporting a ratio it cannot stand behind. `SCRIM` itself
    // is inside its own composited range, which is what makes this reachable.
    const midway = surveyPalette(palette({ tokens: [token({ name: 'MIDWAY', color: [20, 20, 20] })] }))
    expect(midway.tokens[0]?.boundIsExact).toBe(false)
    expect(midway.tokensBelowFloor).toStrictEqual(['MIDWAY'])
  })
})

describe('a collapsed pair is NAMED, in the form a reader can act on', () => {
  it('reports "LEFT / RIGHT" rather than an index', () => {
    // The formatter had never run, because no pair of this palette collapses.
    // It is the only part of the survey a human reads on a red build, so what
    // it produces is worth pinning: two names and a slash, not a number into an
    // array the reader does not have.
    const survey = surveyPalette(
      palette({
        pairs: [
          pair({
            left: { name: 'HEART', color: [200, 60, 60] },
            right: { name: 'SHANK', color: [201, 61, 61] },
          }),
        ],
      }),
    )

    expect(survey.collapsedPairs).toStrictEqual(['HEART / SHANK'])
    expect(survey.pairs[0]?.collapsed).toBe(true)
    expect(survey.pairs[0]?.worstSeparation).toBeLessThan(COLLAPSE_SEPARATION)
    // The mode it collapsed under is reported too, because "which dichromacy"
    // is the first question anybody asks.
    expect(survey.pairs[0]?.worstMode).toBeDefined()
  })

  it('a pair with no redundant channel is named even when its colours are fine', () => {
    // Two independent guarantees, and this is the one that is easy to lose by
    // accident: a pair can be perfectly separable today and still be a pair the
    // player can ONLY tell apart by colour. `alsoDistinguishedBy` being empty is
    // the failure, regardless of the separation.
    const survey = surveyPalette(
      palette({
        pairs: [
          pair({
            left: { name: 'XP_FILL', color: [40, 200, 90] },
            right: { name: 'STATUS_ALERT', color: [230, 90, 70] },
            alsoDistinguishedBy: [],
          }),
        ],
      }),
    )

    expect(survey.collapsedPairs).toStrictEqual([])
    expect(survey.pairsWithoutRedundancy).toStrictEqual(['XP_FILL / STATUS_ALERT'])
  })
})

describe('the all-pairs sweep finds collisions nobody declared', () => {
  it('reports a colliding pair that is not in the known list, with the separation it measured', () => {
    // The sweep exists because `CRITICAL_PAIRS` is a list somebody wrote, and
    // the pairs a player has to tell apart is a list nobody can finish. This
    // path had never executed — the push at the bottom of the double loop — so
    // the sweep had never been observed finding anything at all.
    const survey = surveyPalette(
      palette({
        tokens: [
          token({ name: 'ALPHA', color: [90, 140, 200] }),
          token({ name: 'BETA', color: [91, 141, 201] }),
        ],
      }),
    )

    expect(survey.undeclaredNearCollisions).toHaveLength(1)
    expect(survey.undeclaredNearCollisions[0]?.left).toBe('ALPHA')
    expect(survey.undeclaredNearCollisions[0]?.right).toBe('BETA')
    expect(survey.undeclaredNearCollisions[0]?.separation).toBeLessThan(COLLAPSE_SEPARATION)
  })

  it('a DECLARED collision is excused in either order, because the sweep order is not the declaration order', () => {
    // The sweep walks the token list; a declaration names two tokens in the
    // order they read in a sentence. The two have no reason to agree, and a
    // one-directional membership test would start reporting a "finding" that is
    // written down two hundred lines above it the day somebody reorders the
    // token list — which is a red build with a paragraph explaining why it is
    // not a problem, i.e. the kind that gets muted.
    //
    // Both orders are asserted against the SAME pair of colours, so what is
    // being tested is the symmetry and not the colours.
    const colliding = [
      token({ name: 'ALPHA', color: [90, 140, 200] }),
      token({ name: 'BETA', color: [91, 141, 201] }),
    ]
    const why = 'a fixture: these two are never a distinction the player has to make'

    const declaredForwards = surveyPalette(
      palette({ tokens: colliding, knownNearCollisions: [{ left: 'ALPHA', right: 'BETA', why }] }),
    )
    const declaredBackwards = surveyPalette(
      palette({ tokens: colliding, knownNearCollisions: [{ left: 'BETA', right: 'ALPHA', why }] }),
    )

    expect(declaredForwards.undeclaredNearCollisions).toStrictEqual([])
    expect(declaredBackwards.undeclaredNearCollisions).toStrictEqual([])

    // A declaration about some OTHER pair excuses nothing, so the check is
    // membership and not "the list is non-empty".
    const unrelated = surveyPalette(
      palette({ tokens: colliding, knownNearCollisions: [{ left: 'ALPHA', right: 'GAMMA', why }] }),
    )
    expect(unrelated.undeclaredNearCollisions).toHaveLength(1)
  })
})
