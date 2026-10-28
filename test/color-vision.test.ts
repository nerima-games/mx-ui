import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { applyColorVision, colorVisionCell, COLOR_VISION_ATTRIBUTE } from '../src/application/accessibility-dom'
import { COLOR_VISION_MODES, colorVisionAttribute, colorVisionMatrix } from '../src/domain/accessibility'
import { settingsViewModel } from '../src/domain/settings-view-model'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

const makeTarget = () => {
  const attributes = new Map<string, string>()
  return {
    attributes,
    removeAttribute: (name: string): void => {
      attributes.delete(name)
    },
    setAttribute: (name: string, value: string): void => {
      attributes.set(name, value)
    },
  }
}

describe('color vision settings projection', () => {
  it('uses the settings correction values and keeps off without a filter', () => {
    expect(COLOR_VISION_MODES).toStrictEqual(['off', 'protanopia', 'deuteranopia', 'tritanopia'])
    expect(colorVisionAttribute('off')).toBeUndefined()
    expect(colorVisionMatrix('off')).toBeUndefined()
    expect(colorVisionAttribute('protanopia')).toBe('protanopia')

    for (const mode of COLOR_VISION_MODES) {
      expect(COLOR_VISION_MODES).toContain(mode)
      const projected = settingsViewModel(
        { ...DEFAULT_SETTINGS, colorVisionCorrection: mode },
        TEST_DEFAULT_BINDINGS,
        TEST_BINDABLE_ACTIONS,
      )
      expect(Result.isSuccess(projected)).toBe(true)
    }
  })

  it('projects the selected setting to the canvas attribute and removes it for off', () => {
    const target = makeTarget()
    const cell = colorVisionCell(target)

    for (const mode of COLOR_VISION_MODES) {
      applyColorVision(cell, mode)
      if (mode === 'off') {
        expect(target.attributes.has(COLOR_VISION_ATTRIBUTE)).toBe(false)
      } else {
        expect(target.attributes.get(COLOR_VISION_ATTRIBUTE)).toBe(mode)
      }
    }
  })

  it('returns typed settings failure for unknown or tagged correction input', () => {
    const malformed = [
      null,
      undefined,
      { ...DEFAULT_SETTINGS, colorVisionCorrection: 'achromatopsia' },
    ]

    for (const settings of malformed) {
      expect(Result.isFailure(settingsViewModel(settings, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS))).toBe(true)
    }

    const ownerAcceptedExtraTag = { ...DEFAULT_SETTINGS, _tag: 'ColorVisionCorrection' }
    expect(Result.isSuccess(settingsViewModel(ownerAcceptedExtraTag, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS))).toBe(
      true,
    )
  })
})
