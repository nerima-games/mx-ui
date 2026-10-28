import { DomainEventSchema } from '@nerima-games/mc-kernel'
import { Deferred, Effect, Schema } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { DomainEventBus } from '@nerima-games/mc-sim'
import {
  ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY,
  AchievementToastEventBusLayer,
  startAchievementToastSubscriber,
} from '../src/application/achievement-toast-subscriber'
import type { AchievementToast } from '../src/domain/achievement-toast'

const achievementEvent = () =>
  Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'AchievementUnlocked',
    tick: 7,
    player: 'player:one',
    achievement: 'minecraft:story/mine_stone',
  })

const nonAchievementEvent = () =>
  Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'LevelUp',
    tick: 7,
    entity: 'player:one',
    position: { dimension: 'overworld', x: 0, y: 64, z: 0 },
    level: 1,
  })

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
        yield* bus.publish(achievementEvent())

        const toast = yield* Deferred.await(delivered)
        expect(received).toStrictEqual([toast])
        expect(toast.title).toBe('Stone Age')

        yield* subscription.close
        yield* bus.publish(achievementEvent())

        expect(received).toStrictEqual([toast])
      }),
    ).pipe(Effect.provide(AchievementToastEventBusLayer)),
  )
})
