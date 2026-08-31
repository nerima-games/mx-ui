/**
 * The settings screen — a listener-free projection.
 *
 * See `domain/settings-view-model.ts`'s header for what this repository owns
 * here and what it does not. In short: mc-compose's original
 * `settings-view.ts` attached `click` / `input` / `change` listeners and a
 * document-level `keydown` capture for key rebinding. None of that crosses
 * into this module. `application/dom-surface.ts` gives native buttons and
 * inputs `click` / `input` registration — `application/main-menu-view.ts`
 * uses it — but this view still does not, matching
 * `application/anvil-view.ts`: every control here is a projection with a
 * `data-` hook, and the host (mc-compose today; see
 * `docs/responsibility.md`) owns every interaction.
 *
 * That includes the two toggles. A real `<input type="checkbox">`'s `checked`
 * state is not expressible through `DomInputElement`, which exposes `value`
 * and nothing else (`dom-surface.ts`'s COST discussion) — there was never a
 * verb for it. `audioEnabled` / `captionsEnabled` are therefore buttons with
 * `aria-checked`, the same idiom `domain/main-menu.ts`'s `GameMode` cycling
 * already uses for a closed, host-driven choice.
 */
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory, DomInputElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import type { SettingsFieldView, SettingsViewModel } from '../domain/settings-view-model.js'
import type { InputAction } from '../domain/accessibility.js'

export type SettingsView = {
  readonly root: DomElement
  readonly render: (model: SettingsViewModel) => void
}

const CHECKED_TRUE = 'true'
const CHECKED_FALSE = 'false'
const ariaChecked = (checked: boolean): string => {
  if (checked) {
    return CHECKED_TRUE
  }
  return CHECKED_FALSE
}

type SliderField = 'sensitivity' | 'master-volume' | 'sfx-volume'
type ToggleField = 'audio-enabled' | 'captions-enabled'

const SLIDER_LABEL: Readonly<Record<SliderField, string>> = {
  'master-volume': 'Master volume',
  sensitivity: 'Look sensitivity',
  'sfx-volume': 'SFX volume',
}

const TOGGLE_LABEL: Readonly<Record<ToggleField, string>> = {
  'audio-enabled': 'Audio enabled',
  'captions-enabled': 'Sound captions',
}

/** English display strings for the rebind rows — the DOM layer's own table, like `anvil-view.ts`'s `SLOT_LABEL`. */
const ACTION_LABEL: Readonly<Record<InputAction, string>> = {
  chat: 'Chat',
  drop: 'Drop',
  inventory: 'Inventory',
  jump: 'Jump',
  moveBack: 'Move backward',
  moveForward: 'Move forward',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  sneak: 'Sneak',
  sprint: 'Sprint',
}

const UNBOUND_LABEL = 'Unbound'

type SliderElements = {
  readonly input: DomInputElement
  readonly output: TextCell
  previousPercent: number
}

type ToggleElements = {
  readonly checked: AttributeCell
}

type BindingRowElements = {
  readonly value: TextCell
}

const createRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'settings')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createFieldCaption = (factory: DomElementFactory, row: DomElement, label: string): void => {
  const caption = factory.createElement('span')
  caption.textContent = label
  row.appendChild(caption)
}

const createSliderInput = (factory: DomElementFactory, row: DomElement, field: SliderField): DomInputElement => {
  const input: DomInputElement = factory.createElement('input')
  input.setAttribute('type', 'range')
  input.setAttribute('data-settings-field', field)
  input.setAttribute('aria-label', SLIDER_LABEL[field])
  row.appendChild(input)
  return input
}

const createSliderOutput = (factory: DomElementFactory, row: DomElement, field: SliderField): TextCell => {
  const output = factory.createElement('output')
  output.setAttribute('data-settings-field-output', field)
  row.appendChild(output)
  return textCell(output)
}

