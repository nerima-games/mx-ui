/** Settings controls projected from the mc-sim snapshot with host action callbacks. */
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
import type { DomElement, DomElementFactory, DomInputElement, DomInteractiveElement } from './dom-surface.js'
import { KeyCode, InputAction as inputAction } from '@nerima-games/mc-kernel/domain/settings'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { type SettingsServiceApi, isValidSettings } from '@nerima-games/mc-sim'
import type { UiMessageKey, UiMessageValues } from '../domain/ui-language.js'
import {
  inheritUiLanguage,
  setLocalizedAttribute,
  setLocalizedText,
  writeLocalizedAttribute,
  writeLocalizedText,
} from './ui-localization.js'
import { Effect } from 'effect'

export type SettingsView = {
  readonly root: DomElement
  readonly render: (model: SettingsViewModel) => void
}

export type SettingsSliderField =
  | 'mouseSensitivity'
  | 'masterVolume'
  | 'sfxVolume'
  | 'fovDegrees'
  | 'uiScale'

export type SettingsChoiceField = 'difficulty' | 'graphicsPreset' | 'reducedMotion' | 'colorVisionCorrection'
export type SettingsToggleField = 'audioEnabled' | 'captionsEnabled'

export type SettingsViewActions = {
  readonly onClose?: () => void
  readonly onSliderChange?: (field: SettingsSliderField, value: number) => void
  readonly onChoiceChange?: (field: SettingsChoiceField, value: string) => void
  readonly onToggleChange?: (field: SettingsToggleField, checked: boolean) => void
  readonly onBindingActivate?: (action: string) => void
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

type SliderField = SettingsSliderField
type ChoiceField = SettingsChoiceField
type ToggleField = SettingsToggleField

const SLIDER_MESSAGE_KEY: Readonly<Record<SliderField, UiMessageKey>> = {
  fovDegrees: 'settings.field-of-view',
  masterVolume: 'settings.master-volume',
  mouseSensitivity: 'settings.look-sensitivity',
  sfxVolume: 'settings.sfx-volume',
  uiScale: 'settings.ui-scale',
}

const CHOICE_MESSAGE_KEY: Readonly<Record<ChoiceField, UiMessageKey>> = {
  colorVisionCorrection: 'settings.color-vision',
  difficulty: 'settings.difficulty',
  graphicsPreset: 'settings.graphics-preset',
  reducedMotion: 'settings.reduced-motion',
}

const CHOICE_VALUE_MESSAGE_KEY: Readonly<{
  [Field in ChoiceField]: Readonly<Record<SettingsViewModel[Field], UiMessageKey>>
}> = {
  colorVisionCorrection: {
    deuteranopia: 'settings.choice.color.deuteranopia',
    off: 'settings.choice.color.off',
    protanopia: 'settings.choice.color.protanopia',
    tritanopia: 'settings.choice.color.tritanopia',
  },
  difficulty: {
    easy: 'settings.choice.difficulty.easy',
    hard: 'settings.choice.difficulty.hard',
    normal: 'settings.choice.difficulty.normal',
    peaceful: 'settings.choice.difficulty.peaceful',
  },
  graphicsPreset: {
    high: 'settings.choice.graphics.high',
    low: 'settings.choice.graphics.low',
    medium: 'settings.choice.graphics.medium',
    ultra: 'settings.choice.graphics.ultra',
  },
  reducedMotion: {
    full: 'settings.choice.motion.full',
    reduced: 'settings.choice.motion.reduced',
    system: 'settings.choice.motion.system',
  },
}

const TOGGLE_MESSAGE_KEY: Readonly<Record<ToggleField, UiMessageKey>> = {
  audioEnabled: 'settings.audio-enabled',
  captionsEnabled: 'settings.sound-captions',
}

const ACTION_MESSAGE_KEY: Readonly<Record<string, UiMessageKey>> = {
  attack: 'settings.action.attack',
  escape: 'settings.action.pause-menu',
  hotbarSlot1: 'settings.action.hotbar-1',
  hotbarSlot2: 'settings.action.hotbar-2',
  hotbarSlot3: 'settings.action.hotbar-3',
  hotbarSlot4: 'settings.action.hotbar-4',
  hotbarSlot5: 'settings.action.hotbar-5',
  hotbarSlot6: 'settings.action.hotbar-6',
  hotbarSlot7: 'settings.action.hotbar-7',
  hotbarSlot8: 'settings.action.hotbar-8',
  hotbarSlot9: 'settings.action.hotbar-9',
  jump: 'settings.action.jump',
  moveBackward: 'settings.action.move-backward',
  moveForward: 'settings.action.move-forward',
  moveLeft: 'settings.action.move-left',
  moveRight: 'settings.action.move-right',
  openChat: 'settings.action.chat',
  openInventory: 'settings.action.inventory',
  pickBlock: 'settings.action.pick-block',
  sneak: 'settings.action.sneak',
  sprint: 'settings.action.sprint',
  use: 'settings.action.use',
}

const CLEAR_BINDING_CODE = 'Backspace'
const FIRST_CHOICE_INDEX = 0
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
  readonly button: DomInteractiveElement
  readonly selected: AttributeCell
  readonly tabStop: AttributeCell
}

