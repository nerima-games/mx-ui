import { describe, expect, it } from 'vitest'
import type { InputAction } from '../src/domain/accessibility'
import {
  SETTINGS_BINDABLE_ACTIONS,
  settingsViewModel,
  type SettingsSnapshot,
} from '../src/domain/settings-view-model'

const SNAPSHOT: SettingsSnapshot = {
  audioEnabled: true,
  bindings: new Map<InputAction, string>([
    ['moveForward', 'KeyW'],
    ['jump', 'Space'],
  ]),
  captionsEnabled: false,
  masterVolume: 0.8,
  sensitivity: 1,
  sfxVolume: 0.42,
}

describe('settingsViewModel', () => {
  it('projects volumes and sensitivity as rounded percentages with labels', () => {
    const model = settingsViewModel(SNAPSHOT)

    expect(model.sensitivity).toStrictEqual({ label: '100%', percent: 100 })
    expect(model.masterVolume).toStrictEqual({ label: '80%', percent: 80 })
    expect(model.sfxVolume).toStrictEqual({ label: '42%', percent: 42 })
    expect(model.audioEnabled).toBe(true)
    expect(model.captionsEnabled).toBe(false)
  })

  it('lists every bindable action in a stable order, bound or not', () => {
    const model = settingsViewModel(SNAPSHOT)

    expect(model.bindingRows.map((row) => row.action)).toStrictEqual(SETTINGS_BINDABLE_ACTIONS)
    expect(model.bindingRows.find((row) => row.action === 'moveForward')?.code).toBe('KeyW')
    expect(model.bindingRows.find((row) => row.action === 'jump')?.code).toBe('Space')
    expect(model.bindingRows.find((row) => row.action === 'sneak')?.code).toBeUndefined()
  })

  it('returns deeply frozen presentation state', () => {
    const model = settingsViewModel(SNAPSHOT)

    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.bindingRows)).toBe(true)
    expect(model.bindingRows.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(model.sensitivity)).toBe(true)
    expect(Object.isFrozen(model.masterVolume)).toBe(true)
  })

  it('SECOND ANGLE — property: percent is always a non-negative integer, even for a malformed unit', () => {
    // A property test over the boundary/adversarial inputs a host snapshot
    // could plausibly carry, rather than one more example matching the happy
    // path above — this is the check that would catch a rounding regression
    // or a missing NaN guard that the example-based tests above cannot,
    // because they only ever exercise values already known to be well-formed.
    const samples = [
      0,
      0.005,
      0.1,
      0.5,
      1,
      1.75,
      3, // sensitivity's upper end is well above 1 — this must not be clamped to 100%
      -1,
      -0.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]

    for (const unit of samples) {
      const model = settingsViewModel({ ...SNAPSHOT, masterVolume: unit, sensitivity: unit })

      expect(Number.isInteger(model.masterVolume.percent)).toBe(true)
      expect(model.masterVolume.percent).toBeGreaterThanOrEqual(0)
      expect(model.masterVolume.label).toBe(`${String(model.masterVolume.percent)}%`)
      expect(model.sensitivity.percent).toBe(model.masterVolume.percent)
    }

    // The one case where percent legitimately exceeds 100 — sensitivity 3 → 300%.
    expect(settingsViewModel({ ...SNAPSHOT, sensitivity: 3 }).sensitivity.percent).toBe(300)
  })
})
