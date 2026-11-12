import { Result, Schema } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  HudPresentationSnapshotSchema,
  hudPresentationView,
  type HudPresentationSnapshot,
} from '../src/domain/hud-presentation.js'

const TICKS_PER_SECOND = 60
const PLAN_DAY_LENGTH_TICKS = 1_200 * TICKS_PER_SECOND
const CUSTOM_DAY_LENGTH_TICKS = 400 * TICKS_PER_SECOND
const PLAN_NIGHT_START_TICK = Math.round((PLAN_DAY_LENGTH_TICKS * 55) / 100)
const PLAN_WARNING_START_TICK = PLAN_NIGHT_START_TICK - 30 * TICKS_PER_SECOND
const CUSTOM_NIGHT_START_TICK = Math.round((CUSTOM_DAY_LENGTH_TICKS * 55) / 100)
const CUSTOM_WARNING_START_TICK = CUSTOM_NIGHT_START_TICK - 30 * TICKS_PER_SECOND
const STATUS_CATEGORIES = ['positive', 'negative', 'neutral'] as const
const EFFECT_ICON = {
  negative: 'effect-negative',
  neutral: 'effect-neutral',
  positive: 'effect-positive',
} as const
const EFFECT_LABEL = {
  negative: 'hud.effect.negative',
  neutral: 'hud.effect.neutral',
  positive: 'hud.effect.positive',
} as const
const DEATH_CAUSES = [
  'fall', 'lava', 'cactus', 'in_fire', 'on_fire', 'drowning', 'suffocation', 'starvation',
  'mob', 'projectile', 'explosion', 'void', 'ender_pearl', 'poison', 'generic', 'lightning',
] as const
const DEATH_CAUSE_LABEL = {
  cactus: 'hud.death-cause.cactus',
  drowning: 'hud.death-cause.drowning',
  ender_pearl: 'hud.death-cause.ender-pearl',
  explosion: 'hud.death-cause.explosion',
  fall: 'hud.death-cause.fall',
  generic: 'hud.death-cause.generic',
  in_fire: 'hud.death-cause.in-fire',
  lava: 'hud.death-cause.lava',
  lightning: 'hud.death-cause.lightning',
  mob: 'hud.death-cause.mob',
  on_fire: 'hud.death-cause.on-fire',
  poison: 'hud.death-cause.poison',
  projectile: 'hud.death-cause.projectile',
  suffocation: 'hud.death-cause.suffocation',
  starvation: 'hud.death-cause.starvation',
  void: 'hud.death-cause.void',
} as const

const decode = (input: unknown): Result.Result<HudPresentationSnapshot, Schema.SchemaError> =>
  Schema.decodeUnknownResult(HudPresentationSnapshotSchema)(input)

