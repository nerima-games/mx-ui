import { type Brand, Result, Schema } from 'effect'

export type ChatText = string & Brand.Brand<'ChatText'>
export const ChatTextSchema: Schema.Codec<ChatText, string> = Schema.NonEmptyString.pipe(Schema.brand('ChatText'))

export type ChatKeyboardCode = string & Brand.Brand<'ChatKeyboardCode'>
export const ChatKeyboardCodeSchema: Schema.Codec<ChatKeyboardCode, string> = Schema.String.pipe(
  Schema.brand('ChatKeyboardCode'),
)

export type ChatHistoryIndex = number & Brand.Brand<'ChatHistoryIndex'>
export const ChatHistoryIndexSchema: Schema.Codec<ChatHistoryIndex, number> = Schema.Int.pipe(
  Schema.brand('ChatHistoryIndex'),
)

export type LoadingProgressValue = number & Brand.Brand<'LoadingProgressValue'>
export const LoadingProgressValueSchema: Schema.Codec<LoadingProgressValue, number> = Schema.Number.pipe(
  Schema.brand('LoadingProgressValue'),
)

export type WorldSeedText = string & Brand.Brand<'WorldSeedText'>
export const WorldSeedTextSchema: Schema.Codec<WorldSeedText, string> = Schema.String.pipe(Schema.brand('WorldSeedText'))
export const decodeWorldSeedText: (input: unknown) => Result.Result<WorldSeedText, Schema.SchemaError> =
  Schema.decodeUnknownResult(WorldSeedTextSchema)

export type WorldTypeId = string & Brand.Brand<'WorldTypeId'>
export const WorldTypeIdSchema: Schema.Codec<WorldTypeId, string> = Schema.String.pipe(Schema.brand('WorldTypeId'))
export const decodeWorldTypeId: (input: unknown) => Result.Result<WorldTypeId, Schema.SchemaError> =
  Schema.decodeUnknownResult(WorldTypeIdSchema)

export type WorldSeedValue = number & Brand.Brand<'WorldSeedValue'>
export const WorldSeedValueSchema: Schema.Codec<WorldSeedValue, number> = Schema.Int.check(
  Schema.isBetween({ maximum: Number.MAX_SAFE_INTEGER, minimum: -Number.MAX_SAFE_INTEGER }),
).pipe(Schema.brand('WorldSeedValue'))

export type WorldNameText = string & Brand.Brand<'WorldNameText'>
export const WorldNameTextSchema: Schema.Codec<WorldNameText, string> = Schema.String.pipe(Schema.brand('WorldNameText'))
export const decodeWorldNameText: (input: unknown) => Result.Result<WorldNameText, Schema.SchemaError> =
  Schema.decodeUnknownResult(WorldNameTextSchema)