type ChoiceElements = ReadonlyArray<ChoiceOptionElements>

type ToggleElements = {
  readonly button: DomInteractiveElement
  readonly checked: AttributeCell
  currentValue: boolean
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

const createCloseButton = (
  factory: DomElementFactory,
  root: DomElement,
  actions: SettingsViewActions | undefined,
): void => {
  if (typeof actions?.onClose !== 'function') {
    return
  }
  const close: DomInteractiveElement = factory.createElement('button')
  close.setAttribute('type', 'button')
  close.setAttribute('data-mx-ui', 'settings-close')
  setLocalizedAttribute(close, 'aria-label', 'settings.close')
  setLocalizedText(close, 'settings.close')
  close.addEventListener('click', actions.onClose)
  root.appendChild(close)
}

const createFieldCaption = (factory: DomElementFactory, row: DomElement, key: UiMessageKey): void => {
  const caption = factory.createElement('span')
  inheritUiLanguage(row, caption)
  setLocalizedText(caption, key)
  row.appendChild(caption)
}

const choiceMessageKey = <Field extends ChoiceField>(
  field: Field,
  value: SettingsViewModel[Field],
): UiMessageKey => CHOICE_VALUE_MESSAGE_KEY[field][value]

type SettingsControlContext = Readonly<{
  factory: DomElementFactory
  root: DomElement
  actions: SettingsViewActions | undefined
}>

const wireSliderInput = (
  input: DomInputElement,
  field: SliderField,
  actions: SettingsViewActions | undefined,
): void => {
  if (typeof actions?.onSliderChange === 'function') {
    input.addEventListener('input', () => actions.onSliderChange?.(field, Number(input.value)))
  }
}

const createSliderOutput = (factory: DomElementFactory, row: DomElement, field: SliderField): DomElement => {
  const output = factory.createElement('output')
  output.setAttribute('data-settings-field-output', field)
  row.appendChild(output)
  return output
}

const createSliderInput = (factory: DomElementFactory, row: DomElement, field: SliderField): DomInputElement => {
  const input: DomInputElement = factory.createElement('input')
  input.setAttribute('type', 'range')
  input.setAttribute('data-settings-field', field)
  input.setAttribute('data-focus-group', `settings-slider-${field}`)
  input.setAttribute('data-focus-index', '0')
  input.setAttribute('data-focus-columns', '1')
  setLocalizedAttribute(input, 'aria-label', SLIDER_MESSAGE_KEY[field])
  row.appendChild(input)
  return input
}

const createSlider = ({ actions, factory, root }: SettingsControlContext, field: SliderField): SliderElements => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `settings-${field}-row`)
  createFieldCaption(factory, row, SLIDER_MESSAGE_KEY[field])
  const input = createSliderInput(factory, row, field)
  wireSliderInput(input, field, actions)
  const output = createSliderOutput(factory, row, field)
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

