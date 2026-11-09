import { type AttributeCell, type TextCell, attributeCell, textCell, writeHidden, writeText } from './dom-write.js'
import {
  type ChatFailure,
  type ChatMessage,
  type ChatSubmission,
  classifyChatInput,
  visibleChatMessages,
} from '../domain/chat.js'
import type { DomElement, DomElementFactory, DomInputElement, DomInteractiveElement } from './dom-surface.js'
import { inheritUiLanguage, setLocalizedAttribute, setLocalizedText } from './ui-localization.js'
import { Result } from 'effect'

export type ChatViewCallbacks = {
  readonly onSubmission: (submission: ChatSubmission) => void
  readonly onFailure: (failure: ChatFailure) => void
}

export type ChatView = {
  readonly root: DomElement
  readonly render: (
    history: unknown,
    currentTick: unknown,
    isOpen: unknown,
  ) => Result.Result<boolean, ChatFailure>
}

type ChatMessageRow = {
  readonly text: TextCell
  readonly hidden: AttributeCell
}

type ChatElements = {
  readonly root: DomElement
  readonly rootHidden: AttributeCell
  readonly history: DomElement
  readonly formHidden: AttributeCell
  readonly input: DomInputElement
  readonly send: DomInteractiveElement
}

const CHAT_FOCUS_GROUP = 'chat'
const CHAT_MESSAGE_MARKER = 'chat-message'
const CHAT_HISTORY_FOCUS_INDEX = 0
const CHAT_INPUT_FOCUS_INDEX = 1
const CHAT_SEND_FOCUS_INDEX = 2
const ZERO = 0

const addFocusMember = (element: DomElement, index: number): void => {
  element.setAttribute('data-focus-group', CHAT_FOCUS_GROUP)
  element.setAttribute('data-focus-index', String(index))
  element.setAttribute('tabindex', '0')
}

const createChatRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'chat')
  root.setAttribute('role', 'region')
  inheritUiLanguage(parent, root)
  setLocalizedAttribute(root, 'aria-label', 'chat.title')
  return root
}

const createChatHistory = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const history = factory.createElement('ol')
  history.setAttribute('data-mx-ui', 'chat-history')
  history.setAttribute('role', 'log')
  history.setAttribute('aria-live', 'polite')
  history.setAttribute('aria-relevant', 'additions text')
  setLocalizedAttribute(history, 'aria-label', 'chat.history')
  addFocusMember(history, CHAT_HISTORY_FOCUS_INDEX)
  parent.appendChild(history)
  return history
}

const createChatHeading = (factory: DomElementFactory, parent: DomElement): void => {
  const title = factory.createElement('h2')
  setLocalizedText(title, 'chat.title')
  parent.appendChild(title)
  const commandHint = factory.createElement('p')
  commandHint.setAttribute('data-mx-ui', 'chat-command-hint')
  setLocalizedText(commandHint, 'chat.command-hint')
  parent.appendChild(commandHint)
}

const createChatInput = (factory: DomElementFactory, parent: DomElement): DomInputElement => {
  const input = factory.createElement('input')
  input.setAttribute('type', 'text')
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('data-mx-ui', 'chat-input')
  setLocalizedAttribute(input, 'aria-label', 'chat.input')
  setLocalizedAttribute(input, 'placeholder', 'chat.input')
  addFocusMember(input, CHAT_INPUT_FOCUS_INDEX)
  parent.appendChild(input)
  return input
}

const createChatSendButton = (factory: DomElementFactory, parent: DomElement): DomInteractiveElement => {
  const send = factory.createElement('button')
  send.setAttribute('type', 'submit')
  send.setAttribute('data-mx-ui', 'chat-send')
  setLocalizedAttribute(send, 'aria-label', 'chat.send')
  setLocalizedText(send, 'chat.send')
  addFocusMember(send, CHAT_SEND_FOCUS_INDEX)
  parent.appendChild(send)
  return send
}

type ChatFormElements = {
  readonly form: DomElement
  readonly formHidden: AttributeCell
  readonly input: DomInputElement
  readonly send: DomInteractiveElement
}

const createChatForm = (factory: DomElementFactory): ChatFormElements => {
  const form = factory.createElement('form')
  form.setAttribute('data-mx-ui', 'chat-form')
  form.setAttribute('role', 'group')
  form.setAttribute('data-focus-group', CHAT_FOCUS_GROUP)
  const formHidden = attributeCell(form, 'hidden')
  writeHidden(formHidden, true)
  const input = createChatInput(factory, form)
  const send = createChatSendButton(factory, form)
  return { form, formHidden, input, send }
}

