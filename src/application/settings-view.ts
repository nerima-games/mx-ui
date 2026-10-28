/** Settings controls projected from the mc-sim snapshot; the host owns interaction. */
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeText,
} from './dom-write.js'
import {
  COLOR_VISION_CHOICES,
  DIFFICULTY_CHOICES,
  GRAPHICS_PRESET_CHOICES,
  type NumericSettingView,
  REDUCED_MOTION_CHOICES,
  type SettingChoice,
  type SettingsSnapshot,
  type SettingsViewModel,
} from '../domain/settings-view-model.js'
import type { DomElement, DomElementFactory, DomInputElement } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { InputAction as inputAction, KeyCode } from '@nerima-games/mc-kernel/domain/settings'
import { type SettingsServiceApi, isValidSettings } from '@nerima-games/mc-sim'
import { Effect } from 'effect'

export type SettingsView = {
  readonly root: DomElement
  readonly render: (model: SettingsViewModel) => void
}

export type SettingsKeyRemappingFailure = {
  readonly _tag: 'SettingsKeyRemappingFailure'
  readonly reason: 'escape-is-not-bindable' | 'unknown-action' | 'invalid-key' | 'key-reserved-by-user-agent'
}

export type SettingsKeyInputPolicy<Action extends string = string> = {
  readonly bindableActions: ReadonlyArray<Action>
  readonly validateKeyCode: (action: Action, code: KeyCode) => SettingsKeyRemappingFailure['reason'] | undefined
}

type SettingsKeyRemapRequest<Action extends string> = {
  readonly inputPolicy: SettingsKeyInputPolicy<Action>
  readonly action: unknown
  readonly code: unknown
}

export type SettingsUpdateFailure = {
  readonly _tag: 'InvalidSettingsUpdate'
}

type EffectSuccess<Value> = Value extends Effect.Effect<infer Success, unknown, unknown> ? Success : never
type EffectFailure<Value> = Value extends Effect.Effect<unknown, infer Failure, unknown> ? Failure : never
type EffectRequirements<Value> = Value extends Effect.Effect<unknown, unknown, infer Requirements>
  ? Requirements
  : never

type SettingsSnapshotEffect = SettingsServiceApi['snapshot']
type SettingsCandidateEffect = ReturnType<SettingsServiceApi['candidate']>
type SettingsUpdateEffect = ReturnType<SettingsServiceApi['update']>
type SettingsRestoreEffect = ReturnType<SettingsServiceApi['restore']>
type SettingsResetEffect = SettingsServiceApi['reset']
type SettingsRebindEffect = ReturnType<SettingsServiceApi['rebindKey']>
type SettingsUnbindEffect = ReturnType<SettingsServiceApi['unbindKey']>

const CHECKED_TRUE = 'true'
const CHECKED_FALSE = 'false'
const ariaChecked = (checked: boolean): string => {
  if (checked) {
    return CHECKED_TRUE
  }
  return CHECKED_FALSE
}

type SliderField =
  | 'mouseSensitivity'
  | 'masterVolume'
  | 'sfxVolume'
  | 'fovDegrees'
  | 'uiScale'

type ChoiceField = 'difficulty' | 'graphicsPreset' | 'reducedMotion' | 'colorVisionCorrection'
type ToggleField = 'audioEnabled' | 'captionsEnabled'

const SLIDER_LABEL: Readonly<Record<SliderField, string>> = {
  fovDegrees: 'Field of view',
  masterVolume: 'Master volume',
  mouseSensitivity: 'Look sensitivity',
  sfxVolume: 'SFX volume',
  uiScale: 'UI scale',
}

const CHOICE_LABEL: Readonly<Record<ChoiceField, string>> = {
  colorVisionCorrection: 'Color vision correction',
  difficulty: 'Difficulty',
  graphicsPreset: 'Graphics preset',
  reducedMotion: 'Reduced motion',
}

const TOGGLE_LABEL: Readonly<Record<ToggleField, string>> = {
  audioEnabled: 'Audio enabled',
  captionsEnabled: 'Sound captions',
}

const ACTION_LABEL: Readonly<Record<string, string>> = {
  attack: 'Attack',
  escape: 'Pause menu',
  hotbarSlot1: 'Hotbar slot 1',
  hotbarSlot2: 'Hotbar slot 2',
  hotbarSlot3: 'Hotbar slot 3',
  hotbarSlot4: 'Hotbar slot 4',
  hotbarSlot5: 'Hotbar slot 5',
  hotbarSlot6: 'Hotbar slot 6',
  hotbarSlot7: 'Hotbar slot 7',
  hotbarSlot8: 'Hotbar slot 8',
  hotbarSlot9: 'Hotbar slot 9',
  jump: 'Jump',
  moveBackward: 'Move backward',
  moveForward: 'Move forward',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  openChat: 'Chat',
  openInventory: 'Inventory',
  pickBlock: 'Pick block',
  sneak: 'Sneak',
  sprint: 'Sprint',
  use: 'Use',
}

