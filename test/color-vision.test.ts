// @vitest-environment jsdom

import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result, Schema } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { applyColorVision, colorVisionCell, COLOR_VISION_ATTRIBUTE } from '../src/application/accessibility-dom'
import { createColorVisionFilterController } from '../src/application/color-vision-filters'
import {
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_MODES,
  ColorVisionMatrixValuesSchema,
  colorVisionAttribute,
  colorVisionCorrectionMatrixValues,
  colorVisionMatrix,
  colorVisionMatrixValues,
  decodeColorVisionMode,
} from '../src/domain/accessibility'
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

const EXPECTED_CORRECTION_MODES = ['protanopia', 'deuteranopia', 'tritanopia'] as const
const EXPECTED_COLOR_VISION_MODES = ['off', ...EXPECTED_CORRECTION_MODES] as const
type ExpectedCorrectionMode = (typeof EXPECTED_CORRECTION_MODES)[number]
const EXPECTED_COLOR_VISION_MATRICES: Readonly<Record<ExpectedCorrectionMode, readonly number[]>> = {
  protanopia: [
    1, 0, 0, 0, 0,
    -0.2549, 1.2549, 0, 0, 0,
    0.3031, -0.5451, 1.242, 0, 0,
    0, 0, 0, 1, 0,
  ],
  deuteranopia: [
    1, 0, 0, 0, 0,
    -0.4375, 1.4375, 0, 0, 0,
    0.2625, -0.5625, 1.3, 0, 0,
    0, 0, 0, 1, 0,
  ],
  tritanopia: [
    1, 0, 0, 0, 0,
    0.035, 1.532, -0.567, 0, 0,
    0.035, -0.51, 1.475, 0, 0,
    0, 0, 0, 1, 0,
  ],
}

const expectedMatrixValues = (mode: ExpectedCorrectionMode): string =>
  EXPECTED_COLOR_VISION_MATRICES[mode].join(' ')

