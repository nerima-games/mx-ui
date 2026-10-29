import { Cause, Effect, Exit, Option, Schema } from 'effect'

export const finishAchievementToastSubscription = (
  exit: Exit.Exit<void, Schema.SchemaError>,
): Effect.Effect<void, Schema.SchemaError> => {
  if (Exit.isSuccess(exit)) {
    return Effect.void
  }

  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    return Effect.fail(failure.value)
  }

  return Effect.void
}