type ChoiceButtonContext<Field extends ChoiceField> = Readonly<{
  button: DomInteractiveElement
  field: Field
  value: SettingsViewModel[Field]
  index: number
  choiceCount: number
}>

const configureChoiceButtonMembership = <Field extends ChoiceField>({ button, choiceCount, field, index, value }: ChoiceButtonContext<Field>): void => {
  button.setAttribute('data-interaction-target', 'settings-choice')
  button.setAttribute('data-settings-field', field)
  button.setAttribute('data-setting-value', value)
  button.setAttribute('data-focus-group', `settings-choice-${field}`)
  button.setAttribute('data-focus-index', String(index))
  button.setAttribute('data-focus-columns', String(choiceCount))
}

const configureChoiceButtonLabel = <Field extends ChoiceField>(context: ChoiceButtonContext<Field>): void => {
  const messageKey = choiceMessageKey(context.field, context.value)
  const ariaValues = {
    choice: { key: messageKey },
    setting: { key: CHOICE_MESSAGE_KEY[context.field] },
  }
  setLocalizedAttribute(context.button, 'aria-label', 'settings.choice-aria', ariaValues)
  setLocalizedText(context.button, messageKey)
}

const wireChoiceButton = <Field extends ChoiceField>(
  context: ChoiceOptionContext<Field>,
  button: DomInteractiveElement,
): void => {
  if (typeof context.actions?.onChoiceChange === 'function') {
    button.addEventListener('click', () => context.actions?.onChoiceChange?.(context.field, context.value))
  }
}

type ChoiceOptionContext<Field extends ChoiceField> = Readonly<{
  factory: DomElementFactory
  row: DomElement
  field: Field
  value: SettingsViewModel[Field]
  index: number
  choiceCount: number
  actions: SettingsViewActions | undefined
}>

const createChoiceButton = <Field extends ChoiceField>(context: ChoiceOptionContext<Field>): DomInteractiveElement => {
  const button: DomInteractiveElement = context.factory.createElement('button')
  inheritUiLanguage(context.row, button)
  button.setAttribute('type', 'button')
  const buttonContext = {
    button,
    choiceCount: context.choiceCount,
    field: context.field,
    index: context.index,
    value: context.value,
  }
  configureChoiceButtonMembership(buttonContext)
  configureChoiceButtonLabel(buttonContext)
  wireChoiceButton(context, button)
  return button
}

const createChoiceOption = <Field extends ChoiceField>(
  context: ChoiceOptionContext<Field>,
): ChoiceOptionElements => {
  const button = createChoiceButton(context)
  context.row.appendChild(button)
  return {
    button,
    selected: attributeCell(button, 'aria-pressed'),
    tabStop: attributeCell(button, 'tabindex'),
    value: context.value,
  }
}

const createChoice = <Field extends ChoiceField>(
  context: SettingsControlContext,
  { field, choices }: Readonly<{
    field: Field
    choices: ReadonlyArray<SettingChoice<SettingsViewModel[Field]>>
  }>,
): ChoiceElements => {
  const { actions, factory, root } = context
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `settings-${field}-row`)
  row.setAttribute('role', 'group')
  setLocalizedAttribute(row, 'aria-label', CHOICE_MESSAGE_KEY[field])
  row.setAttribute('data-settings-field', field)
  createFieldCaption(factory, row, CHOICE_MESSAGE_KEY[field])
  const options = choices.map(({ value }, index) => createChoiceOption({
    actions,
    choiceCount: choices.length,
    factory,
    field,
    index,
    row,
    value,
  }))
  root.appendChild(row)
  return options
}