describe('color vision settings projection', () => {
  it('returns matrix values accepted by the public output schema', () => {
    let generatedModes = 0
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_CORRECTION_MODES),
        (mode) => {
          generatedModes += 1
          const values = colorVisionCorrectionMatrixValues(mode)
          const expectedValues = expectedMatrixValues(mode)

          expect(colorVisionMatrix(mode)).toStrictEqual(EXPECTED_COLOR_VISION_MATRICES[mode])
          expect(values).toBe(expectedValues)
          expect(Schema.decodeUnknownSync(ColorVisionMatrixValuesSchema)(values)).toBe(expectedValues)
          expect(values.split(' ')).toHaveLength(20)
        },
      ),
      { numRuns: 100 },
    )
    expect(generatedModes).toBe(100)
  })

  it('uses the settings correction values and keeps off without a filter', () => {
    expect(COLOR_VISION_MODES).toStrictEqual(EXPECTED_COLOR_VISION_MODES)
    expect(colorVisionAttribute('off')).toBeUndefined()
    expect(colorVisionMatrix('off')).toBeUndefined()
    expect(colorVisionAttribute('protanopia')).toBe('protanopia')

    for (const mode of EXPECTED_COLOR_VISION_MODES) {
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

  it('unknown modes produce a typed failure or a value accepted by the public mode schema', () => {
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    root.appendChild(canvas)
    const controller = createColorVisionFilterController(root, canvas)

    let generatedInputs = 0
    fc.assert(
      fc.property(fc.oneof(fc.anything(), fc.constantFrom(...EXPECTED_COLOR_VISION_MODES)), (input) => {
        generatedInputs += 1
        const result = controller.apply(input)
        const expectedMode = EXPECTED_COLOR_VISION_MODES.find((mode) => mode === input)

        expect(Result.isSuccess(result)).toBe(typeof expectedMode !== 'undefined')
        if (Result.isFailure(result)) {
          expect(expectedMode).toBeUndefined()
          expect(result.failure).toBeDefined()
          return
        }

        expect(result.success).toBe(expectedMode)
        if (typeof expectedMode !== 'undefined') {
          expect(Result.isSuccess(decodeColorVisionMode(result.success))).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
    expect(generatedInputs).toBe(100)

    for (const input of [null, undefined, 'achromatopsia', { _tag: 'ColorVisionMode' }]) {
      expect(Result.isFailure(controller.apply(input))).toBe(true)
    }
    controller.dispose()
  })

  it('builds namespace-correct sRGB SVG matrices and applies them only to the supplied canvas', () => {
    const root = document.createElement('div')
    const chrome = document.createElement('div')
    const canvas = document.createElement('canvas')
    root.append(chrome, canvas)
    document.body.appendChild(root)
    canvas.style.setProperty('filter', 'contrast(1.1)')
    canvas.setAttribute(COLOR_VISION_ATTRIBUTE, 'host-value')

    const controller = createColorVisionFilterController(root, canvas)
    const filters = Array.from(root.querySelectorAll('svg[data-mx-ui="color-vision-filters"] filter'))
    expect(filters).toHaveLength(3)
    expect(filters.every((filter) => filter.namespaceURI === 'http://www.w3.org/2000/svg')).toBe(true)

    for (const mode of EXPECTED_COLOR_VISION_MODES) {
      const expectedValues = mode === 'off' ? undefined : expectedMatrixValues(mode)
      expect(colorVisionMatrixValues(mode)).toBe(expectedValues)

      if (mode !== 'off') {
        const filter = filters.find((candidate) =>
          candidate.querySelector('feColorMatrix')?.getAttribute('values') === expectedValues,
        )
        expect(filter).toBeDefined()
        expect(filter?.getAttribute('color-interpolation-filters')).toBe(COLOR_VISION_FILTER_COLOR_SPACE)
        expect(filter?.querySelector('feColorMatrix')?.getAttribute('type')).toBe('matrix')
        expect(filter?.querySelector('feColorMatrix')?.getAttribute('values')).toBe(expectedValues)

        const applied = controller.apply(mode)
        expect(Result.isSuccess(applied)).toBe(true)
        expect(canvas.style.filter).toContain(`url(#${filter?.getAttribute('id') ?? ''})`)
        expect(canvas.getAttribute(COLOR_VISION_ATTRIBUTE)).toBe(mode)
        expect(chrome.style.filter).toBe('')
        expect(root.style.filter).toBe('')
      }
    }

    const off = controller.apply('off')
    expect(Result.isSuccess(off)).toBe(true)
    expect(canvas.style.getPropertyValue('filter')).toBe('contrast(1.1)')
    expect(canvas.getAttribute(COLOR_VISION_ATTRIBUTE)).toBe('host-value')
    expect(chrome.style.filter).toBe('')
    controller.dispose()
    expect(Result.isFailure(controller.apply('off'))).toBe(true)
    controller.dispose()
    expect(root.querySelector('svg[data-mx-ui="color-vision-filters"]')).toBeNull()
    document.body.removeChild(root)
  })

  it('retries an SVG filter ID that already belongs to the owner document', () => {
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    document.body.appendChild(root)
    const originalGetElementById = document.getElementById.bind(document)
    const requestedIds: Array<string> = []
    const getElementById = vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      requestedIds.push(id)
      if (requestedIds.length === 1) {
        return document.createElement('div')
      }
      return originalGetElementById(id)
    })

    const controller = createColorVisionFilterController(root, canvas)
    try {
      expect(requestedIds).toHaveLength(4)
      expect(requestedIds[0]).not.toBe(requestedIds[1])
      expect(new Set(requestedIds.slice(1)).size).toBe(3)
      expect(root.querySelectorAll('svg[data-mx-ui="color-vision-filters"] filter[id]')).toHaveLength(3)
    } finally {
      getElementById.mockRestore()
      controller.dispose()
      document.body.removeChild(root)
    }
  })

  it('allocates independent filter IDs for multiple mx-ui instances and restores target state on dispose', () => {
    const firstRoot = document.createElement('div')
    const firstCanvas = document.createElement('canvas')
    const secondRoot = document.createElement('div')
    const secondCanvas = document.createElement('canvas')
    firstRoot.appendChild(firstCanvas)
    secondRoot.appendChild(secondCanvas)
    document.body.append(firstRoot, secondRoot)
    firstCanvas.style.setProperty('filter', 'blur(1px)')

    const first = createColorVisionFilterController(firstRoot, firstCanvas)
    const second = createColorVisionFilterController(secondRoot, secondCanvas)
    const firstApplied = first.apply('protanopia')
    const secondApplied = second.apply('protanopia')

    expect(Result.isSuccess(firstApplied)).toBe(true)
    expect(Result.isSuccess(secondApplied)).toBe(true)
    expect(firstCanvas.style.filter).not.toBe(secondCanvas.style.filter)
    expect(document.querySelectorAll('svg[data-mx-ui="color-vision-filters"] filter[id]')).toHaveLength(6)

    first.dispose()
    expect(firstCanvas.style.getPropertyValue('filter')).toBe('blur(1px)')
    expect(firstRoot.querySelector('svg[data-mx-ui="color-vision-filters"]')).toBeNull()
    expect(Result.isSuccess(second.apply('tritanopia'))).toBe(true)
    second.dispose()
    document.body.removeChild(firstRoot)
    document.body.removeChild(secondRoot)
  })
})
