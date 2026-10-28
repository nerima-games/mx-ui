import { DIFFICULTIES } from '@nerima-games/mc-kernel/domain/game-mode'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { DIFFICULTY_CHOICES, settingsViewModel } from '../src/domain/settings-view-model'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

describe('difficulty selector', () => {
  it('offers the gameplay owner difficulty values and projects each selected value', () => {
    expect(DIFFICULTY_CHOICES.map(({ value }) => value)).toStrictEqual(DIFFICULTIES)

    for (const difficulty of DIFFICULTIES) {
      const result = settingsViewModel(
        { ...DEFAULT_SETTINGS, difficulty },
        TEST_DEFAULT_BINDINGS,
        TEST_BINDABLE_ACTIONS,
      )

      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.difficulty).toBe(difficulty)
      }
    }
  })

  it.each(['peaceful-ish', '', null, undefined, 2, { _tag: 'Difficulty', value: 'hard' }])(
    'returns a typed failure for unknown or malformed difficulty input (%s)',
    (difficulty) => {
      expect(
        settingsViewModel({ ...DEFAULT_SETTINGS, difficulty }, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS),
      ).toStrictEqual(
        Result.fail({ _tag: 'InvalidSettingsSnapshot' }),
      )
    },
  )
})
