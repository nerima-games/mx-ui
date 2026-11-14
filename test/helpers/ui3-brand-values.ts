import {
  SaveSliceIdSchema,
  SaveVersionSchema,
  SimulationTickSchema,
  WorldIdSchema,
  MonotonicTimeSecs,
  DeltaTimeSecs,
} from '@nerima-games/mc-kernel'
import { Schema } from 'effect'
import type { ChatText, ChatKeyboardCode, ChatHistoryIndex } from '../../src/domain/chat'
import type { LoadingProgressValue } from '../../src/domain/loading-screen'
import {
  type SaveSliceId,
  type SaveVersion,
  type WorldId,
  type WorldSeedText,
  type WorldSeedValue,
  type WorldNameText,
  type WorldTypeId,
} from '../../src/domain/main-menu'
import { UiMessageTextSchema, type UiMessageText } from '../../src/domain/ui-language'
import {
  ChatHistoryIndexSchema,
  ChatKeyboardCodeSchema,
  ChatTextSchema,
  LoadingProgressValueSchema,
  WorldSeedTextSchema,
  WorldSeedValueSchema,
  WorldNameTextSchema,
  WorldTypeIdSchema,
} from '../../src/domain/ui3-brand-schemas'

type Decoder<Value> = (input: unknown) => Value

export const asChatText: Decoder<ChatText> = Schema.decodeUnknownSync(ChatTextSchema)
export const asChatKeyboardCode: Decoder<ChatKeyboardCode> = Schema.decodeUnknownSync(ChatKeyboardCodeSchema)
export const asChatHistoryIndex: Decoder<ChatHistoryIndex> = Schema.decodeUnknownSync(ChatHistoryIndexSchema)
export const asLoadingProgressValue: Decoder<LoadingProgressValue> = Schema.decodeUnknownSync(LoadingProgressValueSchema)
export const asMonotonicTimeSecs = (input: number): ReturnType<typeof MonotonicTimeSecs> => MonotonicTimeSecs(input)
export const asDeltaTimeSecs = (input: number): ReturnType<typeof DeltaTimeSecs> => DeltaTimeSecs(input)
export const asSaveSliceId: Decoder<SaveSliceId> = Schema.decodeUnknownSync(SaveSliceIdSchema)
export const asSaveVersion: Decoder<SaveVersion> = Schema.decodeUnknownSync(SaveVersionSchema)
export const asSimulationTick: Decoder<Schema.Schema.Type<typeof SimulationTickSchema>> = Schema.decodeUnknownSync(SimulationTickSchema)
export const asUiMessageText: Decoder<UiMessageText> = Schema.decodeUnknownSync(UiMessageTextSchema)
export const asWorldId: Decoder<WorldId> = Schema.decodeUnknownSync(WorldIdSchema)
export const asWorldSeedText: Decoder<WorldSeedText> = Schema.decodeUnknownSync(WorldSeedTextSchema)
export const asWorldSeedValue: Decoder<WorldSeedValue> = Schema.decodeUnknownSync(WorldSeedValueSchema)
export const asWorldNameText: Decoder<WorldNameText> = Schema.decodeUnknownSync(WorldNameTextSchema)
export const asWorldTypeId: Decoder<WorldTypeId> = Schema.decodeUnknownSync(WorldTypeIdSchema)
