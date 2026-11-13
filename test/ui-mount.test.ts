// @vitest-environment jsdom

import { Effect, Exit, Result, Schema } from 'effect'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  AchievementToastEventBusLayer,
} from '../src/application/achievement-toast-subscriber'
import {
  inventoryTargetAt,
  makeUiMount as makeRawUiMount,
  UiMountError,
  type UiMountOptions,
} from '../src/application/ui-mount'
import { EXPERIENCE_TRANSITION_MS } from '../src/application/hud-view'
import {
  finishToastSubscriptionClose,
  finishUiMountCleanup,
} from '../src/application/ui-mount-cleanup'
import { achievementToastFromEvent } from '../src/domain/achievement-toast'
import type { InventoryInteractionTarget } from '../src/application/inventory-view'
import { makeUiFrameState, uiModule, uiStages } from '../src/stages/registration'
import {
  initialMainMenuState,
  mainMenuViewModel,
  type SavedWorld,
  type UnreadableSave,
  type WorldTypeOption,
} from '../src/domain/main-menu'
import {
  emptyInventorySnapshot,
  inventoryViewModel,
  type InventoryViewModel,
} from '../src/domain/inventory-view-model'
import { DeltaTimeSecs } from '@nerima-games/mc-kernel'
import {
  DEFAULT_SETTINGS,
  DomainEventBus,
  MAX_RENDER_DISTANCE,
  MIN_RENDER_DISTANCE,
  SPAWN_VITALS,
  VitalsSchema,
  itemStack as makeItemStack,
} from '@nerima-games/mc-sim'
import { achievementEvent, untrustedAchievementEvent } from './helpers/achievement-event'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'
import { DEFAULT_UI_SETTINGS } from '../src/application/session-overlays'
import { HudPresentationSnapshotSchema } from '../src/domain/hud-presentation'
import { hudViewModel as projectHudViewModel } from '../src/domain/hud-view-model'
import { UI_STAGE_IDS } from '../src/stages/stage-ids'
import { FrameServicesLayer } from './frame-services'
import {
  asSaveSliceId,
  asSaveVersion,
  asUiMessageText,
  asWorldId,
  asWorldNameText,
  asWorldTypeId,
} from './helpers/ui3-brand-values'

const testScopes: Array<Scope.Closeable> = []

const makeUiMount = (options: UiMountOptions) => {
  const runtime = makeRawUiMount(options)
  const scope = Scope.makeUnsafe()
  testScopes.push(scope)
  return {
    ...runtime,
    start: runtime.start.pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.provide(AchievementToastEventBusLayer),
    ),
  }
}

const testItemStack = (
  item: Parameters<typeof makeItemStack>[0],
  count: Parameters<typeof makeItemStack>[1],
) => {
  const result = makeItemStack(item, count)
  if (Result.isSuccess(result)) {
    return result.success
  }
  expect.fail(`mc-sim itemStack failed: ${JSON.stringify(result.failure)}`)
}
const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [{ sessionId: asWorldId('session-1'), name: asWorldNameText('Cliff House') }]
const WORLD_TYPES: ReadonlyArray<WorldTypeOption> = [
  {
    label: { en: asUiMessageText('Standard'), ja: asUiMessageText('標準') },
    value: asWorldTypeId('standard'),
  },
]
const UNREADABLE_SAVE: UnreadableSave = {
  _tag: 'SaveDecodeError',
  format: asSaveSliceId('mc-save'),
  key: asWorldId('broken-save'),
  record: { _tag: 'Save', key: asWorldId('broken-save') },
  repair: { discardableChunkKeys: [], lastHealthyRevisionAvailable: false },
  reason: asUiMessageText('Invalid data'),
  version: asSaveVersion(1),
}

