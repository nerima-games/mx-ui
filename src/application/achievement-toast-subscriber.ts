import type * as Scope from 'effect/Scope'
import { type AchievementToast, achievementToastFromEvent } from '../domain/achievement-toast.js'
import { Cause, Effect, Exit, Fiber, Option, Schema, Stream } from 'effect'
import {
  DomainEventBus,
  EventSubscriberCapacitySchema,
  DomainEventBusLayer as domainEventBusLayer,
} from '@nerima-games/mc-sim'

const { decodeUnknownSync } = Schema
const TOAST_EVENT_SUBSCRIBER_CAPACITY = 64

export const ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY: Schema.Schema.Type<
  typeof EventSubscriberCapacitySchema
> = decodeUnknownSync(EventSubscriberCapacitySchema)(TOAST_EVENT_SUBSCRIBER_CAPACITY)

export const AchievementToastEventBusLayer: ReturnType<typeof domainEventBusLayer> = domainEventBusLayer(
  ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY,
)

export type AchievementToastSubscription = Readonly<{
  close: Effect.Effect<void, Schema.SchemaError>
  join: Effect.Effect<void, Schema.SchemaError>
}>

export const startAchievementToastSubscriber: (
  onToast: (toast: AchievementToast) => void,
) => Effect.Effect<AchievementToastSubscription, never, DomainEventBus | Scope.Scope> = (onToast) =>
  Effect.gen(function* subscribeToAchievementEvents() {
    const bus = yield* DomainEventBus
    const fiber = yield* Stream.runForEach(bus.events, (event) =>
      Effect.flatMap(achievementToastFromEvent(event), (toast) => {
        if (toast === null) {
          return Effect.void
        }

        return Effect.sync(() => onToast(toast))
      }),
    ).pipe(Effect.forkScoped({ startImmediately: true }))

    const close = Effect.flatMap(Fiber.interrupt(fiber), () =>
      Effect.flatMap(Fiber.await(fiber), (exit) => {
        if (Exit.isSuccess(exit)) {
          return Effect.void
        }

        const failure = Cause.findErrorOption(exit.cause)
        if (Option.isSome(failure)) {
          return Effect.fail(failure.value)
        }

        return Effect.void
      }),
    )

    return { close, join: Fiber.join(fiber) }
  })