const createSlider = (factory: DomElementFactory, root: DomElement, field: SliderField): SliderElements => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `settings-${field}-row`)
  createFieldCaption(factory, row, SLIDER_LABEL[field])
  const input = createSliderInput(factory, row, field)
  const output = createSliderOutput(factory, row, field)
  root.appendChild(row)
  return { input, output, previousPercent: Number.NaN }
}

const createToggle = (factory: DomElementFactory, root: DomElement, field: ToggleField): ToggleElements => {
  const label = TOGGLE_LABEL[field]
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('role', 'switch')
  button.setAttribute('data-interaction-target', 'settings-toggle')
  button.setAttribute('data-settings-field', field)
  button.setAttribute('aria-label', label)
  button.textContent = label
  root.appendChild(button)
  return { checked: attributeCell(button, 'aria-checked') }
}

const createBindingButton = (factory: DomElementFactory, row: DomElement, action: InputAction): DomElement => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-interaction-target', 'settings-binding')
  button.setAttribute('data-binding-action', action)
  button.setAttribute('aria-label', `Change ${ACTION_LABEL[action]} key`)
  row.appendChild(button)
  return button
}

const createBindingRow = (factory: DomElementFactory, root: DomElement, action: InputAction): BindingRowElements => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', 'settings-binding-row')
  createFieldCaption(factory, row, ACTION_LABEL[action])
  const button = createBindingButton(factory, row, action)
  root.appendChild(row)
  return { value: textCell(button) }
}

/**
 * A closed `Record`, not a `Map` — indexing `Record<InputAction, V>` by an
 * `InputAction` never needs an undefined guard (unlike `Map.get`, or an array
 * index under `noUncheckedIndexedAccess`), because the ten keys are provably
 * exhaustive at the type level. Same reason `ACTION_LABEL` above is a `Record`.
 */
const createBindingRows = (
  factory: DomElementFactory,
  root: DomElement,
): Readonly<Record<InputAction, BindingRowElements>> => ({
  chat: createBindingRow(factory, root, 'chat'),
  drop: createBindingRow(factory, root, 'drop'),
  inventory: createBindingRow(factory, root, 'inventory'),
  jump: createBindingRow(factory, root, 'jump'),
  moveBack: createBindingRow(factory, root, 'moveBack'),
  moveForward: createBindingRow(factory, root, 'moveForward'),
  moveLeft: createBindingRow(factory, root, 'moveLeft'),
  moveRight: createBindingRow(factory, root, 'moveRight'),
  sneak: createBindingRow(factory, root, 'sneak'),
  sprint: createBindingRow(factory, root, 'sprint'),
})

const writeSlider = (elements: SliderElements, field: SettingsFieldView): void => {
  if (elements.previousPercent !== field.percent) {
    elements.previousPercent = field.percent
    elements.input.value = String(field.percent)
  }
  writeText(elements.output, field.label)
}

/** Creates a listener-free settings projection. The host owns every interaction. */
export const createSettingsView = (factory: DomElementFactory, parent: DomElement): SettingsView => {
  const root = createRoot(factory, parent)

  const sensitivity = createSlider(factory, root, 'sensitivity')
  const masterVolume = createSlider(factory, root, 'master-volume')
  const sfxVolume = createSlider(factory, root, 'sfx-volume')
  const audioEnabled = createToggle(factory, root, 'audio-enabled')
  const captionsEnabled = createToggle(factory, root, 'captions-enabled')
  const bindingRows = createBindingRows(factory, root)

  return {
    render: (model: SettingsViewModel): void => {
      writeSlider(sensitivity, model.sensitivity)
      writeSlider(masterVolume, model.masterVolume)
      writeSlider(sfxVolume, model.sfxVolume)
      writeAttribute(audioEnabled.checked, ariaChecked(model.audioEnabled))
      writeAttribute(captionsEnabled.checked, ariaChecked(model.captionsEnabled))
      for (const row of model.bindingRows) {
        writeText(bindingRows[row.action].value, row.code ?? UNBOUND_LABEL)
      }
    },
    root,
  }
}
