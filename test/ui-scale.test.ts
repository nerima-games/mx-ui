import { Result } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyUiScale, UI_SCALE_PROPERTY } from '../src/application/ui-scale'
import { decodeUiScale, UI_SCALE_MAX, UI_SCALE_MIN } from '../src/domain/accessibility'

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
    for (const scale of [UI_SCALE_MIN, UI_SCALE_MAX]) {
      const style = makeStyle()
      const result = applyUiScale(style, scale)

      expect(Result.isSuccess(result)).toBe(true)
      expect(style.properties.get(UI_SCALE_PROPERTY)).toBe(String(scale))
    }
  })

  it('rejects just-outside values and leaves the previous scale unchanged', () => {
    for (const scale of [UI_SCALE_MIN - 0.000001, UI_SCALE_MAX + 0.000001]) {
      const style = makeStyle()
      style.setProperty(UI_SCALE_PROPERTY, '1.25')

      const result = applyUiScale(style, scale)

      expect(Result.isFailure(result)).toBe(true)
      expect(style.properties.get(UI_SCALE_PROPERTY)).toBe('1.25')
    }
  })

  it('unknown values return a typed failure or a schema-accepted scale without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const style = makeStyle()
        const result = applyUiScale(style, input)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeDefined()
          expect(style.properties.has(UI_SCALE_PROPERTY)).toBe(false)
          return
        }

        expect(Result.isSuccess(decodeUiScale(result.success))).toBe(true)
        expect(style.properties.get(UI_SCALE_PROPERTY)).toBe(String(result.success))
      }),
    )

    for (const input of [null, undefined, '1', Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(Result.isFailure(applyUiScale(makeStyle(), input))).toBe(true)
    }
  })
})
