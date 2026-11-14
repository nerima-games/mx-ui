import {
  type ChatHistoryIndex,
  ChatHistoryIndexSchema,
  type ChatKeyboardCode,
  ChatKeyboardCodeSchema,
  type ChatText,
  ChatTextSchema,
} from './ui3-brand-schemas.js'
import { Result, Schema } from 'effect'
import { SimulationTickSchema } from '@nerima-games/mc-kernel'

export type { ChatHistoryIndex, ChatKeyboardCode, ChatText } from './ui3-brand-schemas.js'
const chatText = Schema.decodeUnknownSync(ChatTextSchema)

const chatKeyboardCode = Schema.decodeUnknownSync(ChatKeyboardCodeSchema)

const chatHistoryIndex = Schema.decodeUnknownSync(ChatHistoryIndexSchema)
type SimulationTick = Schema.Schema.Type<typeof SimulationTickSchema>
const simulationTick = Schema.decodeUnknownSync(SimulationTickSchema)

export const CHAT_TICKS_PER_SECOND: number = 20
export const CHAT_RECENT_MESSAGE_SECONDS: number = 5
export const CHAT_RECENT_MESSAGE_TICKS: number = CHAT_TICKS_PER_SECOND * CHAT_RECENT_MESSAGE_SECONDS

export type ChatMessage = {
  readonly text: ChatText
  readonly tick: SimulationTick
}

export type ChatSubmission =
  | { readonly kind: 'message'; readonly text: ChatText }
  | { readonly kind: 'command'; readonly command: ChatText }

export type ChatFailure =
  | { readonly _tag: 'InvalidChatInput'; readonly reason: 'not-string' | 'empty' | 'empty-command' }
  | { readonly _tag: 'InvalidChatHistory'; readonly reason: 'not-array' | 'invalid-message'; readonly index?: ChatHistoryIndex }
  | { readonly _tag: 'InvalidChatTick'; readonly field: 'current' | 'message'; readonly index?: ChatHistoryIndex }
  | { readonly _tag: 'InvalidChatVisibility'; readonly field: 'isOpen' }
  | {
      readonly _tag: 'InvalidChatKeyboardInput'
      readonly field: 'code' | 'isOpen' | 'isEditableTarget'
    }

export type ChatKeyboardAction =
  | { readonly _tag: 'OpenChat' }
  | { readonly _tag: 'CloseChat' }
  | { readonly _tag: 'NoChatAction' }

export type ChatKeyboardInput = {
  /** `KeyboardEvent.code`, such as `KeyT` or `Escape`. */
  readonly code: ChatKeyboardCode
  readonly isOpen: boolean
  /** True for input, textarea, select, or contenteditable targets. */
  readonly isEditableTarget: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ZERO = 0
const ONE = 1

const isTick = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= ZERO

const classifyNonEmptyText = (text: ChatText): Result.Result<ChatSubmission, ChatFailure> => {
  if (!text.startsWith('/')) {
    return Result.succeed({ kind: 'message', text })
  }

  const command = text.slice(ONE).trim()
  if (command.length === ZERO) {
    return Result.fail({ _tag: 'InvalidChatInput', reason: 'empty-command' })
  }
  return Result.succeed({ command: chatText(command), kind: 'command' })
}

/** Classify submitted text without executing commands. The host owns execution. */
export const classifyChatInput = (input: unknown): Result.Result<ChatSubmission, ChatFailure> => {
  if (typeof input !== 'string') {
    return Result.fail({ _tag: 'InvalidChatInput', reason: 'not-string' })
  }

  const text = input.trim()
  if (text.length === ZERO) {
    return Result.fail({ _tag: 'InvalidChatInput', reason: 'empty' })
  }
  return classifyNonEmptyText(chatText(text))
}

const parseChatKeyboardInput = (input: unknown): Result.Result<ChatKeyboardInput, ChatFailure> => {
  if (!isRecord(input) || typeof input['code'] !== 'string') {
    return Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'code' })
  }
  if (typeof input['isOpen'] !== 'boolean') {
    return Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'isOpen' })
  }
  if (typeof input['isEditableTarget'] !== 'boolean') {
    return Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'isEditableTarget' })
  }

  const { code, isEditableTarget, isOpen } = input
  const keyboardCode = chatKeyboardCode(code)
  return Result.succeed({ code: keyboardCode, isEditableTarget, isOpen })
}

