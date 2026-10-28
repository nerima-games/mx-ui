import {
  type BrewingIntent,
  type BrewingOperation,
  brewingViewModel,
} from '../domain/brewing-view-model.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { type TextCell, textCell, writeText } from './dom-write.js'

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
  readonly label: string
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
  button.textContent = control.label
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
  button.textContent = 'Close'
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
      label: 'Insert selected item',
      operation: 'insert-selected-item',
    },
    {
      intent: { _tag: 'CollectBottle' },
      label: 'Collect bottle',
      operation: 'collect-bottle',
    },
    {
      intent: { _tag: 'DrinkPotion' },
      label: 'Drink potion',
      operation: 'drink-potion',
    },
  ]
  for (const control of controls) {
    createIntentButton(context, control)
  }
  createCloseControl(factory, root, actions)
}

const summaryText = (model: BrewingViewModel): string => {
  const stackLabel = (stack: BrewingViewModel['fuel']): string => {
    if (!stack) {
      return 'Empty'
    }
    return `${String(stack.item)} × ${String(stack.count)}`
  }
  const bottleText = model.bottles
    .map((bottle) => `${bottle.label}: ${stackLabel(bottle.stack)}`)
    .join(' | ')
  const fuelText = `${String(model.fuelCharges)} charges (${stackLabel(model.fuel)})`
  return `Fuel: ${fuelText} | ${bottleText} | Ingredient: ${stackLabel(model.ingredient)}`
}

const progressText = (progress: BrewingProgressView): string => {
  if (!('remainingSecs' in progress)) {
    return 'Idle'
  }
  return `Brewing: ${progress.remainingSecs.toFixed(PROGRESS_DECIMAL_PLACES)}s remaining`
}

const statusText = (progress: BrewingProgressView): string => {
  if (!('remainingSecs' in progress)) {
    return 'Brewing Stand idle'
  }
  return `Brewing in progress, ${progress.remainingSecs.toFixed(PROGRESS_DECIMAL_PLACES)} seconds remaining`
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
  title.textContent = 'Brewing Stand'
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
  writeText(parts.summary, summaryText(model))
  writeText(parts.progress, progressText(model.progress))
  writeText(parts.status, statusText(model.progress))
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
