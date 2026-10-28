import { DeltaTimeSecs, DomainEventSchema } from '@nerima-games/mc-kernel'
import { BrandError } from 'effect/Brand'
import { Effect, Result, Schema } from 'effect'
import fc from 'fast-check'
import { describe, it, expect } from 'vitest'
import { achievementEventFromLegacySim } from './helpers/achievement-event'
import {
  AchievementToastIconSchema,
  AchievementToastSchema,
  AchievementToastTitleSchema,
  achievementToastFromEvent,
} from '../src/domain/achievement-toast'
import {
  debugOverlayModel,
  FramesPerSecondSchema,
  type DebugOverlaySnapshot,
} from '../src/domain/debug-overlay'

const toastPayload = {
  achievement: 'minecraft:story/mine_stone',
  icon: 'minecraft:nether_star',
  player: 'player:property-test',
  tick: 7,
  title: 'Example achievement',
}

const toastFields = ['achievement', 'icon', 'player', 'tick', 'title'] as const
const decodeToast = Schema.decodeUnknownSync(AchievementToastSchema, {
  onExcessProperty: 'error',
})

const toastWithout = (field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(toastPayload).filter(([key]) => key !== field))

const frame = (deltaSecs: number): NonNullable<DebugOverlaySnapshot['frame']> => ({
  deltaSecs: DeltaTimeSecs(deltaSecs),
  cameraPosition: { worldX: 0, worldY: 0, worldZ: 0 },
})

const emptySnapshot: DebugOverlaySnapshot = {
  cameraPose: undefined,
  dimension: undefined,
  worldTime: undefined,
  frame: undefined,
  gpuTimingSupported: undefined,
  latestGpuTimeMs: undefined,
  qualityPreset: undefined,
}

describe('D domain properties', () => {
  it('rejects generated missing, null, and extra toast fields with SchemaError', () => {
    fc.assert(
      fc.property(fc.constantFrom(...toastFields), (field) => {
        expect(() => decodeToast(toastWithout(field))).toThrow(Schema.SchemaError)
      }),
    )

    fc.assert(
      fc.property(fc.constantFrom(...toastFields), (field) => {
        expect(() => decodeToast({ ...toastPayload, [field]: null })).toThrow(Schema.SchemaError)
      }),
    )

    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((key) => !toastFields.some((field) => field === key)),
        (extraKey) => {
          expect(() => decodeToast({ ...toastPayload, [extraKey]: true })).toThrow(
            Schema.SchemaError,
          )
        },
      ),
    )
  })

  it('decodes every generated non-empty toast icon and title', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (label) => {
        expect(Schema.decodeUnknownSync(AchievementToastIconSchema)(label)).toBe(label)
        expect(Schema.decodeUnknownSync(AchievementToastTitleSchema)(label)).toBe(label)
      }),
    )
  })

  it('returns SchemaError for generated IDs outside the kernel catalog', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (suffix) => {
        const event = achievementEventFromLegacySim(`example:${suffix}`)
        const result = Effect.runSync(Effect.result(achievementToastFromEvent(event)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(Schema.SchemaError)
        }
      }),
    )
  })

  it('rejects generated unknown event tags with SchemaError', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (suffix) => {
        expect(() =>
          Schema.decodeUnknownSync(DomainEventSchema)({
            _tag: `example:${suffix}`,
            tick: 7,
            player: 'player:property-test',
            achievement: 'minecraft:story/mine_stone',
          }),
        ).toThrow(Schema.SchemaError)
      }),
    )
  })

  it('rejects generated negative tick values with SchemaError', () => {
    fc.assert(
      fc.property(fc.integer({ max: -1 }), (tick) => {
        expect(() =>
          Schema.decodeUnknownSync(DomainEventSchema)({
            _tag: 'AchievementUnlocked',
            tick,
            player: 'player:property-test',
            achievement: 'minecraft:story/mine_stone',
          }),
        ).toThrow(Schema.SchemaError)
      }),
    )
  })

  it('covers zero and the finite frame-delta boundaries', () => {
    fc.assert(
      fc.property(fc.constantFrom(0, Number.MIN_VALUE, Number.MAX_VALUE), (deltaSecs) => {
        const model = debugOverlayModel({ ...emptySnapshot, frame: frame(deltaSecs) })
        const fps = 1 / deltaSecs

        expect(model.frameDeltaSecs).toBe(deltaSecs)
        if (deltaSecs === 0 || !Number.isFinite(fps)) {
          expect(model.fps).toBeNull()
        } else {
          expect(Schema.decodeUnknownSync(FramesPerSecondSchema)(model.fps)).toBe(fps)
        }
      }),
    )
  })

  it('rejects generated frame deltas immediately outside the valid range', () => {
    fc.assert(
      fc.property(
        fc.double({ max: -Number.MIN_VALUE, noNaN: true, noDefaultInfinity: true }),
        (deltaSecs) => {
          expect(() => DeltaTimeSecs(deltaSecs)).toThrow(BrandError)
        },
      ),
    )
  })

  it('projects every generated valid frame delta to a schema-decoded FPS when finite', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true, noDefaultInfinity: true }),
        (deltaSecs) => {
          const model = debugOverlayModel({ ...emptySnapshot, frame: frame(deltaSecs) })
          const fps = 1 / deltaSecs

          expect(model.frameDeltaSecs).toBe(deltaSecs)
          if (deltaSecs === 0 || !Number.isFinite(fps)) {
            expect(model.fps).toBeNull()
          } else {
            expect(Schema.decodeUnknownSync(FramesPerSecondSchema)(model.fps)).toBe(fps)
          }
        },
      ),
    )
  })
})