const setFocusMembership = (element: DomElement, group: string): void => {
  element.setAttribute('data-focus-group', group)
  element.setAttribute('data-focus-index', '0')
  element.setAttribute('data-focus-columns', '1')
}

const configureToggleButton = (
  button: DomInteractiveElement,
  root: DomElement,
  field: ToggleField,
): void => {
  const key = TOGGLE_MESSAGE_KEY[field]
  inheritUiLanguage(root, button)
  button.setAttribute('type', 'button')
  button.setAttribute('role', 'switch')
  button.setAttribute('data-interaction-target', 'settings-toggle')
  button.setAttribute('data-settings-field', field)
  setFocusMembership(button, `settings-toggle-${field}`)
  button.setAttribute('tabindex', '0')
  setLocalizedAttribute(button, 'aria-label', key)
  setLocalizedText(button, key)
}

const createToggle = (context: SettingsControlContext, field: ToggleField): ToggleElements => {
  const { actions, factory, root } = context
  const button: DomInteractiveElement = factory.createElement('button')
  configureToggleButton(button, root, field)
  const elements: ToggleElements = { button, checked: attributeCell(button, 'aria-checked'), currentValue: false }
  if (typeof actions?.onToggleChange === 'function') {
    button.addEventListener('click', () => {
      actions.onToggleChange?.(field, !elements.currentValue)
    })
  }
  root.appendChild(button)
  return elements
}

const createSliderControls = (
  context: SettingsControlContext,
): SliderControls => ({
  fovDegrees: createSlider(context, 'fovDegrees'),
  masterVolume: createSlider(context, 'masterVolume'),
  mouseSensitivity: createSlider(context, 'mouseSensitivity'),
  sfxVolume: createSlider(context, 'sfxVolume'),
  uiScale: createSlider(context, 'uiScale'),
})

const createChoiceControls = (
  context: SettingsControlContext,
): ChoiceControls => ({
  colorVisionCorrection: createChoice(context, {
    choices: COLOR_VISION_CHOICES,
    field: 'colorVisionCorrection',
  }),
  difficulty: createChoice(context, { choices: DIFFICULTY_CHOICES, field: 'difficulty' }),
  graphicsPreset: createChoice(context, { choices: GRAPHICS_PRESET_CHOICES, field: 'graphicsPreset' }),
  reducedMotion: createChoice(context, { choices: REDUCED_MOTION_CHOICES, field: 'reducedMotion' }),
})

const createToggleControls = (
  context: SettingsControlContext,
): ToggleControls => ({
  audioEnabled: createToggle(context, 'audioEnabled'),
  captionsEnabled: createToggle(context, 'captionsEnabled'),
})

const actionMessageKey = (action: string): UiMessageKey => ACTION_MESSAGE_KEY[action] ?? 'settings.action.unknown'

const configureBindingButton = (button: DomInteractiveElement, action: string): void => {
  button.setAttribute('type', 'button')
  button.setAttribute('data-interaction-target', 'settings-binding')
  button.setAttribute('data-binding-action', action)
  setFocusMembership(button, `settings-binding-${action}`)
  button.setAttribute('tabindex', '0')
}

const wireBindingButton = (
  button: DomInteractiveElement,
  action: string,
  actions: SettingsViewActions | undefined,
): void => {
  if (typeof actions?.onBindingActivate === 'function') {
    button.addEventListener('click', () => actions.onBindingActivate?.(action))
  }
}

const createBindingControl = (
  context: SettingsControlContext,
  action: string,
  labelKey: UiMessageKey,
) => {
  const button: DomInteractiveElement = context.factory.createElement('button')
  configureBindingButton(button, action)
  wireBindingButton(button, action, context.actions)
  const values: UiMessageValues = { key: { key: 'settings.unbound' }, label: { key: labelKey } }
  setLocalizedAttribute(button, 'aria-label', 'settings.change-key', values)
  return {
    button,
    elements: {
      accessibleName: attributeCell(button, 'aria-label'),
      value: textCell(button),
},
  }
}

