import { DEFAULT_SETTINGS, makeSettingsService } from '@nerima-games/mc-sim'
import { Effect } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { resetSettings, restoreSettings, settingsCandidate, updateSettings } from '../src/application/settings-view'
import { COLOR_VISION_CHOICES, REDUCED_MOTION_CHOICES } from '../src/domain/settings-view-model'

describe('sim-owned accessibility settings', () => {
  it.effect('keeps the two graphics preset fields aligned in either update direction', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)

      const presetCandidate = yield* settingsCandidate(service, { graphicsPreset: 'ultra' })
      const qualityCandidate = yield* settingsCandidate(service, { graphicsQuality: 'low' })

      expect(presetCandidate.graphicsQuality).toBe('ultra')
      expect(qualityCandidate.graphicsPreset).toBe('low')
    }),
  )

  it.effect('projects candidate values without installing them, then uses update, restore and reset', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)
      const patch = {
        colorVisionCorrection: 'protanopia' as const,
        reducedMotion: 'reduced' as const,
        uiScale: 1.5,
      }

      const candidate = yield* settingsCandidate(service, patch)
      expect(candidate.colorVisionCorrection).toBe('protanopia')
      expect(candidate.reducedMotion).toBe('reduced')
      expect(candidate.uiScale).toBe(1.5)
      expect((yield* service.snapshot).colorVisionCorrection).toBe(DEFAULT_SETTINGS.colorVisionCorrection)

      yield* updateSettings(service, patch)
      expect(yield* service.snapshot).toMatchObject(patch)

      yield* restoreSettings(service, DEFAULT_SETTINGS)
      expect(yield* service.snapshot).toMatchObject({
        colorVisionCorrection: DEFAULT_SETTINGS.colorVisionCorrection,
        reducedMotion: DEFAULT_SETTINGS.reducedMotion,
        uiScale: DEFAULT_SETTINGS.uiScale,
      })

      yield* updateSettings(service, patch)
      yield* resetSettings(service)
      expect(yield* service.snapshot).toStrictEqual(DEFAULT_SETTINGS)
    }),
  )

  it.effect('accepts only the settings owner’s reduced-motion and color-correction choices', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService()

      for (const { value: reducedMotion } of REDUCED_MOTION_CHOICES) {
        yield* service.update({ reducedMotion })
        expect((yield* service.snapshot).reducedMotion).toBe(reducedMotion)
      }

      for (const { value: colorVisionCorrection } of COLOR_VISION_CHOICES) {
        yield* service.update({ colorVisionCorrection })
        expect((yield* service.snapshot).colorVisionCorrection).toBe(colorVisionCorrection)
      }
    }),
  )

  it.effect('returns typed failures before the owner can normalize an invalid update or restore', () =>
    Effect.gen(function* () {
      const service = yield* makeSettingsService(DEFAULT_SETTINGS)
      const invalidUpdate = yield* Effect.flip(settingsCandidate(service, { uiScale: Number.POSITIVE_INFINITY }))
      const invalidRestore = yield* Effect.flip(restoreSettings(service, null))

      expect(invalidUpdate).toStrictEqual({ _tag: 'InvalidSettingsUpdate' })
      expect(invalidRestore).toStrictEqual({ _tag: 'InvalidSettingsUpdate' })
      expect(yield* service.snapshot).toStrictEqual(DEFAULT_SETTINGS)
    }),
  )
})
