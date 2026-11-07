import { AudioCaptionText, AudioPan } from '@nerima-games/mc-audio'
import { MonotonicTimeSecs, StackCount, itemStack } from '@nerima-games/mc-kernel'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { VitalsSchema, SPAWN_VITALS } from '@nerima-games/mc-sim'
import {
  OVERLAY_SCENARIOS,
  OVERLAY_TIME_BOUNDARIES,
} from '../../apps/browser-harness/scenarios/overlay'
import type { HarnessEnvironment, ScenarioContext } from '../../apps/browser-harness/scenario-types'
import {
  captionLines,
  MAX_VISIBLE_CAPTIONS,
} from '../../src/domain/caption'
import { captionEvent, captionTime } from '../helpers/caption-event'
import {
  CROSSHAIR_PULSE_SECS,
  crosshairViewModel,
} from '../../src/domain/crosshair'
import {
  FramesPerSecondSchema,
  GpuTimeMillisecondsSchema,
} from '../../src/domain/debug-overlay'
import { hudViewModel, iconRow, slotView } from '../../src/domain/hud-view-model'
import {
  LOADING_MINIMUM_VISIBLE_SECS,
  loadingScreenView,
  loadingStatus,
} from '../../src/domain/loading-screen'
import {
  SAVED_VISIBLE_SECS,
  saveStatus,
  saveStatusMessage,
} from '../../src/domain/save-status'
import { AchievementToastSchema } from '../../src/domain/achievement-toast'
import { fakeDocument, fakeElement } from '../fake-dom'

const environment: HarnessEnvironment = {
  motion: 'full',
  cvd: 'off',
  width: 1280,
  height: 720,
  safe: 0,
  dpr: 1,
  textScale: 100,
  contrast: 'normal',
  background: 'mid',
}

const contextFor = (factory: ReturnType<typeof fakeDocument>): ScenarioContext => ({
  factory,
  host: fakeElement(factory.createElement('main')),
  environment,
  time: 0,
  emitIntent: () => undefined,
  runSync: Effect.runSync,
})

const decodeVitals = Schema.decodeUnknownResult(VitalsSchema, { onExcessProperty: 'error' })
const decodeFiniteFps = Schema.decodeUnknownResult(FramesPerSecondSchema)
const decodeFiniteGpuTime = Schema.decodeUnknownResult(GpuTimeMillisecondsSchema)
const decodeToast = Schema.decodeUnknownResult(AchievementToastSchema)

