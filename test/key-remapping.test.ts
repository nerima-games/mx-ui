import { DEFAULT_SETTINGS, keyBindingFor, makeSettingsService } from '@nerima-games/mc-sim'
import { Effect } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { rebindSettingsKey, unbindSettingsKey } from '../src/application/settings-view'
import { TEST_SETTINGS_INPUT_POLICY } from './fixtures/settings-input'

describe('settings key remapping', () => {
  it.effect('uses render actions and delegates binding changes to the sim service', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)
      yield* service.rebindKey('jump', 'Space')
      yield* service.rebindKey('sneak', 'ShiftLeft')

      yield* rebindSettingsKey(service, { action: 'sneak', code: 'Space', inputPolicy: TEST_SETTINGS_INPUT_POLICY })

      const snapshot = yield* service.snapshot
      expect(TEST_SETTINGS_INPUT_POLICY.bindableActions).toContain('sneak')
      expect(keyBindingFor(snapshot, 'sneak')).toBe('Space')
      expect(keyBindingFor(snapshot, 'jump')).toBe('ShiftLeft')
    }),
  )

  it.effect('uses Backspace to call sim unbind and restore the input default', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)
      yield* service.rebindKey('jump', 'KeyJ')

      yield* rebindSettingsKey(service, { action: 'jump', code: 'Backspace', inputPolicy: TEST_SETTINGS_INPUT_POLICY })

      const snapshot = yield* service.snapshot
      expect(keyBindingFor(snapshot, 'jump')).toBeUndefined()
    }),
  )

  it.effect('delegates a validated unbind action to the settings service', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)
      yield* service.rebindKey('jump', 'KeyJ')

      yield* unbindSettingsKey(service, TEST_SETTINGS_INPUT_POLICY, 'jump')

      expect(keyBindingFor(yield* service.snapshot, 'jump')).toBeUndefined()
    }),
  )

  it.effect('returns typed failures for escape, reserved navigation keys, empty codes and unknown actions', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService()

      const escapeAction = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'escape', code: 'KeyE', inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const escapeCode = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'jump', code: 'Escape', inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const tabCode = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'jump', code: 'Tab', inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const emptyCode = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'jump', code: '', inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const unknownAction = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'fly', code: 'KeyF', inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const unknownUnbind = yield* Effect.flip(unbindSettingsKey(service, TEST_SETTINGS_INPUT_POLICY, 'fly'))

      expect(escapeAction).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'escape-is-not-bindable' })
      expect(escapeCode).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'escape-is-not-bindable' })
      expect(tabCode).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'key-reserved-by-user-agent' })
      expect(emptyCode).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'invalid-key' })
      expect(unknownAction).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'unknown-action' })
      expect(unknownUnbind).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'unknown-action' })
    }),
  )

  it.effect('does not convert malformed binding codes into a default key', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService()
      const failure = yield* Effect.flip(
        rebindSettingsKey(service, { action: 'jump', code: null, inputPolicy: TEST_SETTINGS_INPUT_POLICY }),
      )
      const snapshot = yield* service.snapshot

      expect(failure).toStrictEqual({ _tag: 'SettingsKeyRemappingFailure', reason: 'invalid-key' })
      expect(keyBindingFor(snapshot, 'jump')).toBeUndefined()
    }),
  )
})
