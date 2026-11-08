// @vitest-environment jsdom

import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { applyColorVision, colorVisionCell, COLOR_VISION_ATTRIBUTE } from '../src/application/accessibility-dom'
import { createColorVisionFilterController } from '../src/application/color-vision-filters'
import {
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_MODES,
  colorVisionAttribute,
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

  it('unknown modes produce a typed failure or a value accepted by the public mode schema', () => {
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    root.appendChild(canvas)
    const controller = createColorVisionFilterController(root, canvas)

    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = controller.apply(input)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeDefined()
        } else {
          expect(Result.isSuccess(decodeColorVisionMode(result.success))).toBe(true)
        }
      }),
    )

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

    for (const mode of COLOR_VISION_MODES) {
      if (mode !== 'off') {
        const expectedValues = colorVisionMatrixValues(mode)
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