const UNBOUND_LABEL = 'Unbound'
const CLEAR_BINDING_CODE = 'Backspace'
type SliderElements = {
  readonly input: DomInputElement
  readonly output: TextCell
  readonly minimum: AttributeCell
  readonly maximum: AttributeCell
  readonly step: AttributeCell
  previousValue: number
}

type ChoiceOptionElements = {
  readonly value: string
  readonly selected: AttributeCell
}

type ChoiceElements = ReadonlyArray<ChoiceOptionElements>

type ChoiceFieldOptions = {
  readonly field: ChoiceField
  readonly choices: ReadonlyArray<SettingChoice<string>>
}

type ToggleElements = {
  readonly checked: AttributeCell
}

type BindingRowElements = {
  readonly accessibleName: AttributeCell
  readonly value: TextCell
}

type SliderControls = Readonly<Record<SliderField, SliderElements>>
type ChoiceControls = Readonly<Record<ChoiceField, ChoiceElements>>
type ToggleControls = Readonly<Record<ToggleField, ToggleElements>>
type SettingsElements = {
  readonly sliders: SliderControls
  readonly choices: ChoiceControls
  readonly toggles: ToggleControls
  readonly bindingRows: Map<string, BindingRowElements>
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

const createSlider = (factory: DomElementFactory, root: DomElement, field: SliderField): SliderElements => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `settings-${field}-row`)
  createFieldCaption(factory, row, SLIDER_LABEL[field])
  const input = createSliderInput(factory, row, field)
  const output = factory.createElement('output')
  output.setAttribute('data-settings-field-output', field)
  row.appendChild(output)
  root.appendChild(row)
  return {
    input,
    maximum: attributeCell(input, 'max'),
    minimum: attributeCell(input, 'min'),
    output: textCell(output),
    previousValue: Number.NaN,
    step: attributeCell(input, 'step'),
  }
}

const createChoice = (
  factory: DomElementFactory,
  root: DomElement,
  { field, choices }: ChoiceFieldOptions,
): ChoiceElements => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `settings-${field}-row`)
  row.setAttribute('role', 'group')
  row.setAttribute('aria-label', CHOICE_LABEL[field])
  row.setAttribute('data-settings-field', field)
  createFieldCaption(factory, row, CHOICE_LABEL[field])
  const options = choices.map(({ label, value }) => {
    const button = factory.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute('data-interaction-target', 'settings-choice')
    button.setAttribute('data-settings-field', field)
    button.setAttribute('data-setting-value', value)
    button.setAttribute('aria-label', `${CHOICE_LABEL[field]}: ${label}`)
    button.textContent = label
    row.appendChild(button)
    return { selected: attributeCell(button, 'aria-pressed'), value }
  })
  root.appendChild(row)
  return options
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

const createSliderControls = (factory: DomElementFactory, root: DomElement): SliderControls => ({
  fovDegrees: createSlider(factory, root, 'fovDegrees'),
  masterVolume: createSlider(factory, root, 'masterVolume'),
  mouseSensitivity: createSlider(factory, root, 'mouseSensitivity'),
  sfxVolume: createSlider(factory, root, 'sfxVolume'),
  uiScale: createSlider(factory, root, 'uiScale'),
})

const createChoiceControls = (factory: DomElementFactory, root: DomElement): ChoiceControls => ({
  colorVisionCorrection: createChoice(factory, root, {
    choices: COLOR_VISION_CHOICES,
    field: 'colorVisionCorrection',
  }),
  difficulty: createChoice(factory, root, { choices: DIFFICULTY_CHOICES, field: 'difficulty' }),
  graphicsPreset: createChoice(factory, root, { choices: GRAPHICS_PRESET_CHOICES, field: 'graphicsPreset' }),
  reducedMotion: createChoice(factory, root, { choices: REDUCED_MOTION_CHOICES, field: 'reducedMotion' }),
})

const createToggleControls = (factory: DomElementFactory, root: DomElement): ToggleControls => ({
  audioEnabled: createToggle(factory, root, 'audioEnabled'),
  captionsEnabled: createToggle(factory, root, 'captionsEnabled'),
})

const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action

