import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeText,
} from './dom-write.js'
import { type BrewingIntent, brewingViewModel } from '../domain/brewing-view-model.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'

const PROGRESS_DECIMAL_PLACES = 1

type BrewingViewModel = ReturnType<typeof brewingViewModel>
type BrewingProgressView = BrewingViewModel['progress']
type BrewingUnsupportedState = BrewingViewModel['operations'][keyof BrewingViewModel['operations']]

export type BrewingViewActions = Readonly<{
  readonly onIntent: (intent: BrewingIntent) => void
}>

export type BrewingView = Readonly<{
  readonly root: DomElement
  readonly render: (model: BrewingViewModel) => void
}>

type UnsupportedControl = Readonly<{
  readonly ariaLabel: AttributeCell
  readonly button: DomInteractiveElement
  readonly label: string
  readonly reason: TextCell
}>

type BrewingControls = Readonly<{
  readonly close: DomInteractiveElement
  readonly collectBottle: UnsupportedControl
  readonly drinkPotion: UnsupportedControl
  readonly insertSelectedItem: UnsupportedControl
}>

type BrewingControlContext = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
}>

type BrewingParts = Readonly<{
  readonly controls: BrewingControls
  readonly progress: TextCell
  readonly status: TextCell
  readonly summary: TextCell
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

const createDisabledButton = (
  context: BrewingControlContext,
  operation: BrewingUnsupportedState['operation'],
  label: string,
): DomInteractiveElement => {
  const button = context.factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'brewing-control')
  button.setAttribute('data-brewing-operation', operation)
  button.setAttribute('disabled', '')
  button.setAttribute('aria-disabled', 'true')
  button.textContent = label
  context.root.appendChild(button)
  return button
}

const createReason = (
  context: BrewingControlContext,
  operation: BrewingUnsupportedState['operation'],
): TextCell => {
  const reason = context.factory.createElement('p')
  reason.setAttribute('data-brewing-reason', operation)
  context.root.appendChild(reason)
  return textCell(reason)
}

const createUnsupportedControl = (
  context: BrewingControlContext,
  operation: BrewingUnsupportedState['operation'],
  label: string,
): UnsupportedControl => {
  const button = createDisabledButton(context, operation, label)
  const reason = createReason(context, operation)
  return {
    ariaLabel: attributeCell(button, 'aria-label'),
    button,
    label,
    reason,
  }
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
): BrewingControls => {
  const context: BrewingControlContext = { factory, root }
  const insertSelectedItem = createUnsupportedControl(
    context,
    'insert-selected-item',
    'Insert selected item',
  )
  const collectBottle = createUnsupportedControl(context, 'collect-bottle', 'Collect bottle')
  const drinkPotion = createUnsupportedControl(context, 'drink-potion', 'Drink potion')
  const close = createCloseControl(factory, root, actions)
  return { close, collectBottle, drinkPotion, insertSelectedItem }
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

const updateUnsupportedControl = (
  control: UnsupportedControl,
  state: BrewingUnsupportedState,
): void => {
  writeAttribute(control.ariaLabel, `${control.label}. Unavailable. ${state.reason}`)
  writeText(control.reason, state.reason)
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
  const controls = createControls(factory, root, actions)
  return {
    controls,
    progress,
    status: createStatusCell(factory, root),
    summary,
  }
}

const renderBrewingParts = (parts: BrewingParts, model: BrewingViewModel): void => {
  writeText(parts.summary, summaryText(model))
  writeText(parts.progress, progressText(model.progress))
  writeText(parts.status, statusText(model.progress))
  updateUnsupportedControl(parts.controls.insertSelectedItem, model.operations.insertSelectedItem)
  updateUnsupportedControl(parts.controls.collectBottle, model.operations.collectBottle)
  updateUnsupportedControl(parts.controls.drinkPotion, model.operations.drinkPotion)
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
