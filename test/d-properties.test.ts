import { DeltaTimeSecs, DomainEventSchema, type DomainEvent } from '@nerima-games/mc-kernel'
import { BrandError } from 'effect/Brand'
import { Schema } from 'effect'
import fc from 'fast-check'
import { describe, it, expect } from 'vitest'
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

type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>

const achievementEvent = (achievement: string): AchievementUnlockedEvent => {
  const event = Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'AchievementUnlocked',
    tick: 7,
    player: 'player:property-test',
    achievement,
  })
  if (event['_tag'] !== 'AchievementUnlocked') {
    throw new Error('expected an achievement event')
  }
  return event
}

const toastPayload = {
  achievement: 'example:achievement',
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

  it('does not project generated achievement IDs without display metadata', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (suffix) => {
        const achievement = `example:${suffix}`
        const projected = achievementToastFromEvent(achievementEvent(achievement))

        expect(projected).toBeNull()
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
            achievement: 'example:achievement',
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
            achievement: 'example:achievement',
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
