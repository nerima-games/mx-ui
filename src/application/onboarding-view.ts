import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  type OnboardingIntent,
  type OnboardingViewModel,
} from '../domain/onboarding-view-model.js'

export type OnboardingCallbacks = {
  readonly onIntent: (intent: OnboardingIntent) => void
}

export type OnboardingView = {
  readonly root: DomElement
  readonly render: (model: OnboardingViewModel) => void
}

type OnboardingElements = {
  readonly root: DomElement
  readonly controls: DomElement
  readonly actions: DomElement
}

type QuickControlRowElements = {
  readonly row: DomElement
  readonly action: DomElement
  readonly keys: DomElement
}

type TextBlockOptions = {
  readonly tag: string
  readonly text: string
}

type ActionButtonOptions = {
  readonly action: string
  readonly factory: DomElementFactory
  readonly intent: OnboardingIntent
  readonly label: string
  readonly onIntent: OnboardingCallbacks['onIntent']
  readonly parent: DomElement
}

type RenderOnboardingOptions = {
  readonly elements: OnboardingElements
  readonly factory: DomElementFactory
  readonly model: OnboardingViewModel
  readonly rows: Array<QuickControlRowElements>
}

const createRootElement = (factory: DomElementFactory): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'onboarding')
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Quick Controls onboarding')
  root.setAttribute('hidden', '')
  return root
}

const appendTextBlock = (factory: DomElementFactory, parent: DomElement, options: TextBlockOptions): void => {
  const element = factory.createElement(options.tag)
  element.textContent = options.text
  parent.appendChild(element)
}

const createControlList = (factory: DomElementFactory, root: DomElement): DomElement => {
  const controls = factory.createElement('ul')
  controls.setAttribute('aria-label', 'Quick Controls')
  root.appendChild(controls)
  return controls
}

const createActionGroup = (factory: DomElementFactory, root: DomElement): DomElement => {
  const actions = factory.createElement('div')
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', 'Quick Controls actions')
  root.appendChild(actions)
  return actions
}

const createRoot = (factory: DomElementFactory, parent: DomElement): OnboardingElements => {
  const root = createRootElement(factory)
  appendTextBlock(factory, root, { tag: 'h2', text: 'Quick Controls' })
  appendTextBlock(factory, root, { tag: 'p', text: 'Use these controls to get started.' })
  const controls = createControlList(factory, root)
  const actions = createActionGroup(factory, root)
  parent.appendChild(root)
  return { actions, controls, root }
}

const createQuickControlRow = (
  factory: DomElementFactory,
  parent: DomElement,
): QuickControlRowElements => {
  const row = factory.createElement('li')
  row.setAttribute('hidden', '')
  const action = factory.createElement('span')
  row.appendChild(action)
  const keys = factory.createElement('kbd')
  row.appendChild(keys)
  parent.appendChild(row)
  return { action, keys, row }
}

const createActionButton = ({ action, factory, intent, label, onIntent, parent }: ActionButtonOptions): void => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('aria-label', label)
  button.setAttribute('data-onboarding-action', action)
  button.textContent = label
  button.addEventListener('click', () => onIntent(intent))
  parent.appendChild(button)
}

const createActionButtons = (
  factory: DomElementFactory,
  elements: OnboardingElements,
  callbacks: OnboardingCallbacks,
): void => {
  createActionButton({
    action: 'OpenHowToPlay',
    factory,
    intent: { _tag: 'OpenHowToPlay' },
    label: 'How to Play',
    onIntent: callbacks.onIntent,
    parent: elements.actions,
  })
  createActionButton({
    action: 'PersistQuickControlsDismissal',
    factory,
    intent: { _tag: 'PersistQuickControlsDismissal' },
    label: 'Dismiss Quick Controls',
    onIntent: callbacks.onIntent,
    parent: elements.actions,
  })
}

const writeQuickControlRow = (row: QuickControlRowElements, hint: OnboardingViewModel['quickControls'][number]): void => {
  row.row.removeAttribute('hidden')
  row.row.setAttribute('data-onboarding-control', 'true')
  row.row.setAttribute('data-onboarding-control-action', hint.action)
  row.action.textContent = `${hint.action}: `
  row.keys.textContent = hint.keys
}

const hideExtraRows = (rows: ReadonlyArray<QuickControlRowElements>, visibleCount: number): void => {
  for (const row of rows.slice(visibleCount)) {
    row.row.setAttribute('hidden', '')
  }
}

const renderQuickControls = ({ elements, factory, model, rows }: RenderOnboardingOptions): void => {
  for (const [index, hint] of model.quickControls.entries()) {
    const row = rows[index] ?? createQuickControlRow(factory, elements.controls)
    rows[index] = row
    writeQuickControlRow(row, hint)
  }
  hideExtraRows(rows, model.quickControls.length)
}

const renderOnboarding = (options: RenderOnboardingOptions): void => {
  renderQuickControls(options)
  if (options.model.quickControlsVisible) {
    options.elements.root.removeAttribute('hidden')
  } else {
    options.elements.root.setAttribute('hidden', '')
  }
}

export const createOnboardingView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: OnboardingCallbacks,
): OnboardingView => {
  const elements = createRoot(factory, parent)
  const controlRows: Array<QuickControlRowElements> = []
  createActionButtons(factory, elements, callbacks)

  return {
    render: (model: OnboardingViewModel): void => renderOnboarding({ elements, factory, model, rows: controlRows }),
    root: elements.root,
  }
}
