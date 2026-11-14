import { Result } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  chatKeyboardAction,
  classifyChatInput,
  visibleChatMessages,
} from '../src/domain/chat.js'

describe('classifyChatInput', () => {
  it('classifies messages and slash commands without executing them', () => {
    expect(classifyChatInput('  hello world  ')).toStrictEqual(
      Result.succeed({ kind: 'message', text: 'hello world' }),
    )
    expect(classifyChatInput(' /time set day ')).toStrictEqual(
      Result.succeed({ kind: 'command', command: 'time set day' }),
    )
  })

  it('returns typed failures for empty input, an empty command, and non-text input', () => {
    expect(classifyChatInput('   ')).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatInput', reason: 'empty' }),
    )
    expect(classifyChatInput('/   ')).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatInput', reason: 'empty-command' }),
    )
    expect(classifyChatInput(null)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatInput', reason: 'not-string' }),
    )
  })

  it('property: every generated string matches the independently stated slash rule', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const trimmed = input.trim()
        const command = trimmed.startsWith('/') ? trimmed.slice(1).trim() : undefined
        const actual = classifyChatInput(input)

        if (trimmed.length === 0 || command === '') {
          expect(Result.isFailure(actual)).toBe(true)
          if (Result.isFailure(actual)) {
            expect(actual.failure).toStrictEqual({
              _tag: 'InvalidChatInput',
              reason: trimmed.length === 0 ? 'empty' : 'empty-command',
            })
          }
        } else if (typeof command === 'string') {
          expect(actual).toStrictEqual(Result.succeed({ command, kind: 'command' }))
        } else {
          expect(actual).toStrictEqual(Result.succeed({ kind: 'message', text: trimmed }))
        }
      }),
    )
  })

  it('property: arbitrary non-string values fail without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const actual = classifyChatInput(input)
        if (typeof input !== 'string') {
          expect(Result.isFailure(actual)).toBe(true)
        } else {
          expect(Result.isSuccess(actual) || Result.isFailure(actual)).toBe(true)
        }
      }),
    )
  })
})

describe('visibleChatMessages', () => {
  it('shows all history while open and only messages younger than five seconds while closed', () => {
    const history = [
      { text: 'older than five seconds', tick: 0 },
      { text: '99 ticks old', tick: 1 },
      { text: 'current', tick: 100 },
    ]

    expect(visibleChatMessages(history, 100, false)).toStrictEqual(
      Result.succeed([history[1], history[2]]),
    )
    expect(visibleChatMessages(history, 100, true)).toStrictEqual(Result.succeed(history))
  })

  it('accepts tick zero and rejects negative, fractional, unsafe, and future ticks', () => {
    expect(visibleChatMessages([{ text: 'first tick', tick: 0 }], 0, false)).toStrictEqual(
      Result.succeed([{ text: 'first tick', tick: 0 }]),
    )
    for (const currentTick of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(Result.isFailure(visibleChatMessages([], currentTick, true))).toBe(true)
    }
    expect(visibleChatMessages([{ text: 'future', tick: 2 }], 1, false)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatTick', field: 'message', index: 0 }),
    )
  })

  it('rejects malformed history instead of dropping or replacing it', () => {
    expect(visibleChatMessages({}, 10, false)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatHistory', reason: 'not-array' }),
    )
    expect(visibleChatMessages([{ text: '', tick: 0 }], 0, false)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatHistory', reason: 'invalid-message', index: 0 }),
    )
    expect(visibleChatMessages([{ text: 17, tick: 0 }], 0, false)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatHistory', reason: 'invalid-message', index: 0 }),
    )
    expect(visibleChatMessages([], 0, 'false')).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatVisibility', field: 'isOpen' }),
    )
  })

  it('rejects a non-boolean editable-target flag before deciding whether T opens chat', () => {
    expect(chatKeyboardAction({ code: 'KeyT', isOpen: false, isEditableTarget: 'false' })).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'isEditableTarget' }),
    )
  })

  it('property: visibility follows an independent 20 ticks per second × five second boundary', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.array(fc.tuple(fc.string({ minLength: 1 }), fc.nat({ max: 250 }))),
        fc.boolean(),
        (currentTick, samples, isOpen) => {
          const history = samples.map(([text, age]) => ({
            text,
            tick: Math.max(0, currentTick - age),
          }))
          const expected = isOpen
            ? history
            : history.filter((message) => currentTick - message.tick < 20 * 5)
          const actual = visibleChatMessages(history, currentTick, isOpen)

          expect(actual).toStrictEqual(Result.succeed(expected))
        },
      ),
    )
  })

  it('property: arbitrary history values return a typed result without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.nat(), fc.boolean(), (history, currentTick, isOpen) => {
        const actual = visibleChatMessages(history, currentTick, isOpen)
        expect(Result.isSuccess(actual) || Result.isFailure(actual)).toBe(true)
        if (!Array.isArray(history)) {
          expect(Result.isFailure(actual)).toBe(true)
        }
      }),
    )
  })
})

describe('chatKeyboardAction', () => {
  it('opens on T outside editable targets and closes on Escape while open', () => {
    expect(chatKeyboardAction({ code: 'KeyT', isOpen: false, isEditableTarget: false })).toStrictEqual(
      Result.succeed({ _tag: 'OpenChat' }),
    )
    expect(chatKeyboardAction({ code: 'Escape', isOpen: true, isEditableTarget: true })).toStrictEqual(
      Result.succeed({ _tag: 'CloseChat' }),
    )
  })

  it('leaves T in editable targets as text and does not toggle an already open chat', () => {
    expect(chatKeyboardAction({ code: 'KeyT', isOpen: false, isEditableTarget: true })).toStrictEqual(
      Result.succeed({ _tag: 'NoChatAction' }),
    )
    expect(chatKeyboardAction({ code: 'KeyT', isOpen: true, isEditableTarget: false })).toStrictEqual(
      Result.succeed({ _tag: 'NoChatAction' }),
    )
    expect(chatKeyboardAction({ code: 'Escape', isOpen: false, isEditableTarget: false })).toStrictEqual(
      Result.succeed({ _tag: 'NoChatAction' }),
    )
  })

  it('returns typed failures for incomplete keyboard context', () => {
    expect(chatKeyboardAction(null)).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'code' }),
    )
    expect(chatKeyboardAction({ code: 'KeyT', isOpen: 'false', isEditableTarget: false })).toStrictEqual(
      Result.fail({ _tag: 'InvalidChatKeyboardInput', field: 'isOpen' }),
    )
  })

  it('property: generated keyboard contexts follow the open/close rule', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), fc.boolean(), (code, isOpen, isEditableTarget) => {
        const expected =
          code === 'Escape' && isOpen
            ? { _tag: 'CloseChat' as const }
            : code === 'KeyT' && !isOpen && !isEditableTarget
              ? { _tag: 'OpenChat' as const }
              : { _tag: 'NoChatAction' as const }
        const actual = chatKeyboardAction({ code, isOpen, isEditableTarget })

        expect(actual).toStrictEqual(Result.succeed(expected))
      }),
    )
  })

  it('property: arbitrary values return a typed result without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const actual = chatKeyboardAction(input)
        expect(Result.isSuccess(actual) || Result.isFailure(actual)).toBe(true)
        if (typeof input !== 'object' || input === null) {
          expect(Result.isFailure(actual)).toBe(true)
        }
      }),
    )
  })
})
