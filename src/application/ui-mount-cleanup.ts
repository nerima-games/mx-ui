import { Effect, Result, Schema } from 'effect'
import { UiMountError } from './ui-mount-error.js'

export const finishToastSubscriptionClose = (
  result: Result.Result<void, Schema.SchemaError>,
): Effect.Effect<void, Schema.SchemaError> => {
  if (Result.isFailure(result)) {
    return Effect.fail(result.failure)
  }
  return Effect.void
}

export const finishUiMountCleanup = (
  subscriptionResult: Result.Result<void, Schema.SchemaError>,
  viewsResult: Result.Result<void, UiMountError>,
): Effect.Effect<void, UiMountError | Schema.SchemaError> => {
  if (Result.isFailure(subscriptionResult) && Result.isFailure(viewsResult)) {
    return Effect.fail(
      new UiMountError(viewsResult.failure.message, {
        cause: {
          subscriptionError: subscriptionResult.failure,
          viewsError: viewsResult.failure,
        },
      }),
    )
  }
  if (Result.isFailure(viewsResult)) {
    return Effect.fail(viewsResult.failure)
  }
  if (Result.isFailure(subscriptionResult)) {
    return Effect.fail(subscriptionResult.failure)
  }
  return Effect.void
}
