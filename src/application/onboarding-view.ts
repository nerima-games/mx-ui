import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  type OnboardingIntent,
  type OnboardingViewModel,
} from '../domain/onboarding-view-model.js'
import { type TextCell, textCell } from './dom-write.js'
import { type UiMessageKey, inputActionMessageKey } from '../domain/ui-language.js'
import {
  inheritUiLanguage,
  setLocalizedAttribute,
  setLocalizedText,
  writeLocalizedText,
  writeLocalizedTextUsing,
} from './ui-localization.js'
import { keyDisplayName } from '../domain/key-display-name.js'

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
  readonly actionText: TextCell
  readonly keys: TextCell
}

type TextBlockOptions = {
  readonly tag: string
  readonly key: UiMessageKey
}

type ActionButtonOptions = {
  readonly action: string
  readonly factory: DomElementFactory
  readonly intent: OnboardingIntent
  readonly labelKey: UiMessageKey
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
  setLocalizedAttribute(root, 'aria-label', 'onboarding.aria')
  root.setAttribute('hidden', '')
  return root
}

const appendTextBlock = (factory: DomElementFactory, parent: DomElement, options: TextBlockOptions): void => {
  const element = factory.createElement(options.tag)
  setLocalizedText(element, options.key)
  parent.appendChild(element)
}

const createControlList = (factory: DomElementFactory, root: DomElement): DomElement => {
  const controls = factory.createElement('ul')
  setLocalizedAttribute(controls, 'aria-label', 'onboarding.controls-aria')
  root.appendChild(controls)
  return controls
}

const createActionGroup = (factory: DomElementFactory, root: DomElement): DomElement => {
  const actions = factory.createElement('div')
  actions.setAttribute('role', 'group')
  setLocalizedAttribute(actions, 'aria-label', 'onboarding.actions-aria')
  root.appendChild(actions)
  return actions
}

const createRoot = (factory: DomElementFactory, parent: DomElement): OnboardingElements => {
  const root = createRootElement(factory)
  appendTextBlock(factory, root, { key: 'onboarding.title', tag: 'h2' })
  appendTextBlock(factory, root, { key: 'onboarding.intro', tag: 'p' })
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
  inheritUiLanguage(parent, row)
  row.setAttribute('hidden', '')
  const action = factory.createElement('span')
  inheritUiLanguage(row, action)
  row.appendChild(action)
  const keys = factory.createElement('kbd')
  row.appendChild(keys)
  parent.appendChild(row)
  return { action, actionText: textCell(action), keys: textCell(keys), row }
}

const createActionButton = ({ action, factory, intent, labelKey, onIntent, parent }: ActionButtonOptions): void => {
  const button = factory.createElement('button')
  inheritUiLanguage(parent, button)
  button.setAttribute('type', 'button')
  setLocalizedAttribute(button, 'aria-label', labelKey)
  button.setAttribute('data-onboarding-action', action)
  setLocalizedText(button, labelKey)
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
    labelKey: 'onboarding.how-to-play',
    onIntent: callbacks.onIntent,
    parent: elements.actions,
  })
  createActionButton({
    action: 'PersistQuickControlsDismissal',
    factory,
    intent: { _tag: 'PersistQuickControlsDismissal' },
    labelKey: 'onboarding.dismiss',
    onIntent: callbacks.onIntent,
    parent: elements.actions,
  })
}

const writeQuickControlRow = (row: QuickControlRowElements, hint: OnboardingViewModel['quickControls'][number]): void => {
  row.row.removeAttribute('hidden')
  row.row.setAttribute('data-onboarding-control', 'true')
  row.row.setAttribute('data-onboarding-control-action', hint.action)
  writeLocalizedText(row.actionText, 'onboarding.action', {
    action: { key: inputActionMessageKey(hint.action) },
  })
  writeLocalizedTextUsing(row.keys, (language) => keyDisplayName(hint.keys, language))
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
