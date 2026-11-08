import { Result } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createChatView } from '../src/application/chat-view.js'
import type { ChatFailure, ChatSubmission } from '../src/domain/chat.js'
import { fakeDocument, fakeElement } from './fake-dom.js'

const mount = () => {
  const factory = fakeDocument()
  const host = factory.createElement('main')
  const submissions: Array<ChatSubmission> = []
  const failures: Array<ChatFailure> = []
  const view = createChatView(factory, host, {
    onFailure: (failure) => failures.push(failure),
    onSubmission: (submission) => submissions.push(submission),
  })
  return { factory, failures, host: fakeElement(host), submissions, view }
}

const pressEnter = (input: ReturnType<typeof fakeElement>): Event => {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    code: 'Enter',
    key: 'Enter',
  })
  for (const listener of input.eventListeners.get('keydown') ?? []) {
    if (typeof listener === 'function') {
      listener(event)
    } else {
      listener.handleEvent(event)
    }
  }
  return event
}

describe('createChatView', () => {
  it('builds a native form with a labeled log and keyboard focus group', () => {
    const { host, view } = mount()
    const root = fakeElement(view.root)
    const history = host.find('data-mx-ui', 'chat-history')
    const form = host.find('data-mx-ui', 'chat-form')
    const input = host.find('data-mx-ui', 'chat-input')
    const send = host.find('data-mx-ui', 'chat-send')

    expect(root.tagName).toBe('section')
    expect(root.attributes.get('role')).toBe('region')
    expect(history?.tagName).toBe('ol')
    expect(history?.attributes.get('role')).toBe('log')
    expect(history?.attributes.get('aria-live')).toBe('polite')
    expect(form?.tagName).toBe('form')
    expect(input?.tagName).toBe('input')
    expect(input?.attributes.get('type')).toBe('text')
    expect(send?.tagName).toBe('button')
    expect(send?.attributes.get('type')).toBe('submit')
    expect([history, input, send].map((element) => element?.attributes.get('data-focus-group'))).toStrictEqual([
      'chat',
      'chat',
      'chat',
    ])
    expect([history, input, send].map((element) => element?.attributes.get('tabindex'))).toStrictEqual([
      '0',
      '0',
      '0',
    ])
  })

  it('shows full history and focuses the input when opened', () => {
    const { factory, host, view } = mount()
    const input = host.find('data-mx-ui', 'chat-input')
    const history = [
      { text: 'older line', tick: 0 },
      { text: 'latest line', tick: 100 },
    ]

    const result = view.render(history, 100, true)

    expect(Result.isSuccess(result)).toBe(true)
    expect(fakeElement(view.root).attributes.has('hidden')).toBe(false)
    expect(fakeElement(host.find('data-mx-ui', 'chat-form')).attributes.has('hidden')).toBe(false)
    expect(fakeElement(host.find('data-mx-ui', 'chat-history')).findAll('data-mx-ui', 'chat-message').map((row) => row.textContent)).toStrictEqual([
      'older line',
      'latest line',
    ])
    expect(factory.mutations.some((mutation) => mutation.kind === 'focus' && mutation.target === input)).toBe(true)
  })

  it('shows only recent messages when closed and hides the surface after they expire', () => {
    const { host, view } = mount()
    const history = [
      { text: 'expired', tick: 0 },
      { text: 'recent', tick: 50 },
    ]
    const root = fakeElement(view.root)
    const log = fakeElement(host.find('data-mx-ui', 'chat-history'))

    expect(Result.isSuccess(view.render(history, 100, false))).toBe(true)
    expect(root.attributes.has('hidden')).toBe(false)
    expect(log.findAll('data-mx-ui', 'chat-message').filter((row) => !row.attributes.has('hidden')).map((row) => row.textContent)).toStrictEqual([
      'recent',
    ])

    expect(Result.isSuccess(view.render(history, 150, false))).toBe(true)
    expect(root.attributes.has('hidden')).toBe(true)
    expect(log.findAll('data-mx-ui', 'chat-message').every((row) => row.attributes.has('hidden'))).toBe(true)
  })

  it('sends plain messages and classifies slash commands for the host callback', () => {
    const { host, submissions, failures, view } = mount()
    expect(Result.isSuccess(view.render([], 0, true))).toBe(true)
    const input = fakeElement(host.find('data-mx-ui', 'chat-input'))
    const send = fakeElement(host.find('data-mx-ui', 'chat-send'))

    input.value = ' hello from singleplayer '
    send.dispatch('click')
    input.value = '/weather clear'
    const enter = pressEnter(input)

    expect(enter.defaultPrevented).toBe(true)
    expect(submissions).toStrictEqual([
      { kind: 'message', text: 'hello from singleplayer' },
      { kind: 'command', command: 'weather clear' },
    ])
    expect(input.value).toBe('')
    expect(failures).toStrictEqual([])
  })

  it('reports blank submission as a typed failure and preserves the input value', () => {
    const { host, submissions, failures, view } = mount()
    expect(Result.isSuccess(view.render([], 0, true))).toBe(true)
    const input = fakeElement(host.find('data-mx-ui', 'chat-input'))
    input.value = '   '

    pressEnter(input)

    expect(submissions).toStrictEqual([])
    expect(failures).toStrictEqual([{ _tag: 'InvalidChatInput', reason: 'empty' }])
    expect(input.value).toBe('   ')
  })

  it('does not alter the rendered screen when host data is invalid', () => {
    const { factory, view } = mount()
    const root = fakeElement(view.root)
    expect(Result.isSuccess(view.render([{ text: 'valid', tick: 0 }], 0, true))).toBe(true)
    const before = factory.mark()

    const result = view.render([{ text: '', tick: 0 }], 0, true)

    expect(Result.isFailure(result)).toBe(true)
    expect(factory.since(before)).toStrictEqual([])
    expect(root.attributes.has('hidden')).toBe(false)
  })

  it('property: opening controls visibility and closed empty chat has no surface', () => {
    fc.assert(
      fc.property(fc.boolean(), (isOpen) => {
        const { host, view } = mount()
        const result = view.render([], 0, isOpen)

        expect(Result.isSuccess(result)).toBe(true)
        expect(fakeElement(view.root).attributes.has('hidden')).toBe(!isOpen)
        expect(fakeElement(host.find('data-mx-ui', 'chat-form')).attributes.has('hidden')).toBe(!isOpen)
      }),
    )
  })
})
