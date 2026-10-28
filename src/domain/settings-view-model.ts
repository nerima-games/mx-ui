/** Presentation projection for the settings owned and held by mc-sim. */
import { DIFFICULTIES, type Difficulty } from '@nerima-games/mc-kernel/domain/game-mode'
import {
  GRAPHICS_QUALITIES,
  MAX_FOV_DEGREES,
  MAX_MOUSE_SENSITIVITY,
  MAX_VOLUME,
  MIN_FOV_DEGREES,
  MIN_MOUSE_SENSITIVITY,
  MIN_VOLUME,
  type Settings,
  isValidSettings,
} from '@nerima-games/mc-sim'
import { type KeyCode, InputAction as inputAction } from '@nerima-games/mc-kernel/domain/settings'
import { Result } from 'effect'

const UI_SCALE_MIN = 0.75
const UI_SCALE_MAX = 1.5
const FOV_STEP = 1
const VOLUME_STEP = 0.01
const SENSITIVITY_STEP = 0.1
const UI_SCALE_STEP = 0.05
const PERCENT_SCALE = 100

const FOV_BOUNDS = { maximum: MAX_FOV_DEGREES, minimum: MIN_FOV_DEGREES, step: FOV_STEP }
const VOLUME_BOUNDS = { maximum: MAX_VOLUME, minimum: MIN_VOLUME, step: VOLUME_STEP }
const SENSITIVITY_BOUNDS = {
  maximum: MAX_MOUSE_SENSITIVITY,
  minimum: MIN_MOUSE_SENSITIVITY,
  step: SENSITIVITY_STEP,
}
const UI_SCALE_BOUNDS = { maximum: UI_SCALE_MAX, minimum: UI_SCALE_MIN, step: UI_SCALE_STEP }

export type SettingsSnapshot = Settings
export type GraphicsPreset = Settings['graphicsPreset']
export type ReducedMotionSetting = Settings['reducedMotion']
export type ColorVisionCorrection = Settings['colorVisionCorrection']

export type NumericSettingView = {
  readonly value: number
  readonly minimum: number
  readonly maximum: number
  readonly step: number
  readonly label: string
}

export type SettingChoice<Value extends string> = {
  readonly value: Value
  readonly label: string
}

export type SettingsBindingRow<Action extends string = string> = {
  readonly action: Action
  readonly code: KeyCode | undefined
}

export type SettingsViewModel<Action extends string = string> = {
  readonly difficulty: Difficulty
  readonly graphicsPreset: GraphicsPreset
  readonly reducedMotion: ReducedMotionSetting
  readonly colorVisionCorrection: ColorVisionCorrection
  readonly mouseSensitivity: NumericSettingView
  readonly masterVolume: NumericSettingView
  readonly sfxVolume: NumericSettingView
  readonly fovDegrees: NumericSettingView
  readonly uiScale: NumericSettingView
  readonly audioEnabled: boolean
  readonly captionsEnabled: boolean
  readonly bindingRows: ReadonlyArray<SettingsBindingRow<Action>>
}

export type SettingsViewModelFailure = {
  readonly _tag: 'InvalidSettingsSnapshot'
}

const REDUCED_MOTION_SETTINGS: ReadonlyArray<ReducedMotionSetting> = ['system', 'full', 'reduced']
const COLOR_VISION_CORRECTIONS: ReadonlyArray<ColorVisionCorrection> = [
  'off',
  'protanopia',
  'deuteranopia',
  'tritanopia',
]
const titleLabel = (value: string): string => value.replace(/^./u, (firstCharacter) => firstCharacter.toUpperCase())

export const DIFFICULTY_CHOICES: ReadonlyArray<SettingChoice<Difficulty>> = DIFFICULTIES.map(
  (value) => Object.freeze({ label: titleLabel(value), value }),
)

export const GRAPHICS_PRESET_CHOICES: ReadonlyArray<SettingChoice<GraphicsPreset>> = GRAPHICS_QUALITIES.map(
  (value) => Object.freeze({ label: titleLabel(value), value }),
)

export const REDUCED_MOTION_CHOICES: ReadonlyArray<SettingChoice<ReducedMotionSetting>> =
  REDUCED_MOTION_SETTINGS.map((value) => Object.freeze({ label: value, value }))

export const COLOR_VISION_CHOICES: ReadonlyArray<SettingChoice<ColorVisionCorrection>> =
  COLOR_VISION_CORRECTIONS.map((value) => Object.freeze({ label: value, value }))

const numericField = (
  value: number,
  bounds: { readonly minimum: number; readonly maximum: number; readonly step: number },
  format: (value: number) => string,
): NumericSettingView => Object.freeze({ label: format(value), ...bounds, value })

const percentLabel = (value: number): string => `${String(Math.round(value * PERCENT_SCALE))}%`

const bindingRow = <Action extends string>(
  settings: Settings,
  defaultBindings: Readonly<Record<Action, KeyCode>>,
  action: Action,
): SettingsBindingRow<Action> => {
  let code = defaultBindings[action]
  if (inputAction.is(action)) {
    code = settings.keyBindings[action] ?? code
  }
  return Object.freeze({
    action,
    code,
  })
}

/** Rejects malformed snapshots with the sim-owned validator; no fallback or normalization is applied. */
export const settingsViewModel = <Action extends string>(
  input: unknown,
  defaultBindings: Readonly<Record<Action, KeyCode>>,
  bindableActions: ReadonlyArray<Action>,
): Result.Result<SettingsViewModel<Action>, SettingsViewModelFailure> => {
  if (!isValidSettings(input)) {
    return Result.fail({ _tag: 'InvalidSettingsSnapshot' })
  }

  return Result.succeed(
    Object.freeze({
      audioEnabled: input.audioEnabled,
      bindingRows: Object.freeze(
        bindableActions.map((action) => bindingRow(input, defaultBindings, action)),
      ),
      captionsEnabled: input.captionsEnabled,
      colorVisionCorrection: input.colorVisionCorrection,
      difficulty: input.difficulty,
      fovDegrees: numericField(input.fovDegrees, FOV_BOUNDS, (value) => `${String(value)}°`),
      graphicsPreset: input.graphicsPreset,
      masterVolume: numericField(input.masterVolume, VOLUME_BOUNDS, percentLabel),
      mouseSensitivity: numericField(input.mouseSensitivity, SENSITIVITY_BOUNDS, (value) => `${String(value)}×`),
      reducedMotion: input.reducedMotion,
      sfxVolume: numericField(input.sfxVolume, VOLUME_BOUNDS, percentLabel),
      uiScale: numericField(input.uiScale, UI_SCALE_BOUNDS, (value) => `${String(value)}×`),
    }),
  )
}