const createBindingRow = (
  context: SettingsControlContext,
  action: string,
): BindingRowElements => {
  const labelKey = actionMessageKey(action)
  const row = context.factory.createElement('div')
  inheritUiLanguage(context.root, row)
  row.setAttribute('data-mx-ui', 'settings-binding-row')
  createFieldCaption(context.factory, row, labelKey)
  const { button, elements } = createBindingControl(context, action, labelKey)
  inheritUiLanguage(row, button)
  row.appendChild(button)
  context.root.appendChild(row)
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

const choiceTabStopValue = (selected: boolean, hasSelectedValue: boolean, index: number): string => {
  if (selected || (!hasSelectedValue && index === FIRST_CHOICE_INDEX)) {
    return '0'
  }
  return '-1'
}

const writeChoice = (elements: ChoiceElements, selectedValue: string): void => {
  const hasSelectedValue = elements.some((option) => option.value === selectedValue)
  for (const [index, option] of elements.entries()) {
    const selected = option.value === selectedValue
    writeAttribute(option.selected, ariaChecked(selected))
    writeAttribute(option.tabStop, choiceTabStopValue(selected, hasSelectedValue, index))
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
  elements.audioEnabled.currentValue = model.audioEnabled
  elements.captionsEnabled.currentValue = model.captionsEnabled
  writeAttribute(elements.audioEnabled.checked, ariaChecked(model.audioEnabled))
  writeAttribute(elements.captionsEnabled.checked, ariaChecked(model.captionsEnabled))
}

type BindingRenderContext = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly actions: SettingsViewActions | undefined
  readonly elements: Map<string, BindingRowElements>
  readonly rows: SettingsViewModel['bindingRows']
}

const bindingNameValue = (code: string | undefined): string | Readonly<{ key: UiMessageKey }> => {
  if (typeof code === 'undefined') {
    return { key: 'settings.unbound' }
  }
  return code
}

const writeBindingRows = ({ actions, factory, root, elements, rows }: BindingRenderContext): void => {
  for (const row of rows) {
    const binding = elements.get(row.action) ?? createBindingRow({ actions, factory, root }, row.action)
    elements.set(row.action, binding)
    if (typeof row.code === 'undefined') {
      writeLocalizedText(binding.value, 'settings.unbound')
    } else {
      writeText(binding.value, row.code)
    }
    writeLocalizedAttribute(binding.accessibleName, 'settings.change-key', {
      key: bindingNameValue(row.code),
      label: { key: actionMessageKey(row.action) },
    })
  }
}

type SettingsRenderContext = {
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly elements: SettingsElements
  readonly model: SettingsViewModel
  readonly actions: SettingsViewActions | undefined
}

const renderSettingsModel = ({ actions, factory, root, elements, model }: SettingsRenderContext): void => {
  writeSliders(elements.sliders, model)
  writeChoices(elements.choices, model)
  writeToggles(elements.toggles, model)
  writeBindingRows({ actions, elements: elements.bindingRows, factory, root, rows: model.bindingRows })
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

/** Projects settings and wires optional native action callbacks. */
export const createSettingsView = (
  factory: DomElementFactory,
  parent: DomElement,
  actions?: SettingsViewActions,
): SettingsView => {
  const root = createRoot(factory, parent)
  createCloseButton(factory, root, actions)
  const context: SettingsControlContext = { actions, factory, root }
  const elements: SettingsElements = {
    bindingRows: new Map(),
    choices: createChoiceControls(context),
    sliders: createSliderControls(context),
    toggles: createToggleControls(context),
  }

  return {
    render: (model: SettingsViewModel): void => renderSettingsModel({ actions, elements, factory, model, root }),
    root,
  }
}
