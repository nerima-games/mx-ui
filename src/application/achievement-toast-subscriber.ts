import { DomainEventBus, DomainEventBusLayer, EventSubscriberCapacitySchema } from '@nerima-games/mc-sim'
import { Effect, Fiber, Schema, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { achievementToastFromEvent, type AchievementToast } from '../domain/achievement-toast.js'

export const ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY: Schema.Schema.Type<
  typeof EventSubscriberCapacitySchema
> = Schema.decodeUnknownSync(EventSubscriberCapacitySchema)(64)

export const AchievementToastEventBusLayer: ReturnType<typeof DomainEventBusLayer> = DomainEventBusLayer(
  ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY,
)

export type AchievementToastSubscription = Readonly<{
  close: Effect.Effect<void>
}>

export const startAchievementToastSubscriber: (
  onToast: (toast: AchievementToast) => void,
) => Effect.Effect<AchievementToastSubscription, never, DomainEventBus | Scope.Scope> = (onToast) =>
  Effect.gen(function* () {
    const bus = yield* DomainEventBus
    const fiber = yield* Stream.runForEach(bus.events, (event) => {
      const toast = achievementToastFromEvent(event)
      return typeof toast === 'undefined' ? Effect.void : Effect.sync(() => onToast(toast))
    }).pipe(Effect.forkScoped({ startImmediately: true }))

    return { close: Fiber.interrupt(fiber) }
  })
