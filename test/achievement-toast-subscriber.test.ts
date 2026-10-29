import { DomainEventSchema } from '@nerima-games/mc-kernel'
import { Deferred, Effect, Exit, Result, Schema } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { DomainEventBus } from '@nerima-games/mc-sim'
import {
  ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY,
  AchievementToastEventBusLayer,
  startAchievementToastSubscriber,
} from '../src/application/achievement-toast-subscriber'
import type { AchievementToast } from '../src/domain/achievement-toast'
import { achievementEvent, untrustedAchievementEvent } from './helpers/achievement-event'
import { finishAchievementToastSubscription } from '../src/application/achievement-toast-subscription'

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

  it('preserves schema failures and ignores non-schema fiber causes on close', () => {
    const invalidEvent = Schema.decodeUnknownResult(DomainEventSchema)(
      untrustedAchievementEvent('example:custom/achievement'),
    )
    if (Result.isSuccess(invalidEvent)) {
      throw new Error('expected an unsupported achievement id to fail decoding')
    }

    const schemaFailure = Effect.runSync(
      Effect.result(finishAchievementToastSubscription(Exit.fail(invalidEvent.failure))),
    )
    const defectExit = Effect.runSync(Effect.exit(Effect.die('subscriber defect')))
    const ignoredDefect = Effect.runSync(
      Effect.result(finishAchievementToastSubscription(defectExit)),
    )

    expect(Result.isFailure(schemaFailure)).toBe(true)
    if (Result.isFailure(schemaFailure)) {
      expect(schemaFailure.failure).toBeInstanceOf(Schema.SchemaError)
    }
    expect(Result.isSuccess(ignoredDefect)).toBe(true)
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
        yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))

        const toast = yield* Deferred.await(delivered)
        expect(received).toStrictEqual([toast])
        expect(toast.title).toBe('Stone Age')

        yield* subscription.close
        yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))

        expect(received).toStrictEqual([toast])
      }),
    ).pipe(Effect.provide(AchievementToastEventBusLayer)),
  )

  it('rejects unsupported IDs before the subscriber can receive the event', () => {
    const result = Schema.decodeUnknownResult(DomainEventSchema)(
      untrustedAchievementEvent('example:custom/achievement'),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(Schema.SchemaError)
    }
  })
})
