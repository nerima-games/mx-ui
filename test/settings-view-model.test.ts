import { DIFFICULTIES } from '@nerima-games/mc-kernel/domain/game-mode'
import {
  FieldOfViewDegrees,
  InputAction as KernelInputAction,
  KeyCode as KernelKeyCode,
  MouseSensitivity,
  VolumeLevel,
} from '@nerima-games/mc-kernel/domain/settings'
import { DEFAULT_SETTINGS, isValidSettings } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  COLOR_VISION_CHOICES,
  DIFFICULTY_CHOICES,
  GRAPHICS_PRESET_CHOICES,
  REDUCED_MOTION_CHOICES,
  settingsViewModel,
  type SettingsSnapshot,
  type SettingsViewModel,
} from '../src/domain/settings-view-model'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

const SNAPSHOT: SettingsSnapshot = {
  ...DEFAULT_SETTINGS,
  difficulty: 'hard',
  fovDegrees: FieldOfViewDegrees(92),
  graphicsPreset: 'high',
  graphicsQuality: 'high',
  keyBindings: {
    ...DEFAULT_SETTINGS.keyBindings,
    [KernelInputAction('jump')]: KernelKeyCode('Space'),
    [KernelInputAction('moveForward')]: KernelKeyCode('KeyI'),
  },
  masterVolume: VolumeLevel(0.8),
  mouseSensitivity: MouseSensitivity(1.2),
  reducedMotion: 'reduced',
  sfxVolume: VolumeLevel(0.42),
  uiScale: 1.25,
}

const makeModelResult = (input: unknown) => settingsViewModel(input, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS)

const project = (input: unknown): SettingsViewModel => {
  const result = makeModelResult(input)
  if (Result.isSuccess(result)) {
    return result.success
  }
  throw new Error('Expected a valid Settings snapshot')
}

