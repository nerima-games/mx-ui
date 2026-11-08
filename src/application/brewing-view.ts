import {
  type BrewingIntent,
  type BrewingOperation,
  brewingViewModel,
} from '../domain/brewing-view-model.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { type TextCell, textCell } from './dom-write.js'
import { type UiLanguage, type UiMessageText, translateUiMessage } from '../domain/ui-language.js'
import { setLocalizedText, writeLocalizedTextUsing } from './ui-localization.js'

const PROGRESS_DECIMAL_PLACES = 1

type BrewingViewModel = ReturnType<typeof brewingViewModel>
type BrewingProgressView = BrewingViewModel['progress']
export type BrewingViewActions = Readonly<{
  readonly onIntent: (intent: BrewingIntent) => void
}>

export type BrewingView = Readonly<{
  readonly root: DomElement
  readonly render: (model: BrewingViewModel) => void
}>

type BrewingParts = Readonly<{
  readonly progress: TextCell
  readonly status: TextCell
  readonly summary: TextCell
}>

type BrewingControlContext = Readonly<{
  readonly actions: BrewingViewActions
  readonly factory: DomElementFactory
  readonly root: DomElement
}>

type BrewingIntentControl = Readonly<{
  readonly intent: BrewingIntent
  readonly labelKey: 'brewing.insert-selected-item' | 'brewing.collect-bottle' | 'brewing.drink-potion'
  readonly operation: BrewingOperation
}>

const createRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'brewing')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createTextElement = (
  factory: DomElementFactory,
  root: DomElement,
  dataName: string,
): TextCell => {
  const element = factory.createElement('p')
  element.setAttribute('data-mx-ui', dataName)
  root.appendChild(element)
  return textCell(element)
}

const createIntentButton = (
  context: BrewingControlContext,
  control: BrewingIntentControl,
): DomInteractiveElement => {
  const button = context.factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'brewing-control')
  button.setAttribute('data-brewing-operation', control.operation)
  setLocalizedText(button, control.labelKey)
  button.addEventListener('click', () => context.actions.onIntent(control.intent))
  context.root.appendChild(button)
  return button
}

const createCloseControl = (
  factory: DomElementFactory,
  root: DomElement,
  actions: BrewingViewActions,
): DomInteractiveElement => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'brewing-control')
  button.setAttribute('data-brewing-operation', 'close')
  setLocalizedText(button, 'brewing.close')
  button.addEventListener('click', () => actions.onIntent({ _tag: 'Close' }))
  root.appendChild(button)
  return button
}

const createControls = (
  factory: DomElementFactory,
  root: DomElement,
  actions: BrewingViewActions,
): void => {
  const context: BrewingControlContext = { actions, factory, root }
  const controls: ReadonlyArray<BrewingIntentControl> = [
    {
      intent: { _tag: 'InsertSelectedItem' },
      labelKey: 'brewing.insert-selected-item',
      operation: 'insert-selected-item',
    },
    {
      intent: { _tag: 'CollectBottle' },
      labelKey: 'brewing.collect-bottle',
      operation: 'collect-bottle',
    },
    {
      intent: { _tag: 'DrinkPotion' },
      labelKey: 'brewing.drink-potion',
      operation: 'drink-potion',
    },
  ]
  for (const control of controls) {
    createIntentButton(context, control)
  }
  createCloseControl(factory, root, actions)
}

const summaryText = (language: UiLanguage, model: BrewingViewModel): UiMessageText => {
  const stackLabel = (stack: BrewingViewModel['fuel']): string => {
    if (!stack) {
      return translateUiMessage(language, 'brewing.empty')
    }
    return translateUiMessage(language, 'brewing.stack', {
      count: stack.count,
      item: stack.item,
    })
  }
  const bottleText = model.bottles
    .map((bottle) => translateUiMessage(language, 'brewing.bottle-stack', {
      bottle: translateUiMessage(language, bottle.messageId),
      stack: stackLabel(bottle.stack),
    }))
    .join(' | ')
  const fuelText = translateUiMessage(language, 'brewing.fuel-charges', {
    charges: model.fuelCharges,
    stack: stackLabel(model.fuel),
  })
  return translateUiMessage(language, 'brewing.status-line', {
    bottles: bottleText,
    fuel: fuelText,
    ingredient: stackLabel(model.ingredient),
  })
}

const progressText = (language: UiLanguage, progress: BrewingProgressView): UiMessageText => {
  if (!('remainingSecs' in progress)) {
    return translateUiMessage(language, 'brewing.idle')
  }
  return translateUiMessage(language, 'brewing.progress', {
    seconds: progress.remainingSecs.toFixed(PROGRESS_DECIMAL_PLACES),
  })
}

const statusText = (language: UiLanguage, progress: BrewingProgressView): UiMessageText => {
  if (!('remainingSecs' in progress)) {
    return translateUiMessage(language, 'brewing.stand-idle')
  }
  return translateUiMessage(language, 'brewing.stand-progress', {
    seconds: progress.remainingSecs.toFixed(PROGRESS_DECIMAL_PLACES),
  })
}

const createStatusCell = (factory: DomElementFactory, root: DomElement): TextCell => {
  const statusElement = factory.createElement('div')
  statusElement.setAttribute('data-mx-ui', 'brewing-status')
  statusElement.setAttribute('role', 'status')
  statusElement.setAttribute('aria-live', 'polite')
  statusElement.setAttribute('aria-atomic', 'true')
  root.appendChild(statusElement)
  return textCell(statusElement)
}

const createBrewingParts = (
  factory: DomElementFactory,
  root: DomElement,
  actions: BrewingViewActions,
): BrewingParts => {
  const title = factory.createElement('h2')
  setLocalizedText(title, 'brewing.stand')
  root.appendChild(title)

  const summary = createTextElement(factory, root, 'brewing-summary')
  const progress = createTextElement(factory, root, 'brewing-progress')
  createControls(factory, root, actions)
  return {
    progress,
    status: createStatusCell(factory, root),
    summary,
  }
}

const renderBrewingParts = (parts: BrewingParts, model: BrewingViewModel): void => {
  writeLocalizedTextUsing(parts.summary, (language) => summaryText(language, model))
  writeLocalizedTextUsing(parts.progress, (language) => progressText(language, model.progress))
  writeLocalizedTextUsing(parts.status, (language) => statusText(language, model.progress))
}

export const createBrewingView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions: BrewingViewActions,
): BrewingView => {
  const root = createRoot(factory, parent)
  const parts = createBrewingParts(factory, root, actions)
  return {
    render: (model: BrewingViewModel): void => renderBrewingParts(parts, model),
    root,
  }
}
