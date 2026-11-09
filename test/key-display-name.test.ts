import { describe, expect, it } from 'vitest'
import { KeyCode } from '@nerima-games/mc-kernel/domain/settings'
import * as fc from 'fast-check'
import { keyDisplayName } from '../src/domain/key-display-name'

describe('keyDisplayName', () => {
  it.each([
    ['KeyW', 'W', 'W'],
    ['Digit9', '9', '9'],
    ['Space', 'Space', 'スペース'],
    ['MouseLeft', 'Left click', '左クリック'],
    ['MouseMiddle', 'Middle click', '中クリック'],
    ['ShiftLeft', 'Left Shift', '左Shift'],
    ['ArrowUp', 'Up arrow', '上矢印'],
  ])('shows %s as readable English and Japanese names', (code, english, japanese) => {
    expect(keyDisplayName(KeyCode(code), 'en')).toBe(english)
    expect(keyDisplayName(KeyCode(code), 'ja')).toBe(japanese)
  })

  it('keeps unknown codes intact instead of guessing their meaning', () => {
    expect(keyDisplayName(KeyCode('VendorAction17'), 'en')).toBe('VendorAction17')
    expect(keyDisplayName(KeyCode('VendorAction17'), 'ja')).toBe('VendorAction17')
  })

  it('localizes numeric keypad keys in both supported languages', () => {
    expect(keyDisplayName(KeyCode('Numpad3'), 'en')).toBe('Numpad 3')
    expect(keyDisplayName(KeyCode('Numpad3'), 'ja')).toBe('テンキー 3')
  })

  it('returns a string for arbitrary key codes without throwing', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((code) => code.trim().length > 0),
        fc.constantFrom('en', 'ja'),
        (code, language) => {
          expect(keyDisplayName(KeyCode(code), language)).toEqual(expect.any(String))
      }),
      { numRuns: 100 },
    )
  })
})