describe('settingsViewModel', () => {
  it('projects mc-sim values and render-owned binding rows without a local settings shape', () => {
    const model = project(SNAPSHOT)

    expect(model.difficulty).toBe('hard')
    expect(model.graphicsPreset).toBe('high')
    expect(model.reducedMotion).toBe('reduced')
    expect(model.colorVisionCorrection).toBe('off')
    expect(model.mouseSensitivity).toStrictEqual({ label: '1.2×', maximum: 3, minimum: 0.1, step: 0.1, value: 1.2 })
    expect(model.masterVolume).toStrictEqual({ label: '80%', maximum: 1, minimum: 0, step: 0.01, value: 0.8 })
    expect(model.sfxVolume).toStrictEqual({ label: '42%', maximum: 1, minimum: 0, step: 0.01, value: 0.42 })
    expect(model.fovDegrees).toStrictEqual({ label: '92°', maximum: 110, minimum: 30, step: 1, value: 92 })
    expect(model.uiScale).toStrictEqual({ label: '1.25×', maximum: 1.5, minimum: 0.75, step: 0.05, value: 1.25 })
    expect(model.audioEnabled).toBe(true)
    expect(model.captionsEnabled).toBe(DEFAULT_SETTINGS.captionsEnabled)
  })

  it('projects generated in-range numeric settings without changing their values or labels', () => {
    const numericSettings = fc.record({
      fovDegrees: fc.integer({ min: 30, max: 110 }).map((value) => FieldOfViewDegrees(value)),
      masterVolume: fc.integer({ min: 0, max: 100 }).map((value) => VolumeLevel(value / 100)),
      mouseSensitivity: fc.integer({ min: 1, max: 30 }).map((value) => MouseSensitivity(value / 10)),
      sfxVolume: fc.integer({ min: 0, max: 100 }).map((value) => VolumeLevel(value / 100)),
      uiScale: fc.integer({ min: 75, max: 150 }).map((value) => value / 100),
    })

    fc.assert(
      fc.property(numericSettings, (values) => {
        const result = makeModelResult({ ...SNAPSHOT, ...values })
        if (Result.isFailure(result)) {
          return false
        }

        return (
          result.success.fovDegrees.value === values.fovDegrees &&
          result.success.fovDegrees.label === `${String(values.fovDegrees)}°` &&
          result.success.masterVolume.value === values.masterVolume &&
          result.success.masterVolume.label === `${String(Math.round(values.masterVolume * 100))}%` &&
          result.success.mouseSensitivity.value === values.mouseSensitivity &&
          result.success.mouseSensitivity.label === `${String(values.mouseSensitivity)}×` &&
          result.success.sfxVolume.value === values.sfxVolume &&
          result.success.sfxVolume.label === `${String(Math.round(values.sfxVolume * 100))}%` &&
          result.success.uiScale.value === values.uiScale &&
          result.success.uiScale.label === `${String(values.uiScale)}×`
        )
      }),
      { numRuns: 200, seed: 20261028 },
    )
  })

  it('exposes every render-owned bindable action in stable order, including unbound actions', () => {
    const model = project(SNAPSHOT)

    const actions = TEST_BINDABLE_ACTIONS
    expect(model.bindingRows.map(({ action }) => action)).toStrictEqual(actions)
    expect(model.bindingRows).toHaveLength(actions.length)
    expect(model.bindingRows.find(({ action }) => action === 'moveForward')?.code).toBe('KeyI')
    expect(model.bindingRows.find(({ action }) => action === 'jump')?.code).toBe('Space')
    expect(model.bindingRows.find(({ action }) => action === 'attack')?.code).toBe(TEST_DEFAULT_BINDINGS.attack)
  })

  it('uses sim and kernel option sets for the selectors', () => {
    expect(DIFFICULTY_CHOICES.map(({ value }) => value)).toStrictEqual(DIFFICULTIES)
    expect(GRAPHICS_PRESET_CHOICES.map(({ value }) => value)).toStrictEqual(['low', 'medium', 'high', 'ultra'])
    expect(REDUCED_MOTION_CHOICES.map(({ value }) => value)).toStrictEqual(['system', 'full', 'reduced'])
    expect(COLOR_VISION_CHOICES.map(({ value }) => value)).toStrictEqual([
      'off',
      'protanopia',
      'deuteranopia',
      'tritanopia',
    ])
  })

  it('projects each graphics preset value for a selectable option', () => {
    for (const { value } of GRAPHICS_PRESET_CHOICES) {
      const result = makeModelResult({ ...SNAPSHOT, graphicsPreset: value, graphicsQuality: value })

      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.graphicsPreset).toBe(value)
      }
    }
  })

  it('returns a typed failure for null, missing, and invalid tagged settings input', () => {
    for (const input of [null, undefined, {}, { _tag: 'Settings', ...SNAPSHOT, difficulty: 'nightmare' }]) {
      expect(makeModelResult(input)).toStrictEqual(
        Result.fail({ _tag: 'InvalidSettingsSnapshot' }),
      )
    }
  })

  it('keeps a non-action host row unbound without treating it as a settings action', () => {
    const emptyAction = ''
    const result = settingsViewModel(SNAPSHOT, { [emptyAction]: KernelKeyCode('KeyE') }, [emptyAction])

    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success.bindingRows).toStrictEqual([{ action: emptyAction, code: KernelKeyCode('KeyE') }])
    }
  })

  it('uses the owner validator as published, including its current extra-field behavior', () => {
    const withExtraField = { ...SNAPSHOT, extraField: true }

    expect(isValidSettings(withExtraField)).toBe(true)
    expect(Result.isSuccess(makeModelResult(withExtraField))).toBe(true)
  })

  it('returns a deeply frozen view model and bindings list', () => {
    const model = project(SNAPSHOT)

    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.bindingRows)).toBe(true)
    expect(model.bindingRows.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(model.fovDegrees)).toBe(true)
    expect(Object.isFrozen(model.uiScale)).toBe(true)
  })

  it.each([
    ['fovDegrees', 30, 110],
    ['uiScale', 0.75, 1.5],
    ['mouseSensitivity', 0.1, 3],
    ['masterVolume', 0, 1],
    ['sfxVolume', 0, 1],
  ] as const)('%s accepts both owner endpoints and rejects values immediately outside them', (field, minimum, maximum) => {
    const atMinimum = { ...SNAPSHOT, [field]: minimum }
    const atMaximum = { ...SNAPSHOT, [field]: maximum }
    const belowMinimum = { ...SNAPSHOT, [field]: minimum - 0.001 }
    const aboveMaximum = { ...SNAPSHOT, [field]: maximum + 0.001 }

    expect(Result.isSuccess(makeModelResult(atMinimum))).toBe(true)
    expect(Result.isSuccess(makeModelResult(atMaximum))).toBe(true)
    expect(Result.isFailure(makeModelResult(belowMinimum))).toBe(true)
    expect(Result.isFailure(makeModelResult(aboveMaximum))).toBe(true)
  })

  it.each([
    ['fovDegrees', Number.NaN],
    ['fovDegrees', Number.POSITIVE_INFINITY],
    ['fovDegrees', Number.NEGATIVE_INFINITY],
    ['uiScale', Number.NaN],
    ['uiScale', Number.POSITIVE_INFINITY],
    ['uiScale', Number.NEGATIVE_INFINITY],
    ['mouseSensitivity', Number.NaN],
    ['mouseSensitivity', Number.POSITIVE_INFINITY],
    ['mouseSensitivity', Number.NEGATIVE_INFINITY],
    ['masterVolume', Number.NaN],
    ['masterVolume', Number.POSITIVE_INFINITY],
    ['masterVolume', Number.NEGATIVE_INFINITY],
    ['sfxVolume', Number.NaN],
    ['sfxVolume', Number.POSITIVE_INFINITY],
    ['sfxVolume', Number.NEGATIVE_INFINITY],
  ] as const)('%s rejects non-finite values (%s)', (field, value) => {
    const malformed = { ...SNAPSHOT, [field]: value }

    expect(Result.isFailure(makeModelResult(malformed))).toBe(true)
  })
})
