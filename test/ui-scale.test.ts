import { Result } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyUiScale, UI_SCALE_PROPERTY } from '../src/application/ui-scale'
import { decodeUiScale } from '../src/domain/accessibility'

const EXPECTED_UI_SCALE_MIN = 0.75
const EXPECTED_UI_SCALE_MAX = 1.5

const makeStyle = () => {
  const properties = new Map<string, string>()
  return {
    properties,
    removeProperty: (property: string): void => {
      properties.delete(property)
    },
    setProperty: (property: string, value: string): void => {
      properties.set(property, value)
    },
  }
}

describe('UI scale runtime projection', () => {
  it('applies the inclusive settings bounds', () => {
    for (const scale of [EXPECTED_UI_SCALE_MIN, EXPECTED_UI_SCALE_MAX]) {
      const style = makeStyle()
      const result = applyUiScale(style, scale)

      expect(Result.isSuccess(result)).toBe(true)
      expect(style.properties.get(UI_SCALE_PROPERTY)).toBe(String(scale))
    }
  })

  it('rejects just-outside values and leaves the previous scale unchanged', () => {
    for (const scale of [EXPECTED_UI_SCALE_MIN - 0.000001, EXPECTED_UI_SCALE_MAX + 0.000001]) {
      const style = makeStyle()
      style.setProperty(UI_SCALE_PROPERTY, '1.25')

      const result = applyUiScale(style, scale)

      expect(Result.isFailure(result)).toBe(true)
      expect(style.properties.get(UI_SCALE_PROPERTY)).toBe('1.25')
    }
  })

  it('generated inputs match the independently calculated range without throwing', () => {
    let generatedInputs = 0
    fc.assert(
      fc.property(fc.anything(), (input) => {
        generatedInputs += 1
        const style = makeStyle()
        const previousScale = '1.125'
        style.setProperty(UI_SCALE_PROPERTY, previousScale)
        const result = applyUiScale(style, input)
        const expectedSuccess =
          typeof input === 'number' &&
          Number.isFinite(input) &&
          input >= EXPECTED_UI_SCALE_MIN &&
          input <= EXPECTED_UI_SCALE_MAX

        expect(Result.isSuccess(result)).toBe(expectedSuccess)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeDefined()
          expect(style.properties.get(UI_SCALE_PROPERTY)).toBe(previousScale)
          return
        }

        expect(result.success).toBe(input)
        expect(Result.isSuccess(decodeUiScale(result.success))).toBe(true)
        expect(style.properties.get(UI_SCALE_PROPERTY)).toBe(String(result.success))
      }),
      { numRuns: 100 },
    )
    expect(generatedInputs).toBe(100)

    for (const input of [null, undefined, '1', Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(Result.isFailure(applyUiScale(makeStyle(), input))).toBe(true)
    }
  })
})