afterEach(async () => {
  await Promise.all(testScopes.map((scope) => Effect.runPromise(Scope.close(scope, Exit.void))))
  testScopes.length = 0
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('UiMount', () => {
  it('returns null for an absent indexed inventory target without scanning the list', () => {
    const target: InventoryInteractionTarget = { index: 0, kind: 'slot', region: 'hotbar' }

    expect(inventoryTargetAt([target], 0)).toBe(target)
    expect(inventoryTargetAt([], 0)).toBeNull()
  })

  it('mounts the initial views and removes only its owned root', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const runtime = makeUiMount({ motion: 'reduced', root: host })

    const moduleInstance = await Effect.runPromise(runtime.start)
    expect(moduleInstance).not.toBe(uiModule)
    expect(moduleInstance.frameStages).toBe(uiModule.frameStages)
    expect(moduleInstance.qa).not.toBe(uiModule.qa)

    const mounted = runtime.current()
    expect(mounted?.root.parentElement).toBe(host)
    expect(host.querySelector('[data-mx-ui="hud"]')).not.toBeNull()
    expect(host.querySelector('[data-mx-ui="inventory"]')).not.toBeNull()
    expect(host.querySelector('[data-mx-ui="main-menu"]')).not.toBeNull()

    await Effect.runPromise(runtime.stop)
    await Effect.runPromise(runtime.stop)

    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('projects the registered host HUD snapshot through updateHud into scaled DOM and respawn', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onRespawn = vi.fn()
    const runtime = makeUiMount({
      initialSettings: { ...DEFAULT_UI_SETTINGS, uiScale: 1.25 },
      onRespawn,
      root: host,
    })
    await Effect.runPromise(runtime.start)

    const state = await Effect.runPromise(makeUiFrameState)
    const presentation = Schema.decodeUnknownSync(HudPresentationSnapshotSchema)({
      absorptionPoints: 3,
      armor: { current: 12, max: 20 },
      deathCause: 'fall',
      healthCondition: 'poison',
      oxygen: { current: 10, max: 20 },
      position: { xCoordinate: 12.5, yCoordinate: 64, zCoordinate: -3.25 },
      statusEffects: [{ category: 'negative', remainingSecs: 12.2 }],
      time: { dayLengthTicks: 72_000, ticks: 37_800 },
    })
    const deadVitals = Schema.decodeUnknownSync(VitalsSchema)({
      ...SPAWN_VITALS,
      healthPoints: 0,
    })
    await Effect.runPromise(Ref.set(state.snapshot, deadVitals))
    await Effect.runPromise(Ref.set(state.hudPresentation, presentation))
    const hudSync = uiStages(state).find((stage) => stage.id === UI_STAGE_IDS.hudSync)
    if (typeof hudSync === 'undefined') {
      throw new Error('Expected the registered HUD sync stage')
    }
    await Effect.runPromise(hudSync.run(DeltaTimeSecs(0.016)).pipe(Effect.provide(FrameServicesLayer)))
    const model = await Effect.runPromise(Ref.get(state.hud))
    runtime.updateHud(model)

    const mounted = runtime.current()
    expect(mounted?.root.style.getPropertyValue('zoom')).toBe('1.25')
    expect(host.querySelector('[data-mx-ui="hud"] [data-mx-ui="time-cue"]')?.hasAttribute('hidden')).toBe(false)
    expect(host.querySelector('[data-mx-ui="sunset-warning-label"]')?.textContent).toBe('Night in 30s')
    expect(host.querySelector('[data-mx-ui="status-effect-label"]')?.textContent).toBe('Negative effect')
    expect(host.querySelector('[data-mx-ui="death-cause"]')?.textContent).toBe('Cause: falling')
    expect(host.querySelector('[data-mx-ui="death-coordinates"]')?.textContent).toBe('Coordinates: 12.5 / 64.0 / -3.3')
    expect(host.querySelector('[data-icon="heart"] [data-hud-icon="health-empty"]')).not.toBeNull()

    expect(Result.isSuccess(runtime.updateLanguage('ja'))).toBe(true)
    expect(host.querySelector('[data-mx-ui="status-effect-label"]')?.textContent).toBe('不利な効果')
    expect(host.querySelector('[data-mx-ui="death-cause"]')?.textContent).toBe('原因: 落下')

    const respawn = host.querySelector<HTMLButtonElement>('[data-mx-ui="respawn"]')
    expect(respawn?.disabled).toBe(false)
    respawn?.click()
    expect(onRespawn).toHaveBeenCalledOnce()

    const livingVitals = Schema.decodeUnknownSync(VitalsSchema)({
      ...SPAWN_VITALS,
      healthPoints: 2,
    })
    await Effect.runPromise(Ref.set(state.snapshot, livingVitals))
    await Effect.runPromise(hudSync.run(DeltaTimeSecs(0.016)).pipe(Effect.provide(FrameServicesLayer)))
    runtime.updateHud(await Effect.runPromise(Ref.get(state.hud)))
    expect(host.querySelector('[data-icon="heart"] [data-hud-icon="poison-full"]')).not.toBeNull()
    expect(host.querySelector('[data-mx-ui="death"]')?.hasAttribute('hidden')).toBe(true)
    expect(host.querySelector('[data-mx-ui="armor-value"]')?.textContent).toBe('12 / 20')
    expect(host.querySelector('[data-mx-ui="oxygen-value"]')?.textContent).toBe('10 / 20')
    expect(host.querySelector('[data-mx-ui="status-effect-label"]')?.textContent).toBe('不利な効果')
    expect(host.querySelector('[data-mx-ui="time-label"]')?.textContent).toBe('夕暮れ')
    expect(host.querySelector('[data-mx-ui="sunset-warning-label"]')?.textContent).toBe('夜まであと30秒')

    const witherPresentation = Schema.decodeUnknownSync(HudPresentationSnapshotSchema)({
      ...presentation,
      healthCondition: 'wither',
    })
    await Effect.runPromise(Ref.set(state.hudPresentation, witherPresentation))
    await Effect.runPromise(hudSync.run(DeltaTimeSecs(0.016)).pipe(Effect.provide(FrameServicesLayer)))
    runtime.updateHud(await Effect.runPromise(Ref.get(state.hud)))
    expect(host.querySelector('[data-icon="heart"] [data-hud-icon="wither-full"]')).not.toBeNull()

    await Effect.runPromise(runtime.stop)
    respawn?.click()
    expect(onRespawn).toHaveBeenCalledOnce()
  })

  it('updates the mounted menu in the selected language', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const settingsButton = host.querySelector<HTMLElement>('[data-menu-entry="settings"]')
    expect(settingsButton?.textContent).toBe('Settings')
    const result = runtime.updateLanguage('ja')

    expect(Result.isSuccess(result)).toBe(true)
    expect(settingsButton?.textContent).toBe('設定...')
    expect(settingsButton?.getAttribute('aria-label')).toBe('設定...')

    runtime.openSettings()
    expect(host.querySelector('[data-settings-field="language"][data-setting-value="ja"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[data-settings-field="language"][data-setting-value="en"]')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('uses a language selected before mount for the initial UI', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })

    expect(Result.isSuccess(runtime.updateLanguage('ja'))).toBe(true)
    await Effect.runPromise(runtime.start)

    expect(host.querySelector('[data-menu-entry="settings"]')?.textContent).toBe('設定...')
  })

  it('renders achievement events from the mounted subscriber and closes it on stop', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeRawUiMount({ root: host })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bus = yield* DomainEventBus
          const moduleInstance = yield* runtime.start

          const mounted = runtime.current()
          if (mounted === undefined) {
            throw new Error('Expected the UI mount to be active')
          }
          const toastView = mounted.achievementToast
          const toastRoot = host.querySelector<HTMLElement>('[data-mx-ui="achievement-toast"]')
          expect(toastRoot).not.toBeNull()
          expect(toastRoot?.hidden).toBe(true)
          const render = vi.spyOn(toastView, 'render')

          yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))
          expect(toastRoot?.hidden).toBe(false)
          expect(host.querySelector('[data-mx-ui="achievement-toast-title"]')?.textContent).toBe('Stone Age')
          expect(render).toHaveBeenCalledOnce()
          const qaState = yield* moduleInstance.qa.observe.state.run({})
          expect(qaState.achievementToast).toMatchObject({
            achievement: 'minecraft:story/mine_stone',
            title: 'Stone Age',
          })

          yield* runtime.stop
          yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))
          expect(render).toHaveBeenCalledOnce()
          expect(host.querySelector('[data-mx-ui="achievement-toast"]')).toBeNull()
          const stoppedQaState = yield* moduleInstance.qa.observe.state.run({})
          expect(stoppedQaState.achievementToast).toBeNull()
        }),
      ).pipe(Effect.provide(AchievementToastEventBusLayer)),
    )
  })

  it('closes the achievement subscriber when its parent scope closes', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeRawUiMount({ root: host })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bus = yield* DomainEventBus
          const parentScope = yield* Scope.make()
          yield* runtime.start.pipe(Effect.provideService(Scope.Scope, parentScope))

          const mounted = runtime.current()
          if (mounted === undefined) {
            throw new Error('Expected the UI mount to be active')
          }
          const render = vi.spyOn(mounted.achievementToast, 'render')

          yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))
          expect(render).toHaveBeenCalledOnce()

          yield* Scope.close(parentScope, Exit.void)
          yield* bus.publish(achievementEvent('minecraft:story/mine_stone'))
          expect(render).toHaveBeenCalledOnce()

          yield* runtime.stop
          expect(runtime.current()).toBeUndefined()
          expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
        }).pipe(Effect.provide(AchievementToastEventBusLayer)),
      ),
    )
  })

  it('rejects an unsupported achievement id before it reaches the mounted subscriber', async () => {
    const validation = Effect.runSync(
      Effect.result(
        achievementToastFromEvent(untrustedAchievementEvent('example:custom/achievement')),
      ),
    )
    expect(Result.isFailure(validation)).toBe(true)
    if (Result.isFailure(validation)) {
      expect(validation.failure).toBeInstanceOf(Schema.SchemaError)
    }

    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeRawUiMount({ root: host })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runtime.start
          yield* runtime.stop
        }).pipe(Effect.provide(AchievementToastEventBusLayer)),
      ),
    )

    expect(runtime.current()).toBeUndefined()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('reports subscriber and view cleanup failures together', () => {
    const subscriptionResult = Result.map(
      Effect.runSync(
        Effect.result(
          achievementToastFromEvent(untrustedAchievementEvent('example:custom/achievement')),
        ),
      ),
      () => undefined,
    )
    const viewsError = new UiMountError('Failed to stop mx-ui', {
      cause: new Error('view destroy failed'),
    })
    const viewsResult = Result.fail(viewsError)
    const subscriptionClose = Effect.runSync(
      Effect.result(finishToastSubscriptionClose(subscriptionResult)),
    )
    const failure = Effect.runSync(
      Effect.flip(
        finishUiMountCleanup(subscriptionResult, viewsResult),
      ),
    )
    const subscriptionFailure = Effect.runSync(
      Effect.flip(
        finishUiMountCleanup(
          subscriptionResult,
          Result.succeed(undefined),
        ),
      ),
    )

    expect(failure).toBeInstanceOf(UiMountError)
    expect(failure.cause).toMatchObject({
      subscriptionError: expect.any(Schema.SchemaError),
      viewsError: expect.objectContaining({
        message: 'Failed to stop mx-ui',
      }),
    })
    expect(subscriptionFailure).toBeInstanceOf(Schema.SchemaError)
    expect(Result.isFailure(subscriptionClose)).toBe(true)
  })

  it('remounts cleanly and detaches listeners from the previous menu', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onOpenSettings = vi.fn()
    const runtime = makeUiMount({
      menuCallbacks: {
        onCreateWorld: () => undefined,
        onLoadWorld: () => undefined,
        onOpenSettings,
        onStateChange: () => undefined,
      },
      root: host,
    })

    await Effect.runPromise(runtime.start)
    const firstSettings = host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')
    expect(firstSettings).not.toBeNull()

    await Effect.runPromise(runtime.start)
    expect(host.querySelectorAll('[data-mx-ui="mount-root"]')).toHaveLength(1)
    firstSettings?.click()
    expect(onOpenSettings).not.toHaveBeenCalled()

    host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')?.click()
    expect(onOpenSettings).toHaveBeenCalledOnce()

    const currentSettings = host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')
    await Effect.runPromise(runtime.stop)
    currentSettings?.click()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('rolls back owned DOM and listeners when initial rendering fails', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const original = HTMLElement.prototype.setAttribute
    vi.spyOn(HTMLElement.prototype, 'setAttribute').mockImplementation(function (
      this: HTMLElement,
      name,
      value,
    ) {
      if (name === 'data-world-type-options') {
        throw new Error('render failed')
      }
      return original.call(this, name, value)
    })
    const runtime = makeUiMount({ root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Failed to mount mx-ui' })
    expect(failure.cause).toHaveProperty('message', 'render failed')
    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('reports an owned-root attachment failure through the Effect error channel', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    vi.spyOn(host, 'appendChild').mockImplementation(() => {
      throw new Error('attach failed')
    })
    const runtime = makeUiMount({ root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Failed to mount mx-ui' })
    expect(failure.cause).toHaveProperty('message', 'attach failed')
    expect(runtime.current()).toBeUndefined()
  })

  it('rejects an invalid initial settings snapshot before mounting views', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const hostSettingsPayload = JSON.parse(JSON.stringify({
      ...DEFAULT_SETTINGS,
      renderDistance: MAX_RENDER_DISTANCE + 1,
    }))
    const runtime = makeUiMount({
      initialSettingsSnapshot: hostSettingsPayload,
      root: host,
    })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Invalid initial settings snapshot' })
    expect(runtime.current()).toBeUndefined()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it.each([
    ['initialDebugSnapshot', { _tag: 'InvalidInitialDebugSnapshot' }],
    ['initialLanguage', { _tag: 'InvalidSettingsLanguage' }],
  ] as const)(
    'returns a typed initialization failure for explicit null in %s',
    async (optionKey, typedFailure) => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const options = { root: host }
      expect(Reflect.set(options, optionKey, null)).toBe(true)
      const runtime = makeUiMount(options)

      const failure = await Effect.runPromise(Effect.flip(runtime.start))

      expect(failure).toMatchObject({
        _tag: 'UiMountError',
        message: 'Could not initialize mx-ui views',
        cause: typedFailure,
      })
      expect(runtime.current()).toBeUndefined()
      expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
    },
  )

  it.each([
    ['motion', 'Invalid initial motion preference'],
    ['colorVisionTarget', 'Invalid color-vision target'],
  ] as const)(
    'returns a typed mount failure for explicit null in %s instead of using its default',
    async (optionKey, message) => {
      const host = document.createElement('main')
      const canvas = document.createElement('canvas')
      canvas.style.setProperty('filter', 'contrast(0.8)')
      host.appendChild(canvas)
      document.body.appendChild(host)
      const options = {
        initialSettingsSnapshot: { ...DEFAULT_SETTINGS, colorVisionCorrection: 'protanopia' as const },
        root: host,
      }
      expect(Reflect.set(options, optionKey, null)).toBe(true)
      const runtime = makeUiMount(options)

      const failure = await Effect.runPromise(Effect.flip(runtime.start))

      expect(failure).toMatchObject({ _tag: 'UiMountError', message })
      expect(runtime.current()).toBeUndefined()
      expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
      expect(canvas.getAttribute('data-color-vision')).toBeNull()
      expect(canvas.style.getPropertyValue('filter')).toBe('contrast(0.8)')
    },
  )

  it.each(['initialSettings', 'initialSettingsSnapshot'] as const)(
    'rejects explicit null in %s instead of substituting defaults',
    async (settingKey) => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const options = { root: host }
      expect(Reflect.set(options, settingKey, null)).toBe(true)
      const runtime = makeUiMount(options)

      const failure = await Effect.runPromise(Effect.flip(runtime.start))

      expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Invalid initial settings snapshot' })
      expect(runtime.current()).toBeUndefined()
      expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
    },
  )

  it('returns a typed mount failure for a null main-menu callback and removes the owned root', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const menuCallbacks = {}
    expect(Reflect.set(menuCallbacks, 'onOpenSettings', null)).toBe(true)
    const runtime = makeUiMount({ menuCallbacks, root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({
      _tag: 'UiMountError',
      message: 'Invalid initial main-menu callbacks',
      cause: { _tag: 'InvalidMainMenuViewInput', field: 'callbacks.onOpenSettings' },
    })
    expect(runtime.current()).toBeUndefined()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it.each([null, 7])('returns a typed initialization failure for malformed menu callback containers (%s)', async (menuCallbacks) => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const options = { root: host }
    expect(Reflect.set(options, 'menuCallbacks', menuCallbacks)).toBe(true)
    const runtime = makeUiMount(options)

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({
      _tag: 'UiMountError',
      message: 'Invalid initial main-menu callbacks',
      cause: { _tag: 'InvalidMainMenuViewInput', field: 'callbacks' },
    })
    expect(runtime.current()).toBeUndefined()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('returns a typed initialization failure and cleans up when host settings change before start', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const hostSettingsPayload = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    const runtime = makeUiMount({ initialSettingsSnapshot: hostSettingsPayload, root: host })
    hostSettingsPayload.reducedMotion = 'unsupported'

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toBeInstanceOf(UiMountError)
    expect(failure['_tag']).toBe('UiMountError')
    expect(failure.message).toBe('Could not initialize mx-ui views')
    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('reports an unsupported host language as a typed startup failure and cleans up its root', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const hostOptions = JSON.parse('{"initialLanguage":"fr"}')
    const runtime = makeUiMount({ ...hostOptions, root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toBeInstanceOf(UiMountError)
    expect(failure['_tag']).toBe('UiMountError')
    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('mounts when the owner document has no window or media query source', async () => {
    const standaloneDocument = document.implementation.createHTMLDocument('standalone')
    const host = standaloneDocument.createElement('main')
    const runtime = makeUiMount({ motion: 'reduced', root: host })

    await Effect.runPromise(runtime.start)

    expect(standaloneDocument.defaultView).toBeNull()
    expect(runtime.current()).toBeDefined()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).not.toBeNull()
  })

  it('follows changes to the browser reduced-motion preference while using system settings', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const view = document.defaultView
    if (view === null) {
      throw new Error('Expected a browser window')
    }
    const previousMatchMedia = Object.getOwnPropertyDescriptor(view, 'matchMedia')
    const listeners = new Set<() => void>()
    let prefersReducedMotion = false
    const mediaQuery = {
      get matches() {
        return prefersReducedMotion
      },
      addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
    }
    const matchMedia = vi.fn(() => mediaQuery)
    Object.defineProperty(view, 'matchMedia', { configurable: true, value: matchMedia })
    const runtime = makeUiMount({ root: host })

    try {
      await Effect.runPromise(runtime.start)
      const experienceFill = host.querySelector<HTMLElement>('[data-mx-ui="experience-fill"]')
      expect(matchMedia).toHaveBeenCalledExactlyOnceWith('(prefers-reduced-motion: reduce)')
      expect(experienceFill?.style.getPropertyValue('transition')).toBe(
        `width ${String(EXPERIENCE_TRANSITION_MS)}ms linear`,
      )

      prefersReducedMotion = true
      listeners.forEach((listener) => listener())
      expect(experienceFill?.style.getPropertyValue('transition')).toBe('')

      prefersReducedMotion = false
      listeners.forEach((listener) => listener())
      expect(experienceFill?.style.getPropertyValue('transition')).toBe(
        `width ${String(EXPERIENCE_TRANSITION_MS)}ms linear`,
      )

      await Effect.runPromise(runtime.stop)
      expect(listeners.size).toBe(0)
    } finally {
      if (typeof previousMatchMedia === 'undefined') {
        Reflect.deleteProperty(view, 'matchMedia')
      } else {
        Object.defineProperty(view, 'matchMedia', previousMatchMedia)
      }
    }
  })

  it('removes the owned UI after reduced-motion listener cleanup fails', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    const canvas = document.createElement('canvas')
    canvas.style.setProperty('filter', 'contrast(0.8)')
    host.appendChild(unrelated)
    host.appendChild(canvas)
    document.body.appendChild(host)
    const view = document.defaultView
    if (view === null) {
      throw new Error('Expected a browser window')
    }
    const previousMatchMedia = Object.getOwnPropertyDescriptor(view, 'matchMedia')
    const cleanupError = new Error('media listener cleanup failed')
    const mediaQuery = {
      addEventListener: vi.fn((_type: 'change', _listener: () => void) => undefined),
      matches: false,
      removeEventListener: vi.fn((_type: 'change', _listener: () => void) => {
        throw cleanupError
      }),
    }
    Object.defineProperty(view, 'matchMedia', { configurable: true, value: vi.fn(() => mediaQuery) })
    const runtime = makeUiMount({ colorVisionTarget: canvas, root: host })
    let restoreColorVisionStyle: (() => void) | null = null

    try {
      await Effect.runPromise(runtime.start)
      expect(host.querySelector('[data-mx-ui="mount-root"]')).not.toBeNull()
      const setProperty = vi.spyOn(canvas.style, 'setProperty')
      restoreColorVisionStyle = () => setProperty.mockRestore()

      const failure = await Effect.runPromise(Effect.flip(runtime.stop))

      expect(failure).toBeInstanceOf(UiMountError)
      expect(failure['_tag']).toBe('UiMountError')
      expect(failure.cause).toMatchObject({
        cleanupErrors: [
          { operation: 'motionController', error: { _tag: 'UiMountError', cause: cleanupError } },
        ],
      })
      expect(runtime.current()).toBeUndefined()
      expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
      expect(host.contains(unrelated)).toBe(true)
      expect(canvas.style.getPropertyValue('filter')).toBe('contrast(0.8)')
      expect(setProperty).toHaveBeenCalledWith('filter', 'contrast(0.8)', '')
      expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce()
    } finally {
      restoreColorVisionStyle?.()
      if (typeof previousMatchMedia === 'undefined') {
        Reflect.deleteProperty(view, 'matchMedia')
      } else {
        Object.defineProperty(view, 'matchMedia', previousMatchMedia)
      }
    }
  })

  it('attempts both controller cleanups and owned-root removal after failures', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    const canvas = document.createElement('canvas')
    canvas.style.setProperty('filter', 'contrast(0.8)')
    host.appendChild(unrelated)
    host.appendChild(canvas)
    document.body.appendChild(host)
    const view = document.defaultView
    if (view === null) {
      throw new Error('Expected a browser window')
    }
    const previousMatchMedia = Object.getOwnPropertyDescriptor(view, 'matchMedia')
    const motionError = new Error('media listener cleanup failed')
    const colorVisionError = new Error('color vision cleanup failed')
    const rootError = new Error('owned root removal failed')
    const mediaQuery = {
      addEventListener: vi.fn((_type: 'change', _listener: () => void) => undefined),
      matches: false,
      removeEventListener: vi.fn((_type: 'change', _listener: () => void) => {
        throw motionError
      }),
    }
    Object.defineProperty(view, 'matchMedia', { configurable: true, value: vi.fn(() => mediaQuery) })
    const runtime = makeUiMount({ colorVisionTarget: canvas, root: host })
    let ownedRoot: HTMLElement | null = null
    let restoreOwnedRootRemove: (() => void) | null = null
    let restoreColorVisionStyle: (() => void) | null = null

    try {
      await Effect.runPromise(runtime.start)
      ownedRoot = runtime.current()?.root ?? null
      if (ownedRoot === null) {
        throw new Error('Expected a mounted UI root')
      }
      const originalSetProperty = canvas.style.setProperty.bind(canvas.style)
      const setProperty = vi.spyOn(canvas.style, 'setProperty').mockImplementation((
        propertyName,
        value,
        priority,
      ) => {
        if (propertyName === 'filter') {
          throw colorVisionError
        }
        originalSetProperty(propertyName, value, priority)
      })
      restoreColorVisionStyle = () => setProperty.mockRestore()
      const removeOwnedRoot = vi.spyOn(ownedRoot, 'remove').mockImplementation(() => {
        throw rootError
      })
      restoreOwnedRootRemove = () => removeOwnedRoot.mockRestore()

      const failure = await Effect.runPromise(Effect.flip(runtime.stop))

      expect(failure).toBeInstanceOf(UiMountError)
      expect(failure['_tag']).toBe('UiMountError')
      expect(failure.message).toBe('Failed to stop mx-ui')
      expect(failure.cause).toMatchObject({
        cleanupErrors: [
          { operation: 'motionController', error: { _tag: 'UiMountError', cause: motionError } },
          { operation: 'colorVisionController', error: { _tag: 'UiMountError', cause: colorVisionError } },
          { operation: 'ownedRoot', error: { _tag: 'UiMountError', cause: rootError } },
        ],
      })
      expect(runtime.current()).toBeUndefined()
      expect(host.contains(unrelated)).toBe(true)
      expect(host.contains(canvas)).toBe(true)
      expect(host.contains(ownedRoot)).toBe(true)
      expect(removeOwnedRoot).toHaveBeenCalledOnce()
      expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce()
    } finally {
      restoreColorVisionStyle?.()
      restoreOwnedRootRemove?.()
      ownedRoot?.remove()
      if (typeof previousMatchMedia === 'undefined') {
        Reflect.deleteProperty(view, 'matchMedia')
      } else {
        Object.defineProperty(view, 'matchMedia', previousMatchMedia)
      }
    }
  })

  it('continues partial-mount cleanup through both controllers and the owned root after failures', async () => {
    const host = document.createElement('main')
    const canvas = document.createElement('canvas')
    canvas.style.setProperty('filter', 'contrast(0.8)')
    host.appendChild(canvas)
    document.body.appendChild(host)
    const view = document.defaultView
    if (view === null) {
      throw new Error('Expected a browser window')
    }
    const previousMatchMedia = Object.getOwnPropertyDescriptor(view, 'matchMedia')
    const motionError = new Error('media listener cleanup failed')
    const colorVisionError = new Error('color vision cleanup failed')
    const rootError = new Error('owned root cleanup failed')
    const renderError = new Error('render failed')
    let failColorVisionCleanup = false
    const mediaQuery = {
      addEventListener: vi.fn((_type: 'change', _listener: () => void) => undefined),
      matches: false,
      removeEventListener: vi.fn((_type: 'change', _listener: () => void) => {
        throw motionError
      }),
    }
    Object.defineProperty(view, 'matchMedia', { configurable: true, value: vi.fn(() => mediaQuery) })
    const originalSetAttribute = HTMLElement.prototype.setAttribute
    const originalRemove = HTMLElement.prototype.remove
    vi.spyOn(HTMLElement.prototype, 'setAttribute').mockImplementation(function (
      this: HTMLElement,
      name,
      value,
    ) {
      if (name === 'data-world-type-options') {
        failColorVisionCleanup = true
        throw renderError
      }
      return originalSetAttribute.call(this, name, value)
    })
    vi.spyOn(HTMLElement.prototype, 'remove').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('data-mx-ui') === 'mount-root') {
        throw rootError
      }
      return originalRemove.call(this)
    })
    const runtime = makeUiMount({ colorVisionTarget: canvas, root: host })
    const originalSetProperty = canvas.style.setProperty.bind(canvas.style)
    const setProperty = vi.spyOn(canvas.style, 'setProperty').mockImplementation((
      propertyName,
      value,
      priority,
    ) => {
      if (failColorVisionCleanup && propertyName === 'filter') {
        throw colorVisionError
      }
      originalSetProperty(propertyName, value, priority)
    })

    try {
      const failure = await Effect.runPromise(Effect.flip(runtime.start))

      expect(failure).toMatchObject({
        _tag: 'UiMountError',
        message: 'Failed to mount mx-ui',
        cause: {
          cleanupError: {
            _tag: 'UiMountError',
            message: 'Failed to clean up partial mx-ui mount',
            cause: {
              cleanupErrors: [
                { operation: 'motionController', error: { _tag: 'UiMountError', cause: motionError } },
                { operation: 'colorVisionController', error: { _tag: 'UiMountError', cause: colorVisionError } },
                { operation: 'ownedRoot', error: { _tag: 'UiMountError', cause: rootError } },
              ],
            },
          },
          mountError: { _tag: 'UiMountError', cause: renderError },
        },
      })
      expect(runtime.current()).toBeUndefined()
      expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce()
    } finally {
      setProperty.mockRestore()
      vi.restoreAllMocks()
      if (typeof previousMatchMedia === 'undefined') {
        Reflect.deleteProperty(view, 'matchMedia')
      } else {
        Object.defineProperty(view, 'matchMedia', previousMatchMedia)
      }
    }
  })

  it('toggles the debug HUD and updates it from a typed snapshot', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    expect(debug?.hidden).toBe(true)
    expect(debug?.getAttribute('role')).toBe('region')
    expect(debug?.getAttribute('aria-label')).toBe('Debug information')
    expect(debug?.getAttribute('aria-live')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(debug?.hidden).toBe(false)

    runtime.updateDebug({
      chunk: { chunkX: 3, chunkZ: -2 },
      coordinates: { worldX: 12.5, worldY: 64, worldZ: -8.25 },
      facing: asUiMessageText('north'),
      fps: 59.94,
    })
    expect(debug?.textContent).toContain('FPS: 59.9')
    expect(debug?.textContent).toContain('XYZ: 12.5 / 64.0 / -8.3')
    expect(debug?.textContent).toContain('Chunk: 3 / -2')
    expect(debug?.textContent).toContain('Facing: north')
  })

  it('opens accessible settings, reports changes, and restores focus', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const onMouseSensitivityChange = vi.fn()
    const onRenderDistanceChange = vi.fn()
    const onFieldOfViewChange = vi.fn()
    const onMasterVolumeChange = vi.fn()
    const onBindingActivate = vi.fn()
    const runtime = makeUiMount({
      root: host,
      settingsCallbacks: {
        onFieldOfViewChange,
        onMasterVolumeChange,
        onMouseSensitivityChange,
        onRenderDistanceChange,
        onBindingActivate,
      },
    })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(document.activeElement?.getAttribute('data-setting')).toBe('mouseSensitivity')
    expect(dialog?.querySelectorAll('input[type="range"]')).toHaveLength(7)
    expect(dialog?.querySelectorAll('[data-interaction-target="settings-choice"]')).toHaveLength(17)
    expect(dialog?.querySelectorAll('[data-interaction-target="settings-binding"]')).toHaveLength(21)
    expect(dialog?.querySelectorAll('[data-interaction-target="settings-toggle"]')).toHaveLength(2)

    dialog?.querySelector<HTMLButtonElement>('[data-binding-action="moveForward"]')?.click()
    expect(onBindingActivate).toHaveBeenCalledExactlyOnceWith('moveForward')

    const changes = [
      ['mouseSensitivity', '1.25', onMouseSensitivityChange],
      ['renderDistance', String(MAX_RENDER_DISTANCE), onRenderDistanceChange],
      ['fieldOfView', '90', onFieldOfViewChange],
      ['masterVolume', '0.4', onMasterVolumeChange],
    ] as const
    for (const [setting, value, callback] of changes) {
      const input = host.querySelector<HTMLInputElement>(`[data-setting="${setting}"]`)
      if (input === null) {
        throw new Error(`Missing ${setting} input`)
      }
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      expect(callback).toHaveBeenLastCalledWith(Number(value))
    }
    expect(host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.max).toBe(String(MAX_RENDER_DISTANCE))

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }))
    expect(dialog?.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('applies a host settings snapshot received before mount to the initial UI', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    const settings = { ...DEFAULT_SETTINGS, uiScale: 1.25 }

    expect(runtime.updateSettingsSnapshot(settings)).toStrictEqual(Result.succeed(settings))
    await Effect.runPromise(runtime.start)

    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.25')
    runtime.openSettings()
    expect(host.querySelector<HTMLInputElement>('[data-setting="uiScale"]')?.value).toBe('1.25')
  })

  it('returns the typed settings failure and restores the prior language after a host mutates an accepted snapshot', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openSettings()
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))

    expect(Result.isSuccess(runtime.updateSettingsSnapshot(settings))).toBe(true)
    settings.renderDistance = MAX_RENDER_DISTANCE + 1

    const result = runtime.updateLanguage('ja')
    const englishChoice = host.querySelector<HTMLButtonElement>(
      '[data-settings-field="language"][data-setting-value="en"]',
    )
    const japaneseChoice = host.querySelector<HTMLButtonElement>(
      '[data-settings-field="language"][data-setting-value="ja"]',
    )

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSettingsSnapshot' }))
    expect(host.querySelector('[data-menu-entry="settings"]')?.textContent).toBe('Settings')
    expect(englishChoice?.getAttribute('aria-pressed')).toBe('true')
    expect(japaneseChoice?.getAttribute('aria-pressed')).toBe('false')
  })

  it('closes settings through the host API and restores the opening focus target', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    runtime.closeSettings()

    expect(dialog?.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('applies selected language, scale, color correction, and motion settings through the mounted view', async () => {
    const host = document.createElement('main')
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    document.body.appendChild(host)
    const onSettingsChange = vi.fn()
    const onLanguageChange = vi.fn()
    const runtime = makeUiMount({
      colorVisionTarget: canvas,
      initialSettingsSnapshot: DEFAULT_SETTINGS,
      root: host,
      settingsCallbacks: { onLanguageChange, onSettingsChange },
    })
    await Effect.runPromise(runtime.start)

    const mounted = runtime.current()
    if (mounted === undefined) {
      throw new Error('Expected a mounted session')
    }
    const setMotion = vi.spyOn(mounted.hud, 'setMotion')
    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')

    dialog?.querySelector<HTMLButtonElement>('[data-settings-field="language"][data-setting-value="ja"]')?.click()
    expect(host.querySelector('[data-menu-entry="settings"]')?.textContent).toBe('設定...')
    expect(onLanguageChange).toHaveBeenCalledExactlyOnceWith('ja')

    dialog?.querySelector<HTMLButtonElement>('[data-settings-field="reducedMotion"][data-setting-value="reduced"]')?.click()
    expect(setMotion).toHaveBeenCalledWith('reduced')
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: 'reduced' }))

    dialog?.querySelector<HTMLButtonElement>('[data-settings-field="colorVisionCorrection"][data-setting-value="protanopia"]')?.click()
    expect(canvas.getAttribute('data-color-vision')).toBe('protanopia')
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ colorVisionCorrection: 'protanopia' }))

    dialog?.querySelector<HTMLButtonElement>('[data-settings-field="graphicsPreset"][data-setting-value="ultra"]')?.click()
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      graphicsPreset: 'ultra',
      graphicsQuality: 'ultra',
    }))

    const audioToggle = dialog?.querySelector<HTMLButtonElement>('[data-settings-field="audioEnabled"]')
    audioToggle?.click()
    expect(audioToggle?.getAttribute('aria-checked')).toBe('false')
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ audioEnabled: false }))

    const scale = dialog?.querySelector<HTMLInputElement>('[data-setting="uiScale"]')
    if (scale === null || typeof scale === 'undefined') {
      throw new Error('Missing UI scale input')
    }
    scale.value = '1.25'
    scale.dispatchEvent(new Event('input', { bubbles: true }))
    expect(mounted.root.style.getPropertyValue('zoom')).toBe('1.25')
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1.25 }))
  })

  it('rejects invalid host settings without changing the rendered settings controls', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openSettings()

    const renderDistance = host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')
    if (renderDistance === null) {
      throw new Error('Missing render distance input')
    }
    const previousValue = renderDistance.value
    const result = runtime.updateSettingsSnapshot({ ...DEFAULT_SETTINGS, renderDistance: MAX_RENDER_DISTANCE + 1 })

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSettingsSnapshot' }))
    expect(renderDistance.value).toBe(previousValue)
  })

  it('connects settings focus groups to document arrow key navigation', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openSettings()

    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    const choices = Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>(
        '[data-settings-field="difficulty"][data-interaction-target="settings-choice"]',
      ) ?? [],
    )
    const selectedIndex = choices.findIndex((choice) => choice.getAttribute('aria-pressed') === 'true')
    const current = choices[selectedIndex]
    const next = choices[selectedIndex + 1]
    if (current === undefined || next === undefined) {
      throw new Error('Expected an adjacent difficulty choice')
    }
    current.focus()

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' })
    current.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(next)

    const left = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft' })
    next.dispatchEvent(left)
    expect(left.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(current)

    for (const key of ['ArrowUp', 'ArrowDown', 'Tab']) {
      const unchanged = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
      current.dispatchEvent(unchanged)
      expect(unchanged.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(current)
    }
  })

  it('uses typed focus navigation, native button activation, and Escape focus restoration', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const onInventoryActivate = vi.fn()
    const runtime = makeUiMount({ onInventoryActivate, root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(false)
    const first = inventory?.querySelector<HTMLElement>('[tabindex="0"]')
    expect(document.activeElement).toBe(first)

    const tab = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    first?.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(first)

    expect(runtime.moveFocus('right')).toBe(true)
    const second = inventory?.querySelector<HTMLElement>('[tabindex="0"]')
    expect(second).not.toBe(first)
    expect(document.activeElement).toBe(second)
    expect(second?.tagName).toBe('BUTTON')
    second?.click()
    expect(onInventoryActivate).toHaveBeenCalledTimes(1)
    expect(onInventoryActivate).toHaveBeenLastCalledWith({
      index: 1,
      kind: 'slot',
      region: 'hotbar',
    })

    const escape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    document.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('does not toggle inventory while an editable control owns the E key', async () => {
    const host = document.createElement('main')
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    host.append(input, textarea, select, editable)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    for (const control of [input, textarea, select, editable]) {
      control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'e' }))
      expect(inventory?.hasAttribute('hidden')).toBe(true)
    }

    const button = document.createElement('button')
    host.append(button)
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'e' }))
    expect(inventory?.hasAttribute('hidden')).toBe(false)
  })

  it('routes focus in non-inventory groups while inventory is closed or open', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const mountedRoot = runtime.current()?.root
    if (mountedRoot === undefined) {
      throw new Error('expected a mounted session')
    }
    const first = document.createElement('button')
    const second = document.createElement('button')
    for (const [button, index] of [[first, 0], [second, 1]] as const) {
      button.setAttribute('data-focus-group', 'station')
      button.setAttribute('data-focus-index', String(index))
      button.setAttribute('data-focus-columns', '2')
      mountedRoot.append(button)
    }

    first.focus()
    expect(runtime.moveFocus('right')).toBe(true)
    expect(document.activeElement).toBe(second)

    runtime.openInventory()
    first.focus()
    expect(runtime.moveFocus('right')).toBe(true)
    expect(document.activeElement).toBe(second)
  })

  it('leaves forward and reverse Tab traversal to the browser', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    if (inventory === null) {
      throw new Error('The inventory view should be mounted')
    }
    const first = inventory.querySelector<HTMLElement>('[tabindex="0"]')
    first?.focus()
    const forward = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    const reverse = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    })

    document.dispatchEvent(forward)
    document.dispatchEvent(reverse)

    expect(forward.defaultPrevented).toBe(false)
    expect(reverse.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(first)
  })

  it('REGRESSION: closing the inventory via a key does not throw when nothing was focused to restore', async () => {
    // `document.activeElement` is typed `Element | null` — jsdom never actually hands the keyboard
    // path a `null`, but the internal `closeInventory` closure still guards for it. Overriding the
    // getter for this one test is what reaches that path (see the analogous `openSettings` test
    // above) without weakening the real DOM assumption everywhere else.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
    Object.defineProperty(document, 'activeElement', { configurable: true, value: null })
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))
      const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
      expect(inventory?.hasAttribute('hidden')).toBe(false)

      expect(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' })),
      ).not.toThrow()
      expect(inventory?.hasAttribute('hidden')).toBe(true)
    } finally {
      if (typeof original !== 'undefined') {
        Object.defineProperty(Document.prototype, 'activeElement', original)
      }
      Reflect.deleteProperty(document, 'activeElement')
    }
  })

  it('shares spatial inventory navigation between typed focus and controller commands', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryActivate = vi.fn()
    const runtime = makeUiMount({ onInventoryActivate, root: host })
    await Effect.runPromise(runtime.start)

    expect(runtime.moveInventoryFocus('right')).toBe(false)
    expect(runtime.activateInventoryFocus()).toBe(false)
    const firstHotbarSlot = host.querySelector<HTMLElement>(
      '[data-mx-ui="hud"] [data-mx-ui="slot"][data-slot-index="0"]',
    )
    firstHotbarSlot?.focus()
    expect(runtime.moveFocus('left')).toBe(false)
    expect(document.activeElement).toBe(firstHotbarSlot)
    runtime.openInventory()

    expect(runtime.moveFocus('right')).toBe(true)
    expect(runtime.moveFocus('down')).toBe(true)
    expect(runtime.moveInventoryFocus('down')).toBe(true)
    expect(runtime.activateInventoryFocus()).toBe(true)
    expect(onInventoryActivate).toHaveBeenLastCalledWith({
      index: 10,
      kind: 'slot',
      region: 'main',
    })
    const focused = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    expect(focused?.getAttribute('data-focus-group')).toBe('main')
    expect(focused?.getAttribute('data-focus-index')).toBe('10')
    expect(document.activeElement).toBe(focused)
    expect(runtime.moveInventoryFocus('up')).toBe(true)
  })

  describe('equipment actions', () => {
    it('emits typed click and shift-click inventory actions', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const onInventoryAction = vi.fn()
      const runtime = makeUiMount({ onInventoryAction, root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      expect(runtime.activateInventoryFocus()).toBe(true)
      expect(runtime.activateInventoryFocus('shift-click')).toBe(true)
      expect(onInventoryAction.mock.calls).toStrictEqual([
        [{ kind: 'click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
        [{ kind: 'shift-click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
      ])
    })

    it('turns a shifted inventory slot click into a shift-click action', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const onInventoryAction = vi.fn()
      const runtime = makeUiMount({ onInventoryAction, root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      const slot = host.querySelector<HTMLElement>('[data-region="main"] [data-mx-ui="slot"]')
      expect(slot).not.toBeNull()
      slot?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))

      expect(onInventoryAction).toHaveBeenCalledExactlyOnceWith({
        kind: 'shift-click',
        target: { index: 0, kind: 'slot', region: 'main' },
      })
    })

    it('emits equipment drag actions in equip and unequip directions', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const onInventoryAction = vi.fn()
      const runtime = makeUiMount({ onInventoryAction, root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      const storageSlot = { index: 2, kind: 'slot', region: 'main' } as const
      const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
      expect([
        runtime.dragInventorySlot(storageSlot, headSlot),
        runtime.dragInventorySlot(headSlot, storageSlot),
      ]).toStrictEqual([true, true])
      expect(onInventoryAction.mock.calls).toStrictEqual([
        [{ kind: 'drag', source: storageSlot, target: headSlot }],
        [{ kind: 'drag', source: headSlot, target: storageSlot }],
      ])
    })

    it('projects an equipment rejection supplied by the host', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const runtime = makeUiMount({ root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      const storageSlot = { index: 2, kind: 'slot', region: 'main' } as const
      const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
      runtime.updateInventoryActionState({
        action: { kind: 'drag', source: storageSlot, target: headSlot },
        kind: 'rejected',
        reason: 'The selected item cannot be worn on the head',
      })
      expect(host.querySelector('[data-mx-ui="inventory-status"]')?.textContent).toBe(
        'The selected item cannot be worn on the head',
      )
    })
  })

  it('does not open inventory behind settings', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.openSettings()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(true)
  })

  it('detaches session keyboard listeners across remount and stop', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    const firstDebug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')

    await Effect.runPromise(runtime.start)
    const currentDebug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(firstDebug?.hidden).toBe(true)
    expect(currentDebug?.hidden).toBe(false)

    await Effect.runPromise(runtime.stop)
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(currentDebug?.hidden).toBe(false)
  })

  it('falls back to zero for a non-finite debug number instead of printing NaN or Infinity', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    runtime.updateDebug({
      chunk: { chunkX: 3, chunkZ: -2 },
      coordinates: { worldX: Number.NaN, worldY: 64, worldZ: -8.25 },
      fps: Number.POSITIVE_INFINITY,
    })
    expect(debug?.textContent).toContain('FPS: 0.0')
    expect(debug?.textContent).toContain('XYZ: 0.0 / 64.0 / -8.3')
  })

  it('closes settings when the close button is clicked', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    dialog?.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click()
    expect(dialog?.hidden).toBe(true)
  })

  it('closes settings on a second F10 press instead of leaving it stuck open', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    expect(dialog?.hidden).toBe(true)
  })

  it('ignores an auto-repeated F1 keydown so holding the key does not re-toggle the debug HUD', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(debug?.hidden).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1', repeat: true }))
    expect(debug?.hidden).toBe(false)
  })

  it('does not re-capture or re-focus when settings are opened a second time while already open', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    const mouseSensitivityInput = host.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')
    expect(document.activeElement).toBe(mouseSensitivityInput)

    mouseSensitivityInput?.blur()
    runtime.openSettings()

    expect(dialog?.hidden).toBe(false)
    expect(document.activeElement).not.toBe(mouseSensitivityInput)
  })

  it('opens settings without capturing a focus target when the document reports none', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
    Object.defineProperty(document, 'activeElement', { configurable: true, value: null })
    try {
      runtime.openSettings()
    } finally {
      if (typeof original !== 'undefined') {
        Object.defineProperty(Document.prototype, 'activeElement', original)
      }
      Reflect.deleteProperty(document, 'activeElement')
    }
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    runtime.closeSettings()
    expect(dialog?.hidden).toBe(true)
  })

  it('forwards every host-owned menu callback through UiMount', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onCreateWorld = vi.fn()
    const onLoadWorld = vi.fn()
    const onDeleteWorld = vi.fn()
    const onDeleteUnreadableSave = vi.fn()
    const onExportWorld = vi.fn()
    const onOpenMultiplayer = vi.fn()
    const onExit = vi.fn()
    const onStateChange = vi.fn()
    const runtime = makeUiMount({
      menuCallbacks: {
        onCreateWorld,
        onDeleteUnreadableSave,
        onDeleteWorld,
        onExit,
        onExportWorld,
        onLoadWorld,
        onOpenMultiplayer,
        onOpenSettings: () => undefined,
        onStateChange,
      },
      root: host,
    })
    await Effect.runPromise(runtime.start)

    runtime.current()?.mainMenu.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS, WORLD_TYPES, [UNREADABLE_SAVE]))

    host.querySelector<HTMLButtonElement>('[data-menu-entry="single-player"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-new-world"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-menu-panel="new-world"] [data-menu-action="confirm"]')?.click()
    expect(onCreateWorld).toHaveBeenCalledExactlyOnceWith({
      difficulty: 'normal',
      mode: 'survival',
      name: 'New World',
      seed: { kind: 'random' },
      worldType: asWorldTypeId('standard'),
    })
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ panel: 'new-world' }))

    runtime.current()?.mainMenu.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS, WORLD_TYPES, [UNREADABLE_SAVE]))
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-row"][data-session-id="session-1"]')?.click()
    expect(onLoadWorld).toHaveBeenCalledExactlyOnceWith(SAVED_WORLDS[0])

    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-export"]')?.click()
    expect(onExportWorld).toHaveBeenCalledExactlyOnceWith(SAVED_WORLDS[0])

    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-delete"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-delete-confirm"]')?.click()
    expect(onDeleteWorld).toHaveBeenCalledExactlyOnceWith(SAVED_WORLDS[0])

    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-unreadable-delete"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-unreadable-delete-confirm"]')?.click()
    expect(onDeleteUnreadableSave).toHaveBeenCalledExactlyOnceWith(UNREADABLE_SAVE)

    runtime.current()?.mainMenu.render(mainMenuViewModel(initialMainMenuState))
    host.querySelector<HTMLButtonElement>('[data-menu-entry="multiplayer"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-menu-entry="exit"]')?.click()
    expect(onOpenMultiplayer).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('disables host-owned menu actions when no callback is connected', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const menu = runtime.current()?.mainMenu
    menu?.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS, WORLD_TYPES))
    host.querySelector<HTMLButtonElement>('[data-menu-entry="single-player"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-row"][data-session-id="session-1"]')?.click()

    expect(host.querySelector<HTMLButtonElement>('[data-menu-entry="multiplayer"]')?.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-menu-entry="exit"]')?.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-menu-panel="load-world"] [data-mx-ui="menu-world-row"]')?.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-delete"]')?.disabled).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-world-export"]')?.disabled).toBe(true)

    host.querySelector<HTMLButtonElement>('[data-mx-ui="menu-new-world"]')?.click()
    expect(host.querySelector<HTMLButtonElement>('[data-menu-panel="new-world"] [data-menu-action="confirm"]')?.disabled).toBe(true)
  })

  it('closes an open inventory through the top-level API and restores focus, and no-ops when already closed', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openInventory()
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(false)

    runtime.closeInventory()
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)

    // Already closed: the guard returns before touching focus or the attribute again.
    trigger.focus()
    runtime.closeInventory()
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('re-renders a live inventory from a host-pushed model through updateInventory, open or closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [testItemStack('torch', 3)] },
    }, fakeItemDisplayNameOptions())

    runtime.updateInventory(model)
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    const hotbarFirstSlot = () =>
      inventory?.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
    expect(hotbarFirstSlot()?.querySelector('[data-mx-ui="slot-item"]')?.textContent).toBe(
      'en:torch',
    )

    runtime.openInventory()
    const other = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [testItemStack('coal', 5)] },
    }, fakeItemDisplayNameOptions())
    runtime.updateInventory(other)
    expect(hotbarFirstSlot()?.querySelector('[data-mx-ui="slot-item"]')?.textContent).toBe(
      'en:coal',
    )
  })

  it('REGRESSION: updateInventory and updateInventoryActionState are no-ops before start (or after stop)', async () => {
    // `session.mounted` is `null` until `start` succeeds (and again after `stop`) — a host that
    // calls either update before mounting, or races a `stop`, must not crash.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })

    expect(() =>
      runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot)),
    ).not.toThrow()
    expect(() => runtime.updateInventoryActionState({ kind: 'idle' })).not.toThrow()

    await Effect.runPromise(runtime.start)
    await Effect.runPromise(runtime.stop)

    expect(() =>
      runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot)),
    ).not.toThrow()
    expect(() => runtime.updateInventoryActionState({ kind: 'idle' })).not.toThrow()
  })

  it('applies host-pushed settings through updateSettings without opening the dialog', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    const settings = runtime.updateSettings({
      fieldOfView: 90,
      masterVolume: 0.5,
      mouseSensitivity: 2,
      renderDistance: MAX_RENDER_DISTANCE,
      uiScale: 1.25,
    })
    expect(Result.isSuccess(settings)).toBe(true)
    await Effect.runPromise(runtime.start)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.25')

    const invalid = runtime.updateSettings({
      fieldOfView: 90,
      masterVolume: 0.5,
      mouseSensitivity: 2,
      renderDistance: MAX_RENDER_DISTANCE + 1,
      uiScale: 1.25,
    })
    expect(invalid).toStrictEqual(Result.fail({ _tag: 'InvalidSettingsSnapshot' }))

    const valid = runtime.updateSettings({
      fieldOfView: 90,
      masterVolume: 0.5,
      mouseSensitivity: 2,
      renderDistance: MAX_RENDER_DISTANCE,
      uiScale: 1.25,
    })
    expect(Result.isSuccess(valid)).toBe(true)

    runtime.openSettings()
    expect(host.querySelector<HTMLInputElement>('[data-setting="fieldOfView"]')?.value).toBe('90')
    expect(host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.value).toBe(String(MAX_RENDER_DISTANCE))
    expect(host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.max).toBe(String(MAX_RENDER_DISTANCE))
  })

  it('property: updateSettings accepts exactly integer render distances in the sim range', () => {
    const runtime = makeRawUiMount({ root: document.createElement('main') })
    fc.assert(
      fc.property(
        fc.double({
          max: MAX_RENDER_DISTANCE + 2,
          min: MIN_RENDER_DISTANCE - 2,
          noDefaultInfinity: true,
          noNaN: true,
        }),
        (renderDistance) => {
          const expectedValid =
            Number.isInteger(renderDistance) &&
            renderDistance >= MIN_RENDER_DISTANCE &&
            renderDistance <= MAX_RENDER_DISTANCE
          const result = runtime.updateSettings({
            fieldOfView: DEFAULT_SETTINGS.fovDegrees,
            masterVolume: DEFAULT_SETTINGS.masterVolume,
            mouseSensitivity: DEFAULT_SETTINGS.mouseSensitivity,
            renderDistance,
            uiScale: DEFAULT_UI_SETTINGS.uiScale,
          })
          return Result.isSuccess(result) === expectedValid
        },
      ),
      { numRuns: 40, seed: 20261109 },
    )
  })

  it('applies valid UI scale updates to every owned surface and rejects values outside its range', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const changed = runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: 1.4 })
    expect(Result.isSuccess(changed)).toBe(true)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.4')
    expect(host.querySelector('[data-mx-ui="hud"]')?.parentElement?.style.getPropertyValue('zoom')).toBe('1.4')
    expect(host.querySelector('[data-mx-ui="time-cue"]')?.closest('[data-mx-ui="mount-root"]')).not.toBeNull()

    fc.assert(
      fc.property(fc.integer({ min: 75, max: 150 }), (hundredths) => {
        const scale = hundredths / 100
        const result = runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: scale })
        expect(Result.isSuccess(result)).toBe(true)
        expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe(String(scale))
      }),
      { numRuns: 76 },
    )

    const atMaximum = runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: 1.5 })
    expect(Result.isSuccess(atMaximum)).toBe(true)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.5')

    const rejected = runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: 1.5001 })
    expect(Result.isFailure(rejected)).toBe(true)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.5')
    expect(Result.isSuccess(runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: 0.75 }))).toBe(true)
    expect(Result.isFailure(runtime.updateSettings({ ...DEFAULT_UI_SETTINGS, uiScale: 0.7499 }))).toBe(true)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('0.75')
  })

  it('rejects an invalid initial UI scale and removes its owned mount root', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({
      initialSettings: { ...DEFAULT_UI_SETTINGS, uiScale: 1.5001 },
      root: host,
    })

    await expect(Effect.runPromise(runtime.start)).rejects.toMatchObject({
      message: 'Invalid initial UI scale',
      name: 'UiMountError',
    })
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('routes a host hit notification through the mounted crosshair, resetting on the next frame', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    runtime.notifyHit()
    runtime.updateCrosshair(undefined)
    runtime.notifyHit()
    runtime.updateCrosshair({ breakProgress: 0.5, hit: false })
    runtime.notifyHit()
    await Effect.runPromise(runtime.start)

    const crosshair = host.querySelector('[data-mx-ui="crosshair"]')
    expect(crosshair?.getAttribute('data-crosshair-hit')).toBe('')
    runtime.updateCrosshair({ breakProgress: 0.5, hit: false })
    expect(crosshair?.hasAttribute('data-crosshair-hit')).toBe(false)
    runtime.updateCrosshair(undefined)
    runtime.notifyHit()
    expect(crosshair?.hasAttribute('data-crosshair-hit')).toBe(false)

    fc.assert(
      fc.property(
        fc.boolean(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (hit, breakProgress) => {
          runtime.updateCrosshair({ breakProgress, hit })
          runtime.notifyHit()
          expect(crosshair?.getAttribute('data-crosshair-hit')).toBe('')
          runtime.updateCrosshair({ breakProgress, hit: false })
          expect(crosshair?.hasAttribute('data-crosshair-hit')).toBe(false)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('property: updateHud projects each legal health boundary to death state in the mounted DOM', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (healthPoints) => {
        const vitals = Schema.decodeUnknownSync(VitalsSchema)({
          ...SPAWN_VITALS,
          healthPoints,
        })
        const model = projectHudViewModel(vitals, [], { selectedHotbarSlot: 0 })
        runtime.updateHud(model)
        expect(host.querySelector('[data-mx-ui="hud"]')?.hasAttribute('data-dead')).toBe(healthPoints === 0)
        expect(host.querySelector('[data-mx-ui="death"]')?.hasAttribute('hidden')).toBe(healthPoints !== 0)
      }),
      { numRuns: 21 },
    )
  })

  it('rejects stop when tearing down the previous mount throws', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const mounted = runtime.current()
    if (typeof mounted === 'undefined') {
      throw new Error('expected a mounted session')
    }
    const removeOwnedRoot = vi.spyOn(mounted.root, 'remove')
    vi.spyOn(mounted.overlays, 'destroy').mockImplementation(() => {
      throw new Error('destroy failed')
    })

    const failure = await Effect.runPromise(Effect.flip(runtime.stop))

    expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Failed to stop mx-ui' })
    expect(failure.cause).toMatchObject({
      cleanupErrors: [
        {
          operation: 'overlays',
          error: { _tag: 'UiMountError', message: 'Failed to stop mx-ui', cause: { message: 'destroy failed' } },
        },
      ],
    })
    expect(removeOwnedRoot).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('rejects start when tearing down the previous mount throws', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const mounted = runtime.current()
    if (typeof mounted === 'undefined') {
      throw new Error('expected a mounted session')
    }
    vi.spyOn(mounted.overlays, 'destroy').mockImplementation(() => {
      throw new Error('destroy failed')
    })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({
      _tag: 'UiMountError',
      message: 'Failed to unmount previous mx-ui views',
    })
    expect(failure.cause).toMatchObject({
      cleanupErrors: [
        {
          operation: 'overlays',
          error: {
            _tag: 'UiMountError',
            message: 'Failed to unmount previous mx-ui views',
            cause: { message: 'destroy failed' },
          },
        },
      ],
    })
    expect(runtime.current()).toBeUndefined()
  })

  it('moves in all four directions through the typed focus API', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    const currentTarget = () => {
      const active = document.activeElement
      if (!(active instanceof Element)) {
        return undefined
      }
      return {
        group: active.getAttribute('data-focus-group'),
        index: active.getAttribute('data-focus-index'),
      }
    }
    const focusRingAt = (index: number) =>
      host.querySelector<HTMLElement>(
        `[data-focus-group="hotbar"][data-focus-index="${String(index)}"] [data-mx-ui="slot-focus-ring"]`,
      )

    expect(focusRingAt(0)?.hasAttribute('hidden')).toBe(false)
    expect(runtime.moveFocus('right')).toBe(true)
    expect(currentTarget()).toStrictEqual({ group: 'hotbar', index: '1' })
    expect(focusRingAt(1)?.hasAttribute('hidden')).toBe(false)
    expect(focusRingAt(0)?.hasAttribute('hidden')).toBe(true)
    expect(runtime.moveFocus('down')).toBe(true)
    expect(currentTarget()).toStrictEqual({ group: 'main', index: '1' })
    expect(focusRingAt(1)?.hasAttribute('hidden')).toBe(true)
    expect(runtime.moveFocus('left')).toBe(true)
    expect(currentTarget()).toStrictEqual({ group: 'main', index: '0' })
    expect(runtime.moveFocus('up')).toBe(true)
    expect(currentTarget()).toStrictEqual({ group: 'hotbar', index: '0' })
    expect(focusRingAt(0)?.hasAttribute('hidden')).toBe(false)
  })

  it('restores hotbar focus and its HUD ring when the public inventory close is called', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const hotbarSlot = host.querySelector<HTMLElement>(
      '[data-mx-ui="hud"] [data-focus-group="hotbar"][data-focus-index="4"]',
    )
    if (hotbarSlot === null) {
      throw new Error('expected the fifth HUD hotbar slot')
    }
    const mounted = runtime.current()
    if (typeof mounted === 'undefined') {
      throw new Error('expected a mounted session')
    }
    mounted.hud.setKeyboardFocus(4)
    hotbarSlot.focus()
    expect(document.activeElement).toBe(hotbarSlot)

    runtime.openInventory()
    expect(runtime.moveFocus('right')).toBe(true)
    expect(document.activeElement?.getAttribute('data-focus-index')).toBe('1')
    runtime.closeInventory()

    expect(document.activeElement).toBe(hotbarSlot)
    expect(hotbarSlot.querySelector('[data-mx-ui="slot-focus-ring"]')?.hasAttribute('hidden')).toBe(false)
    expect(hotbarSlot.getAttribute('tabindex')).toBe('0')
  })

  it('routes focus through the crafting output using typed grid directions', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.updateInventory(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: testItemStack('stick', 4) },
        },
      }),
    )
    runtime.openInventory()

    const output = host.querySelector<HTMLElement>('[data-mx-ui="crafting-output"]')
    output?.focus()
    expect(runtime.moveFocus('up')).toBe(true)
    expect(document.activeElement?.getAttribute('data-focus-group')).toBe('crafting-grid')
    expect(runtime.moveFocus('down')).toBe(true)
    expect(document.activeElement).toBe(output)
  })

  it('an unrecognized key while the inventory is open falls through every handler untouched', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    const before = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'a' })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')).toBe(before)
  })

  it('rejects start when the mount root has no owning document', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    Object.defineProperty(host, 'ownerDocument', { value: null })
    const runtime = makeUiMount({ root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({
      _tag: 'UiMountError',
      message: 'The mx-ui mount root has no ownerDocument',
    })
  })

  it('does not emit a drag action while the inventory is closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryAction = vi.fn()
    const runtime = makeUiMount({ onInventoryAction, root: host })
    await Effect.runPromise(runtime.start)

    const storageSlot = { index: 0, kind: 'slot', region: 'hotbar' } as const
    const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
    expect(runtime.dragInventorySlot(storageSlot, headSlot)).toBe(false)
    expect(onInventoryAction).not.toHaveBeenCalled()
  })

  it('leaves Tab alone while the inventory is closed', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    trigger.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(
      host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')?.hasAttribute('hidden'),
    ).toBe(true)

    await Effect.runPromise(runtime.stop)
  })

  it('does not restore focus to a non-HTMLElement active element when the inventory closes', async () => {
    // `restoreFocusTarget` narrows `document.activeElement` (`Element | null`) to `HTMLElement`.
    // jsdom lets a focusable SVG element become `activeElement`, and `SVGElement` is real and not
    // an `HTMLElement` — a host page with an SVG icon focused when the inventory opens is exactly
    // this case, not a fabricated one.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svgIcon.setAttribute('tabindex', '0')
    host.appendChild(svgIcon)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    svgIcon.focus()
    expect(document.activeElement).toBe(svgIcon)
    runtime.openInventory()
    runtime.closeInventory()

    expect(document.activeElement).not.toBe(svgIcon)
  })

  it('falls back to the first real target when a host-pushed model drops the focused output', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.updateInventory(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: testItemStack('stick', 4) },
        },
      }),
    )
    runtime.openInventory()
    const output = host.querySelector<HTMLElement>('[data-mx-ui="crafting-output"]')
    output?.focus()
    expect(document.activeElement).toBe(output)

    runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot))

    const hotbarFirstSlot = host.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
    expect(hotbarFirstSlot?.getAttribute('tabindex')).toBe('0')
  })

  it('opens with a host-supplied model through the top-level API, and no-ops when already open', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [testItemStack('diamond', 1)] },
    }, fakeItemDisplayNameOptions())
    runtime.openInventory(model)
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(
      inventory
        ?.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
        ?.querySelector('[data-mx-ui="slot-item"]')?.textContent,
    ).toBe('en:diamond')

    const focusedBefore = document.activeElement
    runtime.openInventory()
    expect(document.activeElement).toBe(focusedBefore)
  })

  it('REGRESSION: a redundant openInventory call does not overwrite the focus to restore on close', async () => {
    // The guard this test targets (`typeof view === 'undefined' || session.inventoryOpen`)
    // is the only thing stopping a second `openInventory()` call from re-capturing
    // `document.activeElement` while the inventory is already open — at which point
    // the active element is something INSIDE the inventory, not the trigger the
    // player actually opened it from. Without the guard, `closeInventory()` would
    // restore focus to whatever was focused inside the inventory instead of back
    // to the trigger, which reads as "closing the inventory silently stole focus."
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openInventory()
    expect(document.activeElement).not.toBe(trigger)

    // Redundant: the inventory is already open. Must no-op, including leaving
    // `restoreFocus` pointed at `trigger` rather than at whatever has focus now.
    runtime.openInventory()

    runtime.closeInventory()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns false when typed focus navigation has no target in a hand-built model', async () => {
    // `InventoryViewModel` is host-suppliable directly — `inventoryTargets` can only ever see zero
    // targets for one that was hand-built or replayed from persistence rather than produced by
    // `inventoryViewModel`, which always seeds a non-empty `hotbar` and `main`.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const empty: InventoryViewModel = {
      carried: undefined,
      crafting: { kind: 'unknown' },
      mergeTargets: { kind: 'unknown' },
      regions: [],
    }
    runtime.updateInventory(empty)
    runtime.openInventory()

    expect(runtime.moveFocus('left')).toBe(false)
    expect(host.querySelector('[data-mx-ui="inventory"] [tabindex="0"]')).toBeNull()
  })

  it('does not activate a hand-built offhand target beyond the one real offhand slot', async () => {
    // `inventoryActionTarget` (inventory-actions.ts) answers `null` for an offhand index other than
    // the one real slot `offhandRegion` ever builds — reachable only by handing `updateInventory` a
    // model whose offhand region carries more than one slot, which no real snapshot produces.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryAction = vi.fn()
    const runtime = makeUiMount({ onInventoryAction, root: host })
    await Effect.runPromise(runtime.start)

    const base = inventoryViewModel({
      ...emptyInventorySnapshot,
      offhand: testItemStack('shield', 1),
    })
    const widenedOffhand: InventoryViewModel = {
      ...base,
      regions: base.regions.map((region) => {
        if (region.kind === 'slots' && region.id === 'offhand') {
          const [firstSlot] = region.slots
          if (firstSlot === undefined) {
            return region
          }
          return { ...region, slots: [...region.slots, { ...firstSlot, index: 1 }] }
        }
        return region
      }),
    }
    runtime.updateInventory(widenedOffhand)
    runtime.openInventory()

    const malformedSlot = host.querySelector<HTMLElement>(
      '[data-region="offhand"] [data-focus-index="1"]',
    )
    malformedSlot?.focus()
    expect(runtime.moveFocus('right')).toBe(true)
    const focused = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    expect(focused).toBe(malformedSlot)

    expect(runtime.activateInventoryFocus()).toBe(false)
    expect(onInventoryAction).not.toHaveBeenCalled()
  })
})