describe('HUD presentation snapshot schema', () => {
  it('accepts generated time snapshots and preserves omitted values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(400, 1_200),
        fc.integer({ min: 0, max: PLAN_DAY_LENGTH_TICKS * 12 }),
        (dayLengthSeconds, ticks) => {
          const dayLengthTicks = dayLengthSeconds * TICKS_PER_SECOND
          const result = decode({ time: { dayLengthTicks, ticks } })
          expect(Result.isSuccess(result)).toBe(true)
          if (Result.isSuccess(result)) {
            const tickInDay = ticks % dayLengthTicks
            const nightStart = Math.round((dayLengthTicks * 55) / 100)
            expect(hudPresentationView(result.success)).toStrictEqual({
              sunsetWarning:
                tickInDay >= nightStart - 30 * TICKS_PER_SECOND && tickInDay < nightStart,
              ...(tickInDay >= nightStart - 30 * TICKS_PER_SECOND && tickInDay < nightStart
                ? { sunsetWarningSeconds: Math.ceil((nightStart - tickInDay) / TICKS_PER_SECOND) }
                : {}),
              ...(tickInDay >= nightStart && tickInDay < Math.round((dayLengthTicks * 95) / 100)
                ? { timeIcon: 'time-night', timeLabel: 'hud.time.night' }
                : tickInDay >= Math.round((dayLengthTicks * 45) / 100) && tickInDay < nightStart
                  ? { timeIcon: 'time-dusk', timeLabel: 'hud.time.dusk' }
                  : { timeIcon: 'time-day', timeLabel: 'hud.time.day' }),
            })
          }
        },
      ),
      { numRuns: 250 },
    )
  })

  it.each([
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: PLAN_WARNING_START_TICK - 1, warning: false },
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: PLAN_WARNING_START_TICK, warning: true },
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: PLAN_NIGHT_START_TICK - 1, warning: true },
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: PLAN_NIGHT_START_TICK, warning: false },
    { dayLengthTicks: CUSTOM_DAY_LENGTH_TICKS, ticks: CUSTOM_WARNING_START_TICK - 1, warning: false },
    { dayLengthTicks: CUSTOM_DAY_LENGTH_TICKS, ticks: CUSTOM_WARNING_START_TICK, warning: true },
    { dayLengthTicks: CUSTOM_DAY_LENGTH_TICKS, ticks: CUSTOM_NIGHT_START_TICK - 1, warning: true },
    { dayLengthTicks: CUSTOM_DAY_LENGTH_TICKS, ticks: CUSTOM_NIGHT_START_TICK, warning: false },
  ])('marks the warning boundary at $dayLengthTicks/$ticks', ({ dayLengthTicks, ticks, warning }) => {
    const result = decode({ time: { dayLengthTicks, ticks } })
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(hudPresentationView(result.success).sunsetWarning).toBe(warning)
      if (warning) {
        expect(hudPresentationView(result.success).sunsetWarningSeconds).toBe(
          Math.ceil((Math.round((dayLengthTicks * 55) / 100) - ticks) / TICKS_PER_SECOND),
        )
      }
    }
  })

  it.each([
    { dayLengthTicks: 0, ticks: 0 },
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS + 1, ticks: 0 },
    { dayLengthTicks: Math.ceil((30 * TICKS_PER_SECOND - 0.5) / 0.55) - 1, ticks: 0 },
    { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: -1 },
  ])('rejects out-of-domain time values $dayLengthTicks/$ticks', ({ dayLengthTicks, ticks }) => {
    expect(Result.isFailure(decode({ time: { dayLengthTicks, ticks } }))).toBe(true)
  })

  it('accepts the shortest representable day length and rejects one tick below it', () => {
    const shortest = Math.ceil((30 * TICKS_PER_SECOND - 0.5) / 0.55)
    expect(Result.isSuccess(decode({ time: { dayLengthTicks: shortest, ticks: 0 } }))).toBe(true)
    expect(Result.isFailure(decode({ time: { dayLengthTicks: shortest - 1, ticks: 0 } }))).toBe(true)
    expect(Result.isSuccess(decode({ time: { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: 0 } }))).toBe(true)
  })

  it('accepts the largest safe absolute tick and rejects the first unsafe tick', () => {
    expect(Result.isSuccess(decode({ time: { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: Number.MAX_SAFE_INTEGER } }))).toBe(true)
    expect(Result.isFailure(decode({ time: { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: Number.MAX_SAFE_INTEGER + 1 } }))).toBe(true)
  })

  it('accepts supported meter/effect limits and rejects the first value beyond each limit', () => {
    expect(Result.isSuccess(decode({ absorptionPoints: 400 }))).toBe(true)
    expect(Result.isFailure(decode({ absorptionPoints: 401 }))).toBe(true)
    expect(Result.isSuccess(decode({ armor: { current: 400, max: 400 } }))).toBe(true)
    expect(Result.isFailure(decode({ armor: { current: 401, max: 401 } }))).toBe(true)
    const maxEffects = Array.from({ length: 40 }, () => ({ category: 'neutral', remainingSecs: 1 }))
    expect(Result.isSuccess(decode({ statusEffects: maxEffects }))).toBe(true)
    expect(Result.isFailure(decode({ statusEffects: [...maxEffects, { category: 'neutral', remainingSecs: 1 }] }))).toBe(true)
  })

  it('rejects unsupported status values and extra fields instead of inventing or ignoring data', () => {
    expect(Result.isFailure(decode({ statusEffects: [{ category: 'wither', remainingSecs: 4 }] }))).toBe(true)
    expect(Result.isFailure(decode({ unexpected: 'value' }))).toBe(true)
    expect(Result.isFailure(decode({ time: { dayLengthTicks: PLAN_DAY_LENGTH_TICKS, ticks: 0, day: 0 } }))).toBe(true)
    expect(Result.isFailure(decode({ deathCause: 'unknown' }))).toBe(true)
    expect(Result.isFailure(decode({ statusEffects: [{ category: 'positive', remainingSecs: 0 }] }))).toBe(true)
    expect(Result.isFailure(decode({ armor: { current: 21, max: 20 } }))).toBe(true)
    expect(Result.isFailure(decode({ armor: { current: 1.5, max: 20 } }))).toBe(true)
    expect(Result.isFailure(decode({ oxygen: { current: 1, max: 0 } }))).toBe(true)
    expect(Result.isFailure(decode({ absorptionPoints: 0 }))).toBe(true)
    expect(Result.isFailure(decode({
      position: { xCoordinate: 0, yCoordinate: Number.POSITIVE_INFINITY, zCoordinate: 0 },
    }))).toBe(true)
  })

  it('does not synthesize absent status, cause, position, or time values', () => {
    const result = decode({})
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(hudPresentationView(result.success)).toStrictEqual({})
    }
  })

  it('property: valid armor and oxygen meters derive the independently calculated icon states', () => {
    const expectedStates = (current: number, max: number): ReadonlyArray<'empty' | 'full' | 'half'> =>
      Array.from({ length: Math.ceil(max / 2) }, (_item, index) => {
        const remaining = current - index * 2
        if (remaining >= 2) {
          return 'full'
        }
        if (remaining === 1) {
          return 'half'
        }
        return 'empty'
      })

    const meterArbitrary = fc.integer({ min: 1, max: 40 }).chain((max) =>
      fc.integer({ min: 0, max }).map((current) => ({ current, max })),
    )
    fc.assert(
      fc.property(meterArbitrary, meterArbitrary, (armor, oxygen) => {
          const decoded = decode({
            armor,
            oxygen,
          })
          expect(Result.isSuccess(decoded)).toBe(true)
          if (Result.isSuccess(decoded)) {
            const view = hudPresentationView(decoded.success)
            expect(view.armor?.states).toStrictEqual(expectedStates(armor.current, armor.max))
            expect(view.oxygen?.states).toStrictEqual(expectedStates(oxygen.current, oxygen.max))
          }
      }),
      { numRuns: 100 },
    )
  })

  it('property: supplied effect categories map to localized generic labels without exposing host IDs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            category: fc.constantFrom(...STATUS_CATEGORIES),
            remainingSecs: fc.double({ min: 0.001, max: 3_600, noNaN: true }),
          }),
          { maxLength: 12 },
        ),
        (effects) => {
          const decoded = decode({ statusEffects: effects })
          expect(Result.isSuccess(decoded)).toBe(true)
          if (Result.isSuccess(decoded)) {
            expect(hudPresentationView(decoded.success).effects).toStrictEqual(effects.map((effect) => ({
              category: effect.category,
              icon: EFFECT_ICON[effect.category],
              label: EFFECT_LABEL[effect.category],
              remainingSeconds: Math.ceil(effect.remainingSecs),
            })))
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('property: every supported death cause maps through the explicit localized catalog', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DEATH_CAUSES), (deathCause) => {
        const decoded = decode({ deathCause })
        expect(Result.isSuccess(decoded)).toBe(true)
        if (Result.isSuccess(decoded)) {
          expect(hudPresentationView(decoded.success).deathCause).toBe(DEATH_CAUSE_LABEL[deathCause])
        }
      }),
      { numRuns: 100 },
    )
  })

  it('property: coordinates are formatted to one decimal place without defaulting malformed values', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
          fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
          fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        ),
        ([xCoordinate, yCoordinate, zCoordinate]) => {
          const decoded = decode({ position: { xCoordinate, yCoordinate, zCoordinate } })
          expect(Result.isSuccess(decoded)).toBe(true)
          if (Result.isSuccess(decoded)) {
            expect(hudPresentationView(decoded.success).coordinates).toBe(
              `${xCoordinate.toFixed(1)} / ${yCoordinate.toFixed(1)} / ${zCoordinate.toFixed(1)}`,
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
