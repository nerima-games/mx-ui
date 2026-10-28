import { DomainEventSchema } from '@nerima-games/mc-kernel'
import { Deferred, Effect, Result, Schema } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { DomainEventBus } from '@nerima-games/mc-sim'
import {
  ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY,
  AchievementToastEventBusLayer,
  startAchievementToastSubscriber,
} from '../src/application/achievement-toast-subscriber'
import type { AchievementToast } from '../src/domain/achievement-toast'
import { achievementEventFromLegacySim } from './helpers/achievement-event'

const nonAchievementEvent = () => {
  const event = Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'LevelUp',
    tick: 7,
    entity: 'player:one',
    position: { dimension: 'overworld', x: 0, y: 64, z: 0 },
    level: 1,
  })
  if (event['_tag'] !== 'LevelUp') {
    throw new Error('expected a level-up event')
  }

  return event
}

describe('achievement toast event subscriber', () => {
  it('uses the decoded capacity 64', () => {
    expect(ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY).toBe(64)
  })

  it.effect('subscribes before publication and closes with its scope owner', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bus = yield* DomainEventBus
        const received: Array<AchievementToast> = []
        const delivered = Deferred.makeUnsafe<AchievementToast>()
        const subscription = yield* startAchievementToastSubscriber((toast) => {
          received.push(toast)
          Deferred.doneUnsafe(delivered, Effect.succeed(toast))
        })

        yield* bus.publish(nonAchievementEvent())
        yield* bus.publish(achievementEventFromLegacySim('minecraft:story/mine_stone'))

        const toast = yield* Deferred.await(delivered)
        expect(received).toStrictEqual([toast])
        expect(toast.title).toBe('Stone Age')

        yield* subscription.close
        yield* bus.publish(achievementEventFromLegacySim('minecraft:story/mine_stone'))

        expect(received).toStrictEqual([toast])
      }),
    ).pipe(Effect.provide(AchievementToastEventBusLayer)),
  )

  it.effect('reports SchemaError through join for an unsupported legacy achievement ID', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bus = yield* DomainEventBus
        const received: Array<AchievementToast> = []
        const subscription = yield* startAchievementToastSubscriber((toast) => received.push(toast))

        yield* bus.publish(achievementEventFromLegacySim('example:custom/achievement'))
        const result = yield* Effect.result(subscription.join)

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(Schema.SchemaError)
        }
        expect(received).toStrictEqual([])
      }),
    ).pipe(Effect.provide(AchievementToastEventBusLayer)),
  )
})
