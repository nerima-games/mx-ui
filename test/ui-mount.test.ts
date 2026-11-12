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
import {
  finishToastSubscriptionClose,
  finishUiMountCleanup,
} from '../src/application/ui-mount-cleanup'
import { achievementToastFromEvent } from '../src/domain/achievement-toast'
import type { InventoryInteractionTarget } from '../src/application/inventory-view'
import { makeUiFrameState, uiModule, uiStages } from '../src/stages/registration'
import { initialMainMenuState, mainMenuViewModel, type SavedWorld } from '../src/domain/main-menu'
import {
  emptyInventorySnapshot,
  inventoryViewModel,
  type InventoryViewModel,
} from '../src/domain/inventory-view-model'
import { DeltaTimeSecs } from '@nerima-games/mc-kernel'
import { DomainEventBus, SPAWN_VITALS, VitalsSchema, itemStack as makeItemStack } from '@nerima-games/mc-sim'
import { achievementEvent, untrustedAchievementEvent } from './helpers/achievement-event'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'
import { DEFAULT_UI_SETTINGS } from '../src/application/session-overlays'
import { HudPresentationSnapshotSchema } from '../src/domain/hud-presentation'
import { hudViewModel as projectHudViewModel } from '../src/domain/hud-view-model'
import { UI_STAGE_IDS } from '../src/stages/stage-ids'
import { FrameServicesLayer } from './frame-services'

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
const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [{ sessionId: 'session-1', name: 'Cliff House' }]

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
    expect(settingsButton?.textContent).toBe('Options...')
    const result = runtime.updateLanguage('ja')

    expect(Result.isSuccess(result)).toBe(true)
    expect(settingsButton?.textContent).toBe('設定...')
    expect(settingsButton?.getAttribute('aria-label')).toBe('設定...')
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
      if (name === 'data-menu-showing') {
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

  it('reports a partial-mount cleanup failure with both mount and cleanup causes', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const originalSetAttribute = HTMLElement.prototype.setAttribute
    const originalRemove = HTMLElement.prototype.remove
    vi.spyOn(HTMLElement.prototype, 'setAttribute').mockImplementation(function (
      this: HTMLElement,
      name,
      value,
    ) {
      if (name === 'data-menu-showing') {
        throw new Error('render failed')
      }
      return originalSetAttribute.call(this, name, value)
    })
    vi.spyOn(HTMLElement.prototype, 'remove').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('data-mx-ui') === 'mount-root') {
        throw new Error('cleanup failed')
      }
      return originalRemove.call(this)
    })
    const runtime = makeUiMount({ root: host })

    const failure = await Effect.runPromise(Effect.flip(runtime.start))

    expect(failure).toMatchObject({
      _tag: 'UiMountError',
      message: 'Failed to mount mx-ui',
      cause: {
        cleanupError: {
          _tag: 'UiMountError',
          message: 'Failed to clean up partial mx-ui mount',
          cause: { message: 'cleanup failed' },
        },
        mountError: { _tag: 'UiMountError', cause: { message: 'render failed' } },
      },
    })
    expect(runtime.current()).toBeUndefined()
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
      facing: 'north',
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
    const runtime = makeUiMount({
      root: host,
      settingsCallbacks: {
        onFieldOfViewChange,
        onMasterVolumeChange,
        onMouseSensitivityChange,
        onRenderDistanceChange,
      },
    })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(document.activeElement?.getAttribute('data-setting')).toBe('mouseSensitivity')

    const changes = [
      ['mouseSensitivity', '1.25', onMouseSensitivityChange],
      ['renderDistance', '20', onRenderDistanceChange],
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

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }))
    expect(dialog?.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
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
    expect(escape.defaultPrevented).toBe(false)
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

  it('is a no-op to close settings a second time when already closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(true)

    // Observable behavior is unchanged either way here: `restoreFocus` is
    // already null before the first close a session ever performs, so this
    // pins the coverage gap (the guard branch is reachable and exercised)
    // rather than a difference the fake or real DOM can see, the same
    // distinction docs/testing.md §5-1 draws for `setMotion`'s early return.
    runtime.closeSettings()

    expect(dialog?.hidden).toBe(true)
  })

  it('forwards menu callbacks: creating a world, changing panels, and loading a world the host supplies later', async () => {
    // `buildMenuCallbacks` wraps every `MainMenuCallbacks` entry mx-ui does not
    // own extra behaviour for (`onCreateWorld`, `onLoadWorld`, `onStateChange`)
    // in a passthrough closure. `onOpenSettings` is covered elsewhere by every
    // test that opens settings through the menu button; these three are not
    // exercised by anything else in this file. `onLoadWorld` specifically needs
    // a saved world to click, and `buildMountedViews` always mounts the menu
    // with an empty list — a host repopulates it the same way mx-compose would,
    // through `current().mainMenu`, the same view object mx-ui itself rendered.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onCreateWorld = vi.fn()
    const onLoadWorld = vi.fn()
    const onStateChange = vi.fn()
    const runtime = makeUiMount({
      menuCallbacks: { onCreateWorld, onLoadWorld, onStateChange, onOpenSettings: () => undefined },
      root: host,
    })
    await Effect.runPromise(runtime.start)

    host.querySelector<HTMLButtonElement>('[data-menu-entry="new-world"]')?.click()
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ panel: 'new-world' }))

    host.querySelector<HTMLButtonElement>('[data-menu-action="confirm"]')?.click()
    expect(onCreateWorld).toHaveBeenCalledOnce()

    runtime.current()?.mainMenu.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS))
    host.querySelector<HTMLButtonElement>('[data-session-id="session-1"]')?.click()
    expect(onLoadWorld).toHaveBeenCalledExactlyOnceWith(SAVED_WORLDS[0])
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
      renderDistance: 20,
      uiScale: 1.25,
    })
    expect(Result.isSuccess(settings)).toBe(true)
    await Effect.runPromise(runtime.start)
    expect(runtime.current()?.root.style.getPropertyValue('zoom')).toBe('1.25')

    runtime.openSettings()
    expect(host.querySelector<HTMLInputElement>('[data-setting="fieldOfView"]')?.value).toBe('90')
    expect(host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.value).toBe('20')
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
    vi.spyOn(mounted.overlays, 'destroy').mockImplementation(() => {
      throw new Error('destroy failed')
    })

    const failure = await Effect.runPromise(Effect.flip(runtime.stop))

    expect(failure).toMatchObject({ _tag: 'UiMountError', message: 'Failed to stop mx-ui' })
    expect(failure.cause).toHaveProperty('message', 'destroy failed')
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
    expect(failure.cause).toHaveProperty('message', 'destroy failed')
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

  it('opens settings without capturing a focus target when the document reports none', async () => {
    // `document.activeElement` is typed `Element | null` — jsdom (and every real document with a
    // body) never actually hands `openSettings` a `null`, but `session-overlays.ts` still guards
    // for it since the type says a host's document could. Overriding the getter for this one test
    // is what reaches that path without weakening the real DOM assumption everywhere else.
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