const createChatElements = (factory: DomElementFactory, parent: DomElement): ChatElements => {
  const root = createChatRoot(factory, parent)
  const rootHidden = attributeCell(root, 'hidden')
  writeHidden(rootHidden, true)
  const history = createChatHistory(factory, root)
  createChatHeading(factory, root)
  const { form, formHidden, input, send } = createChatForm(factory)
  root.appendChild(form)
  parent.appendChild(root)
  return { formHidden, history, input, root, rootHidden, send }
}

const createMessageRow = (factory: DomElementFactory, parent: DomElement): ChatMessageRow => {
  const root = factory.createElement('li')
  root.setAttribute('data-mx-ui', CHAT_MESSAGE_MARKER)
  const text = textCell(root)
  const hidden = attributeCell(root, 'hidden')
  writeHidden(hidden, true)
  parent.appendChild(root)
  return { hidden, text }
}

type SetMessageRowsOptions = {
  readonly factory: DomElementFactory
  readonly historyElement: DomElement
  readonly messages: ReadonlyArray<ChatMessage>
  readonly rows: Array<ChatMessageRow>
}

const setMessageRows = ({ factory, historyElement, messages, rows }: SetMessageRowsOptions): void => {
  for (const [index, message] of messages.entries()) {
    const row = rows[index] ?? createMessageRow(factory, historyElement)
    rows[index] = row
    writeText(row.text, message.text)
    writeHidden(row.hidden, false)
  }
  for (const row of rows.slice(messages.length)) {
    writeHidden(row.hidden, true)
  }
}

const isEnterKey = (event: Event): boolean =>
  Reflect.get(event, 'code') === 'Enter' || Reflect.get(event, 'key') === 'Enter'

type RenderChatOptions = {
  readonly currentTick: unknown
  readonly elements: ChatElements
  readonly factory: DomElementFactory
  readonly history: unknown
  readonly isOpen: unknown
  readonly rows: Array<ChatMessageRow>
  readonly wasOpen: boolean
}

type UpdateChatSurfaceOptions = {
  readonly elements: ChatElements
  readonly factory: DomElementFactory
  readonly isOpen: boolean
  readonly messages: ReadonlyArray<ChatMessage>
  readonly rows: Array<ChatMessageRow>
  readonly wasOpen: boolean
}

const updateChatSurface = (options: UpdateChatSurfaceOptions): void => {
  const { elements, factory, isOpen, messages, rows, wasOpen } = options
  setMessageRows({ factory, historyElement: elements.history, messages, rows })
  writeHidden(elements.formHidden, !isOpen)
  writeHidden(elements.rootHidden, !isOpen && messages.length === ZERO)
  if (isOpen && !wasOpen) {
    elements.input.focus()
  }
}

const renderChat = (options: RenderChatOptions): Result.Result<boolean, ChatFailure> => {
  const { currentTick, elements, factory, history, isOpen, rows, wasOpen } = options
  if (typeof isOpen !== 'boolean') {
    return Result.fail({ _tag: 'InvalidChatVisibility', field: 'isOpen' })
  }
  const visible = visibleChatMessages(history, currentTick, isOpen)
  if (Result.isFailure(visible)) {
    return Result.fail(visible.failure)
  }

  updateChatSurface({ elements, factory, isOpen, messages: visible.success, rows, wasOpen })
  return Result.succeed(isOpen)
}

/** Build a reusable, host-driven chat surface. It never executes submitted commands. */
export const createChatView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: ChatViewCallbacks,
): ChatView => {
  const elements = createChatElements(factory, parent)
  const rows: Array<ChatMessageRow> = []
  let wasOpen = false

  const submit = (): void => {
    const result = classifyChatInput(elements.input.value)
    if (Result.isFailure(result)) {
      callbacks.onFailure(result.failure)
      return
    }
    callbacks.onSubmission(result.success)
    elements.input.value = ''
  }

  elements.send.addEventListener('click', (event) => {
    event.preventDefault()
    submit()
  })
  elements.input.addEventListener('keydown', (event) => {
    if (isEnterKey(event)) {
      event.preventDefault()
      submit()
    }
  })

  return {
    render: (history, currentTick, isOpen): Result.Result<boolean, ChatFailure> => {
      const result = renderChat({ currentTick, elements, factory, history, isOpen, rows, wasOpen })
      if (Result.isFailure(result)) {
        return result
      }
      wasOpen = result.success
      return Result.succeed(result.success)
    },
    root: elements.root,
  }
}
