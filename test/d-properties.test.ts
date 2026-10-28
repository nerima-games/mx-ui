import { DomainEventSchema, type DomainEvent } from '@nerima-games/mc-kernel'
import { DeltaTimeSecs } from '@nerima-games/mc-kernel'
import { Schema } from 'effect'
import fc from 'fast-check'
import { describe, it, expect } from 'vitest'
import type { ProductionFrame } from '@nerima-games/mc-render'
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
  if (event._tag !== 'AchievementUnlocked') {
    throw new Error('expected an achievement event')
  }
  return event
}

const frame = (deltaSecs: number): ProductionFrame => ({
  elapsedSecs: 1,
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
  it('decodes every generated non-empty toast icon and title', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (label) => {
        expect(Schema.decodeUnknownSync(AchievementToastIconSchema)(label)).toBe(label)
        expect(Schema.decodeUnknownSync(AchievementToastTitleSchema)(label)).toBe(label)
      }),
    )
  })

  it('projects generated unknown achievement IDs through the strict toast schema', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (suffix) => {
        const achievement = `example:${suffix}`
        const projected = achievementToastFromEvent(achievementEvent(achievement))
        const decoded = Schema.decodeUnknownSync(AchievementToastSchema, {
          onExcessProperty: 'error',
        })(projected)

        expect(decoded.achievement).toBe(achievement)
        expect(decoded.title).toBe(achievement)
        expect(decoded.icon).toBe('minecraft:nether_star')
      }),
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
            expect(model.fps).toBeUndefined()
          } else {
            expect(Schema.decodeUnknownSync(FramesPerSecondSchema)(model.fps)).toBe(fps)
          }
        },
      ),
    )
  })
})