/** Resolve T/Escape behavior for the host's frame-level keyboard handler. */
export const chatKeyboardAction = (input: unknown): Result.Result<ChatKeyboardAction, ChatFailure> => {
  const parsed = parseChatKeyboardInput(input)
  if (Result.isFailure(parsed)) {
    return Result.fail(parsed.failure)
  }

  const { code, isEditableTarget, isOpen } = parsed.success

  if (code === 'Escape' && isOpen) {
    return Result.succeed({ _tag: 'CloseChat' })
  }
  if (code === 'KeyT' && !isOpen && !isEditableTarget) {
    return Result.succeed({ _tag: 'OpenChat' })
  }
  return Result.succeed({ _tag: 'NoChatAction' })
}

const parseVisibleChatMessage = (
  candidate: unknown,
  index: number,
  currentTick: number,
): Result.Result<ChatMessage, ChatFailure> => {
  if (!isRecord(candidate) || typeof candidate['text'] !== 'string' || candidate['text'].length === ZERO) {
    return Result.fail({ _tag: 'InvalidChatHistory', index: chatHistoryIndex(index), reason: 'invalid-message' })
  }

  const { text, tick } = candidate
  if (!isTick(tick) || tick > currentTick) {
    return Result.fail({ _tag: 'InvalidChatTick', field: 'message', index: chatHistoryIndex(index) })
  }
  return Result.succeed(Object.freeze({ text: chatText(text), tick: simulationTick(tick) }))
}

type VisibleChatContext = {
  readonly history: ReadonlyArray<unknown>
  readonly currentTick: SimulationTick
  readonly isOpen: boolean
}

const collectVisibleChatMessages = (
  context: VisibleChatContext,
): Result.Result<ReadonlyArray<ChatMessage>, ChatFailure> => {
  const messages: Array<ChatMessage> = []
  for (const [index, candidate] of context.history.entries()) {
    const parsed = parseVisibleChatMessage(candidate, index, context.currentTick)
    if (Result.isFailure(parsed)) {
      return Result.fail(parsed.failure)
    }

    const message = parsed.success
    if (context.isOpen || context.currentTick - message.tick < CHAT_RECENT_MESSAGE_TICKS) {
      messages.push(message)
    }
  }

  return Result.succeed(Object.freeze(messages))
}

const parseVisibleChatContext = (
  history: unknown,
  currentTick: unknown,
  isOpen: unknown,
): Result.Result<VisibleChatContext, ChatFailure> => {
  if (!isTick(currentTick)) {
    return Result.fail({ _tag: 'InvalidChatTick', field: 'current' })
  }
  if (typeof isOpen !== 'boolean') {
    return Result.fail({ _tag: 'InvalidChatVisibility', field: 'isOpen' })
  }
  if (!Array.isArray(history)) {
    return Result.fail({ _tag: 'InvalidChatHistory', reason: 'not-array' })
  }
  return Result.succeed({ currentTick: simulationTick(currentTick), history, isOpen })
}

/**
 * Return all messages while open and the last five seconds while closed.
 * Ticks are absolute, non-negative integers supplied by the host.
 */
export const visibleChatMessages = (
  history: unknown,
  currentTick: unknown,
  isOpen: unknown,
): Result.Result<ReadonlyArray<ChatMessage>, ChatFailure> => {
  const context = parseVisibleChatContext(history, currentTick, isOpen)
  if (Result.isFailure(context)) {
    return Result.fail(context.failure)
  }
  return collectVisibleChatMessages(context.success)
}