const createBindingControl = (factory: DomElementFactory, action: string, label: string) => {
  const button = factory.createElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('data-interaction-target', 'settings-binding')
  button.setAttribute('data-binding-action', action)
  button.setAttribute('aria-label', `Change ${label} key (currently ${UNBOUND_LABEL})`)
  return {
    button,
    elements: {
      accessibleName: attributeCell(button, 'aria-label'),
      value: textCell(button),
    },
  }
}

const createBindingRow = (factory: DomElementFactory, root: DomElement, action: string): BindingRowElements => {
  const label = actionLabel(action)
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', 'settings-binding-row')
  createFieldCaption(factory, row, label)
  const { button, elements } = createBindingControl(factory, action, label)
  row.appendChild(button)
  root.appendChild(row)
  return elements
}

const writeSlider = (elements: SliderElements, field: NumericSettingView): void => {
  writeAttribute(elements.minimum, String(field.minimum))
  writeAttribute(elements.maximum, String(field.maximum))
  writeAttribute(elements.step, String(field.step))
  if (elements.previousValue !== field.value) {
    elements.previousValue = field.value
    elements.input.value = String(field.value)
  }
  writeText(elements.output, field.label)
}

const writeChoice = (elements: ChoiceElements, selectedValue: string): void => {
  for (const option of elements) {
    writeAttribute(option.selected, ariaChecked(option.value === selectedValue))
  }
}

const writeSliders = (elements: SliderControls, model: SettingsViewModel): void => {
  writeSlider(elements.mouseSensitivity, model.mouseSensitivity)
  writeSlider(elements.masterVolume, model.masterVolume)
  writeSlider(elements.sfxVolume, model.sfxVolume)
  writeSlider(elements.fovDegrees, model.fovDegrees)
  writeSlider(elements.uiScale, model.uiScale)
}

const writeChoices = (elements: ChoiceControls, model: SettingsViewModel): void => {
  writeChoice(elements.difficulty, model.difficulty)
  writeChoice(elements.graphicsPreset, model.graphicsPreset)
  writeChoice(elements.reducedMotion, model.reducedMotion)
  writeChoice(elements.colorVisionCorrection, model.colorVisionCorrection)
}

const writeToggles = (elements: ToggleControls, model: SettingsViewModel): void => {
  writeAttribute(elements.audioEnabled.checked, ariaChecked(model.audioEnabled))
  writeAttribute(elements.captionsEnabled.checked, ariaChecked(model.captionsEnabled))
}

type BindingRenderContext = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly elements: Map<string, BindingRowElements>
  readonly rows: SettingsViewModel['bindingRows']
}

const writeBindingRows = ({ factory, root, elements, rows }: BindingRenderContext): void => {
  for (const row of rows) {
    const binding = elements.get(row.action) ?? createBindingRow(factory, root, row.action)
    elements.set(row.action, binding)
    writeText(binding.value, row.code ?? UNBOUND_LABEL)
    writeAttribute(
      binding.accessibleName,
      `Change ${actionLabel(row.action)} key (currently ${row.code ?? UNBOUND_LABEL})`,
    )
  }
}

type SettingsRenderContext = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly elements: SettingsElements
  readonly model: SettingsViewModel
}

const renderSettingsModel = ({ factory, root, elements, model }: SettingsRenderContext): void => {
  writeSliders(elements.sliders, model)
  writeChoices(elements.choices, model)
  writeToggles(elements.toggles, model)
  writeBindingRows({ elements: elements.bindingRows, factory, root, rows: model.bindingRows })
}

const isBindableAction = <Action extends string>(
  actions: ReadonlyArray<Action>,
  value: unknown,
): value is Action => typeof value === 'string' && actions.some((action) => action === value)

const invalidAction = (action: unknown): SettingsKeyRemappingFailure => {
  if (action === 'escape') {
    return { _tag: 'SettingsKeyRemappingFailure', reason: 'escape-is-not-bindable' }
  }
  return { _tag: 'SettingsKeyRemappingFailure', reason: 'unknown-action' }
}

const alignGraphicsPreset = (
  current: SettingsSnapshot,
  patch: Partial<SettingsSnapshot>,
) => {
  const merged = { ...current, ...patch }
  if (patch.graphicsPreset) {
    return { ...merged, graphicsQuality: patch.graphicsPreset }
  }
  if (patch.graphicsQuality) {
    return { ...merged, graphicsPreset: patch.graphicsQuality }
  }
  return merged
}

/** Returns a validated preview from the existing service without installing it. */
export const settingsCandidate = (
  service: Pick<SettingsServiceApi, 'snapshot' | 'candidate'>,
  patch: Partial<SettingsSnapshot>,
): Effect.Effect<
  EffectSuccess<SettingsCandidateEffect>,
  EffectFailure<SettingsSnapshotEffect | SettingsCandidateEffect> | SettingsUpdateFailure,
  EffectRequirements<SettingsSnapshotEffect | SettingsCandidateEffect>