describe('overlay scenario catalog', () => {
  for (const definition of OVERLAY_SCENARIOS) {
    it(`${definition.screen}/${definition.id} mounts and disposes`, () => {
      const factory = fakeDocument()
      const context = contextFor(factory)
      const mounted = definition.mount(context)
      const host = fakeElement(context.host)
      const root = fakeElement(mounted.root)

      expect(host.children).toHaveLength(1)
      expect(host.children[0]).toBe(root)
      expect([...root.walk()].some((element) => element.attributes.has('data-mx-ui'))).toBe(true)

      mounted.setTime(0)
      mounted.setTime(3)
      mounted.dispose()

      expect(host.listenersInTree()).toStrictEqual([])
    })
  }

  it('classifies HUD health and hotbar boundaries through their real projections', () => {
    const maximumHealth = SPAWN_VITALS.maxHealthPoints
    const accepted = [
      { ...SPAWN_VITALS, healthPoints: 0 },
      { ...SPAWN_VITALS, healthPoints: 1.5 },
      { ...SPAWN_VITALS, healthPoints: maximumHealth },
    ]
    for (const value of accepted) {
      expect(Result.isSuccess(decodeVitals(value))).toBe(true)
    }

    const rejected = [
      { ...SPAWN_VITALS, healthPoints: maximumHealth + 1 },
      { ...SPAWN_VITALS, healthPoints: -1 },
      { ...SPAWN_VITALS, healthPoints: Number.NaN },
    ]
    for (const value of rejected) {
      expect(Result.isFailure(decodeVitals(value))).toBe(true)
    }

    expect(iconRow(0, 20).every((state) => state === 'empty')).toBe(true)
    expect(iconRow(1, 20)[0]).toBe('half')
    expect(iconRow(20, 20).every((state) => state === 'full')).toBe(true)
    const xpVitals = Schema.decodeUnknownSync(VitalsSchema)({
      ...SPAWN_VITALS,
      totalExperience: 24,
    })
    expect(Number(hudViewModel(xpVitals, [], 0).experienceLevelLabel)).toBeGreaterThan(0)
    expect(slotView({ itemId: 'minecraft:stone', count: 64 }, 0, 0)).toMatchObject({
      empty: false,
      countLabel: '64',
    })
    expect(Result.isSuccess(itemStack('stone', StackCount(64)))).toBe(true)
    expect(Result.isFailure(itemStack('stone', StackCount(65)))).toBe(true)
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(slotView({ itemId: 'minecraft:stone', count }, 0, 0).empty).toBe(true)
    }
  })

  it('shows rejected schema values as mounted decode-failure scenarios', () => {
    const cases = [
      ['hud', 'hud-vitals-decode-failure', 'boundary rejected'],
      ['hud', 'hud-hotbar-decode-failure', 'boundary rejected'],
      ['captions', 'captions-boundary-decode-failure', 'boundary rejected'],
      ['hud', 'debug-hud-decode-failure', 'boundary rejected'],
      ['hud', 'achievement-toast-decode-missing-icon', 'decode failed'],
    ] as const

    for (const [screen, id, message] of cases) {
      const definition = OVERLAY_SCENARIOS.find((item) => item.screen === screen && item.id === id)
      if (definition === undefined) {
        throw new Error(`missing decode-failure scenario: ${screen}/${id}`)
      }
      const factory = fakeDocument()
      const context = contextFor(factory)
      const mounted = definition.mount(context)
      const root = fakeElement(mounted.root)

      expect(root.attributes.get('role')).toBe('alert')
      expect(root.textContent).toContain(message)
      expect(root.textContent).not.toContain('unexpectedly decoded')
      mounted.dispose()
    }
  })

  it('selects and dismisses achievement toasts from virtual time', () => {
    const definition = OVERLAY_SCENARIOS.find((item) => item.id === 'achievement-toast-sequence')
    if (definition === undefined) {
      throw new Error('missing achievement toast sequence scenario')
    }
    const factory = fakeDocument()
    const mounted = definition.mount(contextFor(factory))
    const root = fakeElement(mounted.root)
    const title = root.find('data-mx-ui', 'achievement-toast-title')

    expect(title?.textContent).toBe('Stone Age')
    mounted.setTime(OVERLAY_TIME_BOUNDARIES.achievementToastSecondAtSecs)
    expect(title?.textContent).toBe('Getting an Upgrade')
    mounted.setTime(OVERLAY_TIME_BOUNDARIES.achievementToastDismissalSecs)
    expect(root.attributes.has('hidden')).toBe(true)
    mounted.dispose()
  })

  it('keeps loading and save timing on the injected virtual clock', () => {
    const ready = loadingStatus({ kind: 'ready' }, 0)
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS - 0.01)).toStrictEqual({
      held: true,
      kind: 'preparing',
    })
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS)).toBeUndefined()
    expect(loadingScreenView(loadingStatus({ kind: 'failed', reason: '' }, 0), 200)).toStrictEqual({
      kind: 'failed',
      reason: '',
    })
    expect(loadingStatus({ kind: 'ready' }, Number.NaN).startedAtSecs).toBe(0)

    const saved = saveStatus('saved', 0)
    expect(saveStatusMessage(saved, SAVED_VISIBLE_SECS - 0.01)).toBe('saved')
    expect(saveStatusMessage(saved, SAVED_VISIBLE_SECS)).toBeUndefined()
    expect(saveStatusMessage(saveStatus('saving', 0), 200)).toBe('saving')
    expect(saveStatusMessage(saveStatus('failed', 0), 200)).toBe('failed')
    expect(OVERLAY_TIME_BOUNDARIES.savedVisibleSecs).toBe(SAVED_VISIBLE_SECS)
  })

  it('accepts caption text boundaries and rejects invalid pan or time values', () => {
    const acceptedText = ['', 'x', 'x'.repeat(180), 'first\nsecond', '✨', 'مرحبا بالعالم']
    for (const text of acceptedText) {
      expect(AudioCaptionText(text)).toBe(text)
    }
    expect(captionLines([captionEvent('', 0, undefined, 'audible')], captionTime(0))).toStrictEqual([
      { arrow: undefined, freshness: 1, text: '' },
    ])
    const fiftyCaptions = Array.from({ length: 50 }, (_value, index) =>
      captionEvent(`caption-${String(index)}`, 0, undefined, 'audible'),
    )
    expect(captionLines(fiftyCaptions, captionTime(0))).toHaveLength(MAX_VISIBLE_CAPTIONS)
    expect(captionLines([captionEvent('expiry', 0, undefined, 'audible')], captionTime(
      OVERLAY_TIME_BOUNDARIES.captionExpirySecs - 0.001,
    ))).toHaveLength(1)
    expect(captionLines([captionEvent('expiry', 0, undefined, 'audible')], captionTime(
      OVERLAY_TIME_BOUNDARIES.captionExpirySecs,
    ))).toHaveLength(0)

    expect(AudioPan(-1)).toBe(-1)
    expect(AudioPan(1)).toBe(1)
    expect(AudioPan(0.5)).toBe(0.5)
    expect(() => AudioPan(1.01)).toThrow()
    expect(() => AudioPan(Number.NaN)).toThrow()
    expect(MonotonicTimeSecs(0)).toBe(0)
    expect(MonotonicTimeSecs(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
    expect(() => MonotonicTimeSecs(-1)).toThrow()
    expect(() => MonotonicTimeSecs(Number.NaN)).toThrow()
  })

  it('normalizes crosshair extremes and expires hits at the pulse boundary', () => {
    expect(crosshairViewModel({ modals: [], breakProgress: -1 }, 0)?.breakProgress).toBe(0)
    expect(crosshairViewModel({ modals: [], breakProgress: 1.5 }, 0)?.breakProgress).toBe(1)
    expect(crosshairViewModel({ modals: [], breakProgress: Number.NaN }, 0)?.breakProgress).toBeUndefined()
    expect(crosshairViewModel({ modals: [], lastHitAtSecs: 0 }, CROSSHAIR_PULSE_SECS - 0.001)?.hit).toBe(true)
    expect(crosshairViewModel({ modals: [], lastHitAtSecs: 0 }, CROSSHAIR_PULSE_SECS)?.hit).toBe(false)
  })

  it('accepts finite debug values and rejects NaN or infinity', () => {
    for (const value of [0, -1, 0.5, Number.MAX_VALUE]) {
      expect(Result.isSuccess(decodeFiniteFps(value))).toBe(true)
      expect(Result.isSuccess(decodeFiniteGpuTime(value))).toBe(true)
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Result.isFailure(decodeFiniteFps(value))).toBe(true)
      expect(Result.isFailure(decodeFiniteGpuTime(value))).toBe(true)
    }
  })

  it('decodes valid Unicode achievement titles and rejects missing or empty fields', () => {
    const valid = {
      achievement: 'minecraft:story/mine_stone',
      icon: 'minecraft:wooden_pickaxe',
      player: 'player:one',
      tick: 0,
      title: `✨ مرحبا بالعالم\n${'long title '.repeat(20)}`,
    }
    expect(Result.isSuccess(decodeToast(valid))).toBe(true)

    const { icon: _icon, ...missingIcon } = valid
    const { title: _title, ...missingTitle } = valid
    for (const value of [
      missingIcon,
      missingTitle,
      { ...valid, icon: '' },
      { ...valid, title: '' },
      { ...valid, tick: -1 },
      { ...valid, tick: 0.5 },
      { ...valid, tick: Number.NaN },
    ]) {
      expect(Result.isFailure(decodeToast(value))).toBe(true)
    }
  })
})