> =>
  Effect.gen(function* settingsCandidateEffect() {
    const current = yield* service.snapshot
    if (!isValidSettings(alignGraphicsPreset(current, patch))) {
      return yield* Effect.fail({ _tag: 'InvalidSettingsUpdate' } as const)
    }
    return yield* service.candidate(patch)
  })

/** Validates before calling mc-sim so malformed values never get repaired into a successful update. */
export const updateSettings = (
  service: Pick<SettingsServiceApi, 'snapshot' | 'candidate' | 'update'>,
  patch: Partial<SettingsSnapshot>,
): Effect.Effect<
  EffectSuccess<SettingsUpdateEffect>,
  EffectFailure<SettingsSnapshotEffect | SettingsCandidateEffect | SettingsUpdateEffect> | SettingsUpdateFailure,
  EffectRequirements<SettingsSnapshotEffect | SettingsCandidateEffect | SettingsUpdateEffect>
> =>
  Effect.gen(function* updateSettingsEffect() {
    const candidate = yield* settingsCandidate(service, patch)
    return yield* service.update(candidate)
  })

/** Restores only a valid owner snapshot; the service remains the persistence authority. */
export const restoreSettings = (
  service: Pick<SettingsServiceApi, 'restore'>,
  value: unknown,
): Effect.Effect<
  EffectSuccess<SettingsRestoreEffect>,
  EffectFailure<SettingsRestoreEffect> | SettingsUpdateFailure,
  EffectRequirements<SettingsRestoreEffect>
> => {
  if (!isValidSettings(value)) {
    return Effect.fail({ _tag: 'InvalidSettingsUpdate' } as const)
  }
  return service.restore(value)
}

/** The service reset is the owner-defined restore-defaults operation. */
export const resetSettings = (service: Pick<SettingsServiceApi, 'reset'>): SettingsResetEffect => service.reset

/** Uses the supplied input policy and sim's conflict-swap/unbind service operations. */
export const rebindSettingsKey = <Action extends string>(
  service: Pick<SettingsServiceApi, 'rebindKey' | 'unbindKey'>,
  { inputPolicy, action, code }: SettingsKeyRemapRequest<Action>,
): Effect.Effect<
  EffectSuccess<SettingsRebindEffect | SettingsUnbindEffect>,
  EffectFailure<SettingsRebindEffect | SettingsUnbindEffect> | SettingsKeyRemappingFailure,
  EffectRequirements<SettingsRebindEffect | SettingsUnbindEffect>
> => {
  if (!isBindableAction(inputPolicy.bindableActions, action)) {
    return Effect.fail(invalidAction(action))
  }
  if (code === CLEAR_BINDING_CODE) {
    return service.unbindKey(inputAction(action))
  }
  if (typeof code !== 'string' || !KeyCode.is(code)) {
    return Effect.fail({ _tag: 'SettingsKeyRemappingFailure', reason: 'invalid-key' } as const)
  }
  const rejectionReason = inputPolicy.validateKeyCode(action, code)
  if (rejectionReason) {
    return Effect.fail({ _tag: 'SettingsKeyRemappingFailure', reason: rejectionReason } as const)
  }
  return service.rebindKey(inputAction(action), code)
}

export const unbindSettingsKey = <Action extends string>(
  service: Pick<SettingsServiceApi, 'unbindKey'>,
  inputPolicy: SettingsKeyInputPolicy<Action>,
  action: unknown,
): Effect.Effect<
  EffectSuccess<SettingsUnbindEffect>,
  EffectFailure<SettingsUnbindEffect> | SettingsKeyRemappingFailure,
  EffectRequirements<SettingsUnbindEffect>
> => {
  if (!isBindableAction(inputPolicy.bindableActions, action)) {
    return Effect.fail(invalidAction(action))
  }
  return service.unbindKey(inputAction(action))
}

/** Creates a listener-free settings projection. The host owns every interaction. */
export const createSettingsView = (factory: DomElementFactory, parent: DomElement): SettingsView => {
  const root = createRoot(factory, parent)
  const elements: SettingsElements = {
    bindingRows: new Map(),
    choices: createChoiceControls(factory, root),
    sliders: createSliderControls(factory, root),
    toggles: createToggleControls(factory, root),
  }

  return {
    render: (model: SettingsViewModel): void => renderSettingsModel({ elements, factory, model, root }),
    root,
  }
}
