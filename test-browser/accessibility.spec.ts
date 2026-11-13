import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  FieldOfViewDegrees,
  InputAction as KernelInputAction,
  KeyCode as KernelKeyCode,
  MouseSensitivity,
  RenderDistanceChunks,
  VolumeLevel,
} from '@nerima-games/mc-kernel/domain/settings'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { fileURLToPath } from 'node:url'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { UI_SURFACE_LEDGER_ENTRIES, scenarioReference } from '../test/helpers/ui-surface-ledger'
import { openHarness } from './harness'

type BrowserErrors = { readonly console: Array<string>; readonly page: Array<string> }
const browserErrors = new WeakMap<Page, BrowserErrors>()

test.beforeEach(async ({ page }) => {
  const errors: BrowserErrors = { console: [], page: [] }
  browserErrors.set(page, errors)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.console.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.page.push(error.message))
})

test.afterEach(async ({ page }) => {
  const errors = browserErrors.get(page)
  expect(errors?.console ?? []).toHaveLength(0)
  expect(errors?.page ?? []).toHaveLength(0)
})

const pauseMenuViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/pause-menu-view.ts', import.meta.url),
)}`
const pauseMenuViewModelModule = `/@fs${fileURLToPath(
  new URL('../src/domain/pause-menu-view-model.ts', import.meta.url),
)}`
const uiMountModule = `/@fs${fileURLToPath(
  new URL('../src/application/ui-mount.ts', import.meta.url),
)}`
const achievementToastSubscriberModule = `/@fs${fileURLToPath(
  new URL('../src/application/achievement-toast-subscriber.ts', import.meta.url),
)}`
const browserEffectsModule = '/test-effects.ts'
const tabUntilFocused = async (page: Page, target: Locator, remainingTabs: number): Promise<void> => {
  if (remainingTabs <= 0) {
    return
  }
  const focused = await target.evaluate((element) => element === document.activeElement)
  if (focused) {
    return
  }
  await page.keyboard.press('Tab')
  await tabUntilFocused(page, target, remainingTabs - 1)
}
const settingsSnapshot = {
  ...DEFAULT_SETTINGS,
  difficulty: 'hard' as const,
  fovDegrees: FieldOfViewDegrees(92),
  graphicsPreset: 'high' as const,
  graphicsQuality: 'high' as const,
  keyBindings: {
    ...DEFAULT_SETTINGS.keyBindings,
    [KernelInputAction('moveForward')]: KernelKeyCode('KeyW'),
  },
  masterVolume: VolumeLevel(0.8),
  mouseSensitivity: MouseSensitivity(1),
  reducedMotion: 'reduced' as const,
  renderDistance: RenderDistanceChunks(14),
  sfxVolume: VolumeLevel(1),
  uiScale: 1.25,
}

// BEGIN W4-C accessibility coverage
test.describe('W4-C pause menu accessibility', () => {
  // Catches unnamed modal actions and focus that fails to return to the pause dialog.
  test('uses named dialogs and native keyboard controls with host-owned Escape', async ({ page }) => {
    await openHarness(page, { screen: 'crosshair' })

    await page.evaluate(
      async ({ viewPath, modelPath }) => {
        const [{ createPauseMenuView }, { pauseMenuViewModel }] = await Promise.all([
          import(viewPath) as Promise<typeof import('../src/application/pause-menu-view')>,
          import(modelPath) as Promise<typeof import('../src/domain/pause-menu-view-model')>,
        ])
        const host = document.createElement('main')
        host.setAttribute('data-pause-menu-browser-host', '')
        document.body.appendChild(host)

        const view = createPauseMenuView(document, host, {
          onHostIntent: (intent) => host.setAttribute('data-host-intent', intent.type),
          onModalStackChange: (modalStack) =>
            host.setAttribute('data-host-modal-stack', modalStack.join('/')),
        })
        view.render(pauseMenuViewModel())

        // Escape is routed by the host's single keyboard handler, not by the view.
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            view.handleEscape()
          }
        })
      },
      { viewPath: pauseMenuViewModule, modelPath: pauseMenuViewModelModule },
    )

    const host = page.locator('[data-pause-menu-browser-host]')
    const gameMenu = host.getByRole('dialog', { name: 'Game menu' })
    const resume = host.getByRole('button', { name: 'Back to Game' })
    const optionsButton = host.getByRole('button', { name: 'Options...' })
    const saveAndQuit = host.getByRole('button', { name: 'Save and Quit to Title' })
    const settingsPanel = host.locator('[data-mx-ui="pause-settings-modal"]')
    const pausePanel = host.locator('[data-mx-ui="pause-panel"]')

    await page.keyboard.press('Escape')
    await expect(host).toHaveAttribute('data-host-modal-stack', 'pause')
    await expect(gameMenu).toBeVisible()
    await expect(gameMenu).toHaveAttribute('aria-modal', 'true')
    await expect(resume).toHaveAttribute('type', 'button')
    await expect(optionsButton).toHaveAttribute('type', 'button')
    await expect(saveAndQuit).toHaveAttribute('type', 'button')
    await expect(resume).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(optionsButton).toBeFocused()
    await page.keyboard.press('Enter')

    const optionsDialog = host.getByRole('dialog', { name: 'Settings' })
    const closeButton = optionsDialog.getByRole('button', { name: 'Close' })
    await expect(host).toHaveAttribute('data-host-modal-stack', 'pause/settings')
    await expect(optionsDialog).toBeVisible()
    await expect(optionsDialog).toHaveAttribute('aria-modal', 'true')
    await expect(closeButton).toHaveAttribute('type', 'button')
    await expect(closeButton).toBeFocused()
    await expect(pausePanel).toHaveAttribute('aria-hidden', 'true')
    await expect(pausePanel).toHaveAttribute('inert', '')

    await page.keyboard.press('Escape')
    await expect(settingsPanel).toBeHidden()
    await expect(host).toHaveAttribute('data-host-modal-stack', 'pause')
    await expect(optionsButton).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(settingsPanel).toBeHidden()
    await expect(host).toHaveAttribute('data-host-modal-stack', 'pause')
    await expect(optionsButton).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(saveAndQuit).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(host).toHaveAttribute('data-host-intent', 'save-and-quit-to-title')

    await page.keyboard.press('Escape')
    await expect(gameMenu).toBeHidden()
    await expect(host).toHaveAttribute('data-host-modal-stack', '')
  })

  // Catches settings controls that lose their source labels or fail to round-trip a host snapshot.
  test('renders every settings control and reads keyboard changes back from the host', async ({ page }) => {
    await openHarness(page, { screen: 'settings', scenario: 'host-updates', panel: true })

    const host = page.locator('[data-harness-host="settings"][data-harness-scenario="host-updates"]')
    const settings = host.locator('[data-mx-ui="settings"]')
    const intentOutput = page.getByTestId('diagnostics-intents')
    const readbackSnapshot = async (): Promise<Record<string, unknown> | undefined> => {
      const output = await intentOutput.textContent()
      if (output === null || output === 'no intents emitted') {
        return undefined
      }
      const records = JSON.parse(output) as ReadonlyArray<{
        intent: { readonly _tag?: string; readonly snapshot?: Record<string, unknown> }
      }>
      return records.filter(({ intent }) => intent['_tag'] === 'SettingsReadback').at(-1)?.intent.snapshot
    }

    await expect(settings).toHaveAttribute('role', 'dialog')
    await expect(settings).toHaveAttribute('aria-modal', 'true')
    const sliderValues = [
      ['Look sensitivity', settingsSnapshot.mouseSensitivity, '0.1', '3', '0.1'],
      ['Render distance', settingsSnapshot.renderDistance, '2', '16', '1'],
      ['Master volume', settingsSnapshot.masterVolume, '0', '1', '0.01'],
      ['Music volume', settingsSnapshot.musicVolume, '0', '1', '0.01'],
      ['SFX volume', settingsSnapshot.sfxVolume, '0', '1', '0.01'],
      ['Field of view', settingsSnapshot.fovDegrees, '30', '110', '1'],
      ['UI scale', settingsSnapshot.uiScale, '0.75', '1.5', '0.05'],
    ] as const
    await Promise.all(sliderValues.map(async ([name, value, min, max, step]) => {
      const slider = settings.getByRole('slider', { name })
      await expect(slider).toHaveValue(String(value))
      await expect(slider).toHaveAttribute('min', min)
      await expect(slider).toHaveAttribute('max', max)
      await expect(slider).toHaveAttribute('step', step)
    }))
    const renderDistance = settings.getByRole('slider', { name: 'Render distance' })

    const difficultyGroup = settings.getByRole('group', { name: 'Difficulty' })
    const graphicsGroup = settings.getByRole('group', { name: 'Graphics preset' })
    const reducedMotionGroup = settings.getByRole('group', { name: 'Reduced motion' })
    const colorVisionGroup = settings.getByRole('group', { name: 'Color vision correction' })
    const languageGroup = settings.getByRole('group', { name: 'Language' })
    await Promise.all(
      [difficultyGroup, graphicsGroup, reducedMotionGroup, colorVisionGroup, languageGroup].map(async (group) => {
        await expect(group).toBeVisible()
        await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1)
      }),
    )
    await expect(difficultyGroup.getByRole('button', { name: 'Difficulty: Hard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(graphicsGroup.getByRole('button', { name: 'Graphics preset: High' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(reducedMotionGroup.getByRole('button', { name: 'Reduced motion: Reduced' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(colorVisionGroup.getByRole('button', { name: 'Color vision correction: Off' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(languageGroup.getByRole('button', { name: 'Language: English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const audioSwitch = settings.getByRole('switch', { name: 'Audio enabled' })
    const captionsSwitch = settings.getByRole('switch', { name: 'Sound captions' })
    await expect(audioSwitch).toHaveAttribute('aria-checked', String(settingsSnapshot.audioEnabled))
    await expect(captionsSwitch).toHaveAttribute('aria-checked', String(settingsSnapshot.captionsEnabled))
    await expect(audioSwitch).toHaveAttribute('data-interaction-target', 'settings-toggle')
    await expect(captionsSwitch).toHaveAttribute('data-interaction-target', 'settings-toggle')

    const sensitivity = settings.getByRole('slider', { name: 'Look sensitivity' })
    const focusableElements = page.locator('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const focusableCount = await focusableElements.count()
    await settings.getByRole('button', { name: 'Close' }).focus()
    await tabUntilFocused(page, sensitivity, focusableCount)
    await expect(sensitivity).toBeFocused()
    const previousSensitivity = await sensitivity.inputValue()
    await page.keyboard.press('ArrowRight')
    await expect(sensitivity).not.toHaveValue(previousSensitivity)
    await expect(sensitivity).toHaveValue('1.1')
    await expect.poll(async () => (await readbackSnapshot())?.['mouseSensitivity']).toBe(1.1)
    await renderDistance.focus()
    await page.keyboard.press('End')
    await expect(renderDistance).toHaveValue('16')
    await expect.poll(async () => (await readbackSnapshot())?.['renderDistance']).toBe(16)

    const normalDifficulty = difficultyGroup.getByRole('button', { name: 'Difficulty: Normal' })
    await normalDifficulty.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await readbackSnapshot())?.['difficulty']).toBe('normal')

    const moveForwardBinding = settings.locator('[data-binding-action="moveForward"]')
    const bindings = settings.locator('[data-binding-action]')
    await expect(bindings).toHaveCount(21)
    const bindingNames = await bindings.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label')),
    )
    expect(bindingNames.every((name) => name !== null && name.trim().length > 0)).toBe(true)
    await expect(moveForwardBinding).toHaveAccessibleName(/Move forward key.*W/i)
    await expect(moveForwardBinding).not.toHaveAccessibleName(/KeyW/i)
    await expect(moveForwardBinding).toHaveAttribute('type', 'button')
    await expect(moveForwardBinding).toHaveAttribute('data-interaction-target', 'settings-binding')
    await tabUntilFocused(page, moveForwardBinding, focusableCount)
    await expect(moveForwardBinding).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(intentOutput).toContainText('SettingsBindingActivated')

    await audioSwitch.focus()
    await page.keyboard.press('Space')
    await expect.poll(async () => (await readbackSnapshot())?.['audioEnabled']).toBe(!settingsSnapshot.audioEnabled)

    const uiScale = settings.getByRole('slider', { name: 'UI scale' })
    await uiScale.focus()
    await page.keyboard.press('End')
    await expect.poll(async () => (await readbackSnapshot())?.['uiScale']).toBe(Number(await uiScale.inputValue()))

    const fullMotion = reducedMotionGroup.locator('[data-setting-value="full"]')
    await fullMotion.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await readbackSnapshot())?.['reducedMotion']).toBe('full')

    const protanopia = colorVisionGroup.locator('[data-setting-value="protanopia"]')
    await protanopia.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await readbackSnapshot())?.['colorVisionCorrection']).toBe('protanopia')

    const japanese = languageGroup.getByRole('button', { name: 'Language: Japanese' })
    await japanese.focus()
    await page.keyboard.press('Enter')
    await expect(settings).toHaveAttribute('aria-label', '設定')

    const current = await readbackSnapshot()
    if (current === undefined) {
      throw new Error('Expected the settings host to return a snapshot')
    }
    const externalUpdate = { ...current, fovDegrees: 100, uiScale: 1.5 }
    await host.locator('[data-settings-host-mount]').evaluate((element, snapshot) => {
      element.dispatchEvent(new CustomEvent('settings-host-update', { detail: snapshot }))
    }, externalUpdate)
    await expect(settings.locator('[data-setting="fieldOfView"]')).toHaveValue('100')
    await expect(settings.locator('[data-setting="uiScale"]')).toHaveValue('1.5')
    await expect.poll(async () => (await readbackSnapshot())?.['fovDegrees']).toBe(100)
  })

  test('UiMount applies language, scale, color vision, and reduced motion from browser settings', async ({ page }) => {
    await openHarness(page, { screen: 'crosshair' })
    await page.evaluate(
      async ({ effectPath, mountPath, toastPath, snapshot }) => {
        const [mountModule, toastModule, browserEffects] = await Promise.all([
          import(mountPath) as Promise<typeof import('../src/application/ui-mount')>,
          import(toastPath) as Promise<typeof import('../src/application/achievement-toast-subscriber')>,
          import(effectPath) as Promise<typeof import('../apps/browser-harness/test-effects')>,
        ])
        const harnessPage = document.querySelector<HTMLElement>('[data-harness-page]')
        if (harnessPage !== null) {
          harnessPage.style.display = 'none'
        }
        const host = document.createElement('main')
        host.setAttribute('data-settings-runtime-host', '')
        const canvas = document.createElement('canvas')
        host.appendChild(canvas)
        document.body.appendChild(host)

        const runtime = mountModule.makeUiMount({
          colorVisionTarget: canvas,
          initialLanguage: 'en',
          initialSettingsSnapshot: snapshot,
          root: host,
          settingsCallbacks: {
            onLanguageChange: (language) => {
              host.setAttribute('data-host-language', language)
            },
            onSettingsChange: (settings) => {
              host.setAttribute('data-host-settings-snapshot', JSON.stringify(settings))
              const result = runtime.updateSettingsSnapshot(settings)
              host.setAttribute(
                'data-host-settings-readback',
                result !== undefined && browserEffects.Result.isSuccess(result) ? 'success' : 'failure',
              )
            },
          },
        })
        const scope = browserEffects.Scope.makeUnsafe()
        host.addEventListener('host-settings-update', (event) => {
          const result = runtime.updateSettingsSnapshot((event as CustomEvent<unknown>).detail)
          host.setAttribute(
            'data-host-update-result',
            result !== undefined && browserEffects.Result.isSuccess(result) ? 'success' : 'failure',
          )
        })
        await browserEffects.Effect.runPromise(
          runtime.start.pipe(
            browserEffects.Effect.provideService(browserEffects.Scope.Scope, scope),
            browserEffects.Effect.provide(toastModule.AchievementToastEventBusLayer),
          ),
        )
        runtime.openSettings()
        host.setAttribute('data-settings-runtime', 'ready')
      },
      {
        effectPath: browserEffectsModule,
        mountPath: uiMountModule,
        toastPath: achievementToastSubscriberModule,
        snapshot: settingsSnapshot,
      },
    )

    const host = page.locator('[data-settings-runtime-host]')
    const mountRoot = host.locator('[data-mx-ui="mount-root"]')
    const settings = mountRoot.locator('[data-mx-ui="settings"]')
    await expect(host).toHaveAttribute('data-settings-runtime', 'ready')
    await expect(settings).toBeVisible()
    await expect.poll(() => mountRoot.evaluate((element) => getComputedStyle(element).zoom)).toBe('1.25')

    const reducedMotion = settings.locator('[data-settings-field="reducedMotion"][data-setting-value="full"]')
    await reducedMotion.click()
    await expect(reducedMotion).toHaveAttribute('aria-pressed', 'true')
    const experienceTransition = mountRoot.locator('[data-mx-ui="experience-fill"]')
    await expect.poll(() => experienceTransition.evaluate((element) => (element as HTMLElement).style.transition)).toContain(
      '220ms',
    )

    await settings.locator('[data-settings-field="colorVisionCorrection"][data-setting-value="protanopia"]').click()
    await expect(host.locator('canvas')).toHaveAttribute('data-color-vision', 'protanopia')

    const uiScale = settings.locator('[data-setting="uiScale"]')
    await uiScale.focus()
    await page.keyboard.press('End')
    await expect.poll(async () => mountRoot.evaluate((element) => getComputedStyle(element).zoom)).toBe(
      await uiScale.inputValue(),
    )
    await expect(host).toHaveAttribute('data-host-settings-readback', 'success')

    await settings.locator('[data-settings-field="language"][data-setting-value="ja"]').click()
    await expect(host).toHaveAttribute('data-host-language', 'ja')
    await expect(mountRoot.locator('[data-menu-entry="settings"]')).toHaveText('設定...')

    const currentSettings = JSON.parse((await host.getAttribute('data-host-settings-snapshot')) ?? 'null') as
      | Record<string, unknown>
      | null
    if (currentSettings === null) {
      throw new Error('Expected UiMount settings callback to provide a snapshot')
    }
    await host.evaluate((element, snapshot) => {
      element.dispatchEvent(new CustomEvent('host-settings-update', { detail: snapshot }))
    }, { ...currentSettings, fovDegrees: 100, uiScale: 1.5 })
    await expect(host).toHaveAttribute('data-host-update-result', 'success')
    await expect(settings.locator('[data-setting="fieldOfView"]')).toHaveValue('100')
    await expect.poll(() => mountRoot.evaluate((element) => getComputedStyle(element).zoom)).toBe('1.5')
  })
})
// END W4-C accessibility coverage
const debugOverlayViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/debug-overlay-view.ts', import.meta.url),
)}`
const achievementToastViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/achievement-toast-view.ts', import.meta.url),
)}`

const warmViewModule = async (page: Page, modulePath: string): Promise<void> => {
  await page.goto('/')
  const response = await page.request.get(new URL(modulePath, page.url()).toString())
  expect(response.ok()).toBe(true)
}

// BEGIN D SECTION: debug overlay and achievement toast accessibility.
test.describe('D: debug overlay and achievement toast', () => {
  // Catches a debug region that loses its accessible name when data is unavailable.
  test('the F3 region names unavailable values instead of inventing zeroes', async ({ page }) => {
    await warmViewModule(page, debugOverlayViewModule)
    await openHarness(page, { screen: 'crosshair' })

    await page.evaluate(async (modulePath) => {
      const { createDebugOverlayView } = await import(modulePath)
      const host = document.createElement('main')
      host.setAttribute('data-d-accessibility-host', 'debug')
      document.body.appendChild(host)

      const view = createDebugOverlayView(document, host)
      view.update({
        cameraPose: undefined,
        dimension: undefined,
        worldTime: undefined,
        frame: undefined,
        gpuTimingSupported: undefined,
        latestGpuTimeMs: undefined,
        qualityPreset: undefined,
      })
      view.root.removeAttribute('hidden')
    }, debugOverlayViewModule)

    const region = page.getByRole('region', { name: 'Debug overlay' })
    await expect(region).toBeVisible()
    await expect(region).toContainText('FPS: None')
    await expect(region).toContainText('Coordinates: None')
    await expect(region).toContainText('Frame delta: None')
    await expect(region).not.toContainText('FPS: 0')
  })

  // Catches a toast that is not announced or steals focus from the active control.
  test('the toast announces politely and leaves keyboard focus with its owner', async ({ page }) => {
    await warmViewModule(page, achievementToastViewModule)
    await openHarness(page, { screen: 'crosshair' })

    await page.evaluate(async (modulePath) => {
      const { createAchievementToastView } = await import(modulePath)
      const host = document.createElement('main')
      host.setAttribute('data-d-accessibility-host', 'toast')
      document.body.appendChild(host)

      const focusProbe = document.createElement('button')
      focusProbe.textContent = 'Focused control'
      host.appendChild(focusProbe)
      focusProbe.focus()

      const view = createAchievementToastView(document, host)
      view.render({
        achievement: 'minecraft:story/mine_stone',
        icon: 'minecraft:wooden_pickaxe',
        player: 'player:accessibility-test',
        tick: 7,
        title: 'Stone Age',
      })

      host.setAttribute('data-d-focus-preserved', String(document.activeElement === focusProbe))
    }, achievementToastViewModule)

    const toast = page.getByRole('status')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('aria-live', 'polite')
    await expect(toast).toHaveAttribute('aria-atomic', 'true')
    await expect(toast).toContainText('Stone Age')
    await expect(page.locator('[data-d-accessibility-host="toast"]')).toHaveAttribute(
      'data-d-focus-preserved',
      'true',
    )
  })
})
// END D SECTION.

type AccessibleRole =
  | 'alert'
  | 'button'
  | 'dialog'
  | 'group'
  | 'progressbar'
  | 'region'
  | 'slider'
  | 'status'
  | 'switch'
  | 'textbox'
type RoleNameAnchor = {
  readonly role: AccessibleRole
  readonly name?: string
  readonly root?: boolean
  readonly selector?: string
}
type SurfaceAccessibilityContract = {
  readonly marker: string
  readonly anchors: ReadonlyArray<RoleNameAnchor>
}

const SURFACE_ACCESSIBILITY_CONTRACTS: Readonly<Record<string, SurfaceAccessibilityContract>> = {
  createAchievementToastView: {
    marker: 'achievement-toast',
    anchors: [{ role: 'status', root: true }],
  },
  createAnvilView: {
    marker: 'anvil',
    anchors: [
      { role: 'textbox', name: 'Item name' },
      { role: 'status', selector: 'anvil-status' },
    ],
  },
  createBrewingView: {
    marker: 'brewing',
    anchors: [
      { role: 'button', name: 'Insert selected item' },
      { role: 'button', name: 'Collect bottle' },
      { role: 'button', name: 'Drink potion' },
      { role: 'button', name: 'Close' },
      { role: 'status', selector: 'brewing-status' },
    ],
  },
  createCaptionView: { marker: 'captions', anchors: [{ role: 'status', root: true }] },
  createChatView: {
    marker: 'chat',
    anchors: [{ role: 'region', name: 'Chat', root: true }],
  },
  createChestStorageView: {
    marker: 'chest-storage',
    anchors: [
      { role: 'button', name: 'Close chest' },
      { role: 'status', name: 'Carried item' },
      { role: 'status', selector: 'chest-storage-status' },
    ],
  },
  createCrosshairView: { marker: 'crosshair', anchors: [] },
  createDebugOverlayView: {
    marker: 'debug-overlay',
    anchors: [{ role: 'region', name: 'Debug overlay', root: true }],
  },
  createEnchantingTableView: {
    marker: 'enchanting-table',
    anchors: [{ role: 'status', selector: 'enchanting-status' }],
  },
  createFurnaceView: {
    marker: 'furnace',
    anchors: [
      { role: 'progressbar', name: 'Cooking progress' },
      { role: 'progressbar', name: 'Fuel remaining' },
      { role: 'status', selector: 'furnace-status' },
    ],
  },
  createHudView: {
    marker: 'hud',
    anchors: [
      { role: 'group', name: 'Health' },
      { role: 'group', name: 'Hunger' },
      { role: 'group', name: 'Hotbar' },
    ],
  },
  createInventoryView: {
    marker: 'inventory',
    anchors: [{ role: 'status', selector: 'inventory-status' }],
  },
  createLoadingView: { marker: 'loading', anchors: [] },
  createMainMenuView: { marker: 'main-menu', anchors: [] },
  createOnboardingView: { marker: 'onboarding', anchors: [] },
  createPauseMenuView: {
    marker: 'pause-menu',
    anchors: [{ role: 'dialog', name: 'Game menu', selector: 'pause-panel' }],
  },
  createSaveIndicator: { marker: 'save-indicator', anchors: [] },
  createSessionOverlays: { marker: 'session-overlays', anchors: [] },
  createSettingsView: {
    marker: 'settings',
    anchors: [
      { role: 'slider', name: 'Look sensitivity' },
      { role: 'slider', name: 'Master volume' },
      { role: 'slider', name: 'SFX volume' },
      { role: 'slider', name: 'Field of view' },
      { role: 'slider', name: 'UI scale' },
      { role: 'group', name: 'Difficulty' },
      { role: 'group', name: 'Graphics preset' },
      { role: 'group', name: 'Reduced motion' },
      { role: 'group', name: 'Color vision correction' },
      { role: 'switch', name: 'Audio enabled' },
      { role: 'switch', name: 'Sound captions' },
    ],
  },
  createTradeView: {
    marker: 'trade',
    anchors: [
      { role: 'button', name: 'Close' },
      { role: 'status', selector: 'trade-status' },
    ],
  },
}

const applicableSurfaces = UI_SURFACE_LEDGER_ENTRIES.filter(
  ({ classification }) => classification === 'visual' || classification === 'composite',
)
const surfaceContracts = new Set(Object.keys(SURFACE_ACCESSIBILITY_CONTRACTS))
const applicableSurfaceIds = new Set(applicableSurfaces.map(({ surfaceId }) => surfaceId))
const missingSurfaceContracts = [...applicableSurfaceIds].filter((surfaceId) => !surfaceContracts.has(surfaceId))
const orphanedSurfaceContracts = [...surfaceContracts].filter((surfaceId) => !applicableSurfaceIds.has(surfaceId))
if (missingSurfaceContracts.length > 0 || orphanedSurfaceContracts.length > 0) {
  throw new Error(
    `accessibility: surface contract mismatch; missing=${missingSurfaceContracts.join(',')}; orphaned=${orphanedSurfaceContracts.join(',')}`,
  )
}

const registryByReference = new Map(
  SCENARIO_REGISTRY.map((scenario) => [scenarioReference(scenario.screen, scenario.id), scenario]),
)
const accessibilityCases = applicableSurfaces.flatMap(({ surfaceId, scenarioIds }) =>
  scenarioIds.map((reference) => {
    const scenario = registryByReference.get(reference)
    if (scenario === undefined) {
      if (surfaceId === 'createSessionOverlays') {
        return { surfaceId, reference, scenario: undefined }
      }
      throw new Error(`accessibility: ${surfaceId} references unregistered scenario ${reference}`)
    }
    return { surfaceId, reference, scenario }
  }),
)
if (accessibilityCases.length === 0) {
  throw new Error('accessibility: the ledger selected no visual or composite scenarios')
}

const browserAccessibilityAudit = (
  root: HTMLElement,
  ignoredMarkers: ReadonlyArray<string>,
): Array<string> => {
  const validRoles = new Set([
    'alert', 'button', 'checkbox', 'combobox', 'dialog', 'group', 'img', 'list', 'listitem', 'main',
    'log', 'menu', 'menuitem', 'note', 'option', 'progressbar', 'radio', 'radiogroup', 'region', 'slider',
    'status', 'switch', 'tab', 'tabpanel', 'textbox',
  ])
  const namedRoles = new Set(['button', 'checkbox', 'combobox', 'radio', 'slider', 'switch', 'tab', 'textbox'])
  const candidates = [
    ...(root.matches('button, input:not([type="hidden"]), select, textarea, [role], [tabindex]:not([tabindex="-1"])')
      ? [root]
      : []),
    ...root.querySelectorAll<HTMLElement>(
      'button, input:not([type="hidden"]), select, textarea, [role], [tabindex]:not([tabindex="-1"])',
    ),
  ]

  const elementRole = (element: HTMLElement): string | undefined => {
    const explicit = element.getAttribute('role')?.trim()
    const tag = element.tagName.toLowerCase()
    const native = tag === 'button'
      ? 'button'
      : tag === 'select'
        ? 'combobox'
        : tag === 'textarea'
          ? 'textbox'
          : tag === 'input'
            ? element.getAttribute('type') === 'range'
              ? 'slider'
              : 'textbox'
            : undefined
    return explicit ?? native
  }

  const accessibleName = (element: HTMLElement): string => {
    const labelledBy = element.getAttribute('aria-labelledby')
      ?.split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter((label) => label !== '')
      .join(' ')
    const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
      ? Array.from(element.labels ?? []).map((label) => label.textContent?.trim() ?? '').join(' ')
      : ''
    return element.getAttribute('aria-label')?.trim() || labelledBy || labels || element.textContent?.trim() || ''
  }

  const stateIssues = (element: HTMLElement, role: string | undefined, identity: string): Array<string> => {
    const booleanStates = ['aria-checked', 'aria-disabled', 'aria-expanded', 'aria-hidden', 'aria-modal', 'aria-selected']
    const issues = booleanStates.flatMap((state) => {
      const value = element.getAttribute(state)
      return value !== null && value !== 'true' && value !== 'false' ? [`${identity}: invalid ${state}=${value}`] : []
    })
    const pressed = element.getAttribute('aria-pressed')
    if (pressed !== null && pressed !== 'true' && pressed !== 'false' && pressed !== 'mixed') {
      issues.push(`${identity}: invalid aria-pressed=${pressed}`)
    }
    if (role === 'switch' && element.getAttribute('aria-checked') === null) {
      issues.push(`${identity}: switch has no checked state`)
    }
    if (role === 'progressbar') {
      const values = ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map((name) => element.getAttribute(name))
      const parsedValues = values.map((value) => value === null ? Number.NaN : Number(value))
      const minimum = parsedValues[0] ?? Number.NaN
      const maximum = parsedValues[1] ?? Number.NaN
      const current = parsedValues[2] ?? Number.NaN
      if (values.some((value) => value === null) || !Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(current) || current < minimum || current > maximum) {
        issues.push(`${identity}: progress value is missing or outside its declared range`)
      }
    }
    if (element instanceof HTMLButtonElement && element.hasAttribute('aria-disabled')) {
      const ariaDisabled = element.getAttribute('aria-disabled') === 'true'
      if (ariaDisabled !== element.disabled) {
        issues.push(`${identity}: aria-disabled disagrees with the native disabled state`)
      }
    }
    return issues
  }

  const elementIssues = (element: HTMLElement): Array<string> => {
    const identity = element.getAttribute('data-mx-ui') ?? element.tagName.toLowerCase()
    const explicitRole = element.getAttribute('role')?.trim()
    const role = elementRole(element)
    const issues = role === undefined
      ? [`${identity}: missing role`]
      : explicitRole !== undefined && !validRoles.has(explicitRole)
        ? [`${identity}: unknown role ${explicitRole}`]
        : []
    const needsName = element.matches('button, input:not([type="hidden"]), select, textarea') || namedRoles.has(role ?? '')
    if (needsName && accessibleName(element) === '') {
      issues.push(`${identity}: missing accessible name`)
    }
    return [...issues, ...stateIssues(element, role, identity)]
  }

  return candidates
    .filter((element) =>
      element.closest('[hidden], [aria-hidden="true"]') === null &&
      !ignoredMarkers.includes(element.getAttribute('data-mx-ui') ?? ''),
    )
    .flatMap(elementIssues)
}

const auditRenderedSemantics = (
  surface: Locator,
  ignoredMarkers: ReadonlyArray<string> = [],
): Promise<ReadonlyArray<string>> => surface.evaluate(browserAccessibilityAudit, ignoredMarkers)

const assertCrosshairState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const mark = surface.locator('[data-mx-ui="crosshair-mark"]')
  const progress = surface.locator('[data-mx-ui="crosshair-progress"]')
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  if (scenarioId.includes('progress')) {
    await Promise.all([
      expect(progress).toHaveAttribute('role', 'progressbar'),
      expect(progress).toHaveAttribute('aria-label', 'Block breaking progress'),
      expect(progress).toHaveAttribute('aria-valuemin', '0'),
      expect(progress).toHaveAttribute('aria-valuemax', '100'),
    ])
  } else {
    await expect(progress).toHaveAttribute('hidden', '')
  }
}

const assertEnchantingState = async (surface: Locator): Promise<void> => {
  const offers = surface.locator('[data-mx-ui="enchanting-offer"]')
  await expect(offers).toHaveCount(3)
  await Promise.all((await offers.all()).map(async (offer) => {
    await expect(offer).toHaveAttribute('type', 'button')
    await expect(offer).toHaveAttribute('aria-label', /.+/u)
    const state = await offer.evaluate((element) => ({
      ariaDisabled: element.getAttribute('aria-disabled'),
      disabled: (element as HTMLButtonElement).disabled,
    }))
    expect(state.ariaDisabled).toBe(String(state.disabled))
  }))
}

const assertBrewingState = async (surface: Locator): Promise<void> => {
  const controls = ['Insert selected item', 'Collect bottle', 'Drink potion', 'Close']
  await Promise.all(controls.map(async (name) => {
    const button = surface.getByRole('button', { name, exact: true })
    await expect(button).toHaveAttribute('type', 'button')
    await expect(button).toBeEnabled()
  }))
  const status = surface.locator('[data-mx-ui="brewing-status"]')
  await Promise.all([
    expect(status).toHaveAttribute('role', 'status'),
    expect(status).toHaveAttribute('aria-live', 'polite'),
    expect(status).toHaveAttribute('aria-atomic', 'true'),
  ])
}

const assertAnvilState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const slots = surface.locator('[data-anvil-slot]')
  await expect(slots).toHaveCount(3)
  await Promise.all((await slots.all()).map(async (slot) => {
    await expect(slot).toHaveAttribute('role', 'button')
    await expect(slot).toHaveAttribute('aria-label', /^Anvil .+, .+/u)
    await expect(slot).toHaveAttribute('aria-disabled', 'false')
  }))
  await Promise.all([
    expect(surface.locator('[data-anvil-slot="primary-input"]')).toHaveAttribute('tabindex', '0'),
    expect(surface.locator('[data-anvil-slot="secondary-input"]')).toHaveAttribute('tabindex', '-1'),
    expect(surface.locator('[data-anvil-slot="output"]')).toHaveAttribute('tabindex', '-1'),
    expect(surface.getByRole('textbox', { name: 'Item name' })).toHaveAttribute('tabindex', '-1'),
  ])
  const status = surface.locator('[data-mx-ui="anvil-status"]')
  const rejection = surface.locator('[data-mx-ui="anvil-rejection"]')
  await Promise.all([
    expect(status).toHaveAttribute('role', 'status'),
    expect(status).toHaveAttribute('aria-live', 'polite'),
    expect(status).toHaveAttribute('aria-atomic', 'true'),
    expect(rejection)[scenarioId === 'rejected-too-expensive' ? 'toBeVisible' : 'toBeHidden'](),
  ])
  if (scenarioId === 'rejected-too-expensive') {
    await expect(rejection).toContainText('Too expensive')
    await expect(rejection).toHaveAttribute('role', 'alert')
  }
}

const TRADE_ACCESSIBILITY_EXPECTATIONS: Readonly<Record<
  string,
  ReadonlyArray<{ readonly label: string; readonly disabled: boolean }>
>> = {
  'no-offers': [],
  available: [{ label: '20 minecraft:wheat → 1 minecraft:emerald (2/16)', disabled: false }],
  unavailable: [{ label: '26 minecraft:potato → 1 minecraft:emerald (3/16)', disabled: true }],
  'different-profession': [{ label: '4 minecraft:iron_ingot → 1 minecraft:emerald (0/12)', disabled: false }],
  'out-of-stock': [{ label: '22 minecraft:carrot → 1 minecraft:emerald (12/12)', disabled: true }],
  'multiple-offers': [
    { label: '4 minecraft:iron_ingot → 1 minecraft:emerald (0/12)', disabled: false },
    { label: '36 minecraft:emerald → 1 minecraft:bell (1/12)', disabled: false },
    { label: '20 minecraft:emerald → 1 minecraft:iron_pickaxe (12/12)', disabled: true },
  ],
  'quantity-boundaries': [
    { label: '0 minecraft:wheat → 1 minecraft:emerald (0/1)', disabled: false },
    { label: '1 minecraft:wheat → 1 minecraft:emerald (1/1)', disabled: false },
    { label: '64 minecraft:wheat → 64 minecraft:emerald (64/64)', disabled: false },
    { label: '99 minecraft:wheat → 1 minecraft:emerald (99/99)', disabled: false },
    { label: '100 minecraft:wheat → 1 minecraft:emerald (100/100)', disabled: false },
  ],
  'status-text-boundaries': [{ label: '1 minecraft:wheat → 1 minecraft:emerald (0/1)', disabled: false }],
}

const assertTradeState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const expectedOffers = TRADE_ACCESSIBILITY_EXPECTATIONS[scenarioId]
  if (expectedOffers === undefined) {
    throw new Error(`accessibility: missing trade state contract for ${scenarioId}`)
  }
  const offers = surface.locator('[data-mx-ui="trade-offer"]')
  await expect(offers).toHaveCount(expectedOffers.length)
  await Promise.all(expectedOffers.map(async ({ disabled, label }) => {
    const offer = surface.getByRole('button', { name: label, exact: true })
    await expect(offer).toHaveCount(1)
    await expect(offer)[disabled ? 'toBeDisabled' : 'toBeEnabled']()
  }))
  const status = surface.locator('[data-mx-ui="trade-status"]')
  await Promise.all([
    expect(status).toHaveAttribute('role', 'status'),
    expect(status).toHaveAttribute('aria-live', 'polite'),
    expect(status).toHaveAttribute('aria-atomic', 'true'),
  ])
}

const assertHudState = async (scenarioId: string, surface: Locator): Promise<void> => {
  await expect(surface.getByRole('group', { name: 'Health' })).toHaveCount(1)
  await expect(surface.getByRole('group', { name: 'Hunger' })).toHaveCount(1)
  await expect(surface.getByRole('group', { name: 'Hotbar' })).toHaveCount(1)
  if (scenarioId === 'hud-full-selected-hotbar') {
    await expect(surface.locator('[data-mx-ui="slot"][data-selected]')).toHaveCount(1)
  }
}

const assertLoadingState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const preparing = surface.locator('[data-mx-ui="loading-state"][data-loading-state="preparing"]')
  const failed = surface.locator('[data-mx-ui="loading-state"][data-loading-state="failed"]')
  await Promise.all([
    expect(preparing).toHaveAttribute('role', 'group'),
    expect(preparing).toHaveAttribute('aria-label', 'Preparing your world'),
    expect(failed).toHaveAttribute('role', 'group'),
    expect(failed).toHaveAttribute('aria-label', 'We could not build this world'),
  ])
  await expect(failed)[scenarioId.includes('failed') ? 'toBeVisible' : 'toBeHidden']()
}

const assertMainMenuState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const panelName = scenarioId.startsWith('new-world-')
    ? 'Create new world'
    : scenarioId.startsWith('load-world-')
      ? 'Select world'
      : 'Main menu'
  await expect(surface.getByRole('group', { name: panelName })).toHaveCount(1)
  if (scenarioId.includes('new-world')) {
    const expectedMode = scenarioId.includes('creative') ? 'Creative' : 'Survival'
    const mode = surface.locator('[data-mx-ui="menu-game-mode"]')
    await Promise.all([
      expect(mode).toHaveAttribute('aria-label', `Game mode: ${expectedMode}`),
      expect(mode).toHaveText(expectedMode),
      expect(surface.getByRole('button', { name: `Game mode: ${expectedMode}`, exact: true })).toHaveCount(1),
    ])
  }
}

const assertOnboardingState = async (scenarioId: string, surface: Locator): Promise<void> => {
  await Promise.all([
    expect(surface).toHaveAttribute('role', 'region'),
    expect(surface).toHaveAttribute('aria-label', 'Quick Controls onboarding'),
  ])
  await expect(surface)[scenarioId === 'open' ? 'toBeVisible' : 'toBeHidden']()
}

const assertPauseState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const dialog = surface.locator('[data-mx-ui="pause-panel"]')
  const settings = surface.locator('[data-mx-ui="pause-settings-modal"]')
  const settingsAreOnTop = scenarioId === 'pause-settings-stack'
  const pauseAttributes = await dialog.evaluate((element) => ({
    ariaHidden: element.getAttribute('aria-hidden'),
    ariaModal: element.getAttribute('aria-modal'),
    inert: element.hasAttribute('inert'),
  }))
  expect(pauseAttributes).toStrictEqual(settingsAreOnTop
    ? { ariaHidden: 'true', ariaModal: null, inert: true }
    : { ariaHidden: null, ariaModal: 'true', inert: false })
  await Promise.all([
    expect(dialog).toHaveAttribute('role', 'dialog'),
    expect(dialog).toHaveAttribute('aria-label', 'Game menu'),
  ])
  if (settingsAreOnTop) {
    const settingsDialog = surface.getByRole('dialog', { name: 'Settings' })
    await Promise.all([
      expect(settingsDialog).toHaveAttribute('aria-modal', 'true'),
      expect(settingsDialog.getByRole('button', { name: 'Close' })).toHaveAttribute('type', 'button'),
    ])
  } else {
    await expect(settings).toHaveAttribute('hidden', '')
    await expect(surface.getByRole('button', { name: 'Back to Game' })).toHaveAttribute('type', 'button')
  }
}

const assertToastState = async (surface: Locator): Promise<void> => {
  await Promise.all([
    expect(surface).toHaveAttribute('role', 'status'),
    expect(surface).toHaveAttribute('aria-live', 'polite'),
    expect(surface).toHaveAttribute('aria-atomic', 'true'),
  ])
}

const assertCaptionState = async (surface: Locator): Promise<void> => {
  await Promise.all([
    expect(surface).toHaveAttribute('role', 'status'),
    expect(surface).toHaveAttribute('aria-live', 'polite'),
  ])
}

const assertInventoryState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const status = surface.locator('[data-mx-ui="inventory-status"]')
  await Promise.all([
    expect(status).toHaveAttribute('role', 'status'),
    expect(status).toHaveAttribute('aria-live', 'polite'),
    expect(status).toHaveAttribute('aria-atomic', 'true'),
  ])
  const carried = surface.locator('[data-mx-ui="carried"]')
  if (scenarioId === 'cursor-stack') {
    await Promise.all([
      expect(carried).toHaveAttribute('role', 'status'),
      expect(carried).toHaveAttribute('aria-live', 'polite'),
      expect(carried).toHaveAttribute('aria-label', 'Carried item, stone, 64'),
    ])
  } else if (scenarioId === 'accessibility-name-role-state') {
    const hotbarSlot = surface.getByRole('button', { name: 'Hotbar slot 1, stone, 64', exact: true })
    const craftingOutput = surface.getByRole('button', {
      name: 'Crafting output, no matching recipe',
      exact: true,
    })
    await Promise.all([
      expect(carried).toHaveAttribute('role', 'status'),
      expect(carried).toHaveAttribute('aria-live', 'polite'),
      expect(carried).toHaveAttribute('aria-label', 'Carried item, stone, 12'),
      expect(hotbarSlot).toHaveAttribute('aria-disabled', 'false'),
      expect(hotbarSlot).toHaveAttribute('tabindex', '0'),
      expect(craftingOutput).toHaveAttribute('aria-disabled', 'true'),
      expect(craftingOutput).toHaveAttribute('tabindex', '-1'),
    ])
  } else {
    await expect(carried).toHaveAttribute('hidden', '')
  }
}

const assertSaveIndicatorState = async (surface: Locator): Promise<void> => {
  await Promise.all([
    expect(surface).toHaveAttribute('role', 'status'),
    expect(surface).toHaveAttribute('aria-live', 'polite'),
  ])
}

const assertSessionOverlayState = async (scenarioId: string, surface: Locator): Promise<void> => {
  const settingsOpen = scenarioId === 'factory-settings-open' || scenarioId === 'factory-settings-debug-open'
  const debugOpen = scenarioId === 'factory-debug-hud-open' || scenarioId === 'factory-settings-debug-open'
  const settings = surface.locator('[data-mx-ui="settings"]')
  const debug = surface.locator('[data-mx-ui="debug-hud"]')
  const [settingsVisible, debugVisible] = await Promise.all([settings.isVisible(), debug.isVisible()])
  await Promise.all([
    expect(settings).toHaveAttribute('role', 'dialog'),
    expect(settings).toHaveAttribute('aria-label', 'Settings'),
    expect(settings).toHaveAttribute('aria-modal', 'true'),
    expect(debug).toHaveAttribute('role', 'region'),
    expect(debug).toHaveAttribute('aria-label', 'Debug information'),
  ])
  expect(settingsVisible).toBe(settingsOpen)
  expect(debugVisible).toBe(debugOpen)
}

const assertSettingsState = async (surface: Locator): Promise<void> => {
  const choices = ['Difficulty', 'Graphics preset', 'Reduced motion', 'Color vision correction']
  await Promise.all(choices.map(async (name) => {
    const group = surface.getByRole('group', { name })
    await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1)
  }))
  await Promise.all([
    expect(surface.getByRole('switch', { name: 'Audio enabled' })).toHaveAttribute(
      'aria-checked',
      String(DEFAULT_SETTINGS.audioEnabled),
    ),
    expect(surface.getByRole('switch', { name: 'Sound captions' })).toHaveAttribute(
      'aria-checked',
      String(DEFAULT_SETTINGS.captionsEnabled),
    ),
  ])
}

const assertScenarioState = async (
  surfaceId: string,
  scenarioId: string,
  surface: Locator,
): Promise<void> => {
  switch (surfaceId) {
    case 'createAnvilView': return assertAnvilState(scenarioId, surface)
    case 'createAchievementToastView': return assertToastState(surface)
    case 'createBrewingView': return assertBrewingState(surface)
    case 'createCrosshairView': return assertCrosshairState(scenarioId, surface)
    case 'createCaptionView': return assertCaptionState(surface)
    case 'createDebugOverlayView':
      return Promise.all([
        expect(surface).toHaveAttribute('aria-label', 'Debug overlay'),
        expect(surface).toHaveAttribute('role', 'region'),
      ]).then(() => undefined)
    case 'createEnchantingTableView': return assertEnchantingState(surface)
    case 'createHudView': return assertHudState(scenarioId, surface)
    case 'createInventoryView': return assertInventoryState(scenarioId, surface)
    case 'createLoadingView': return assertLoadingState(scenarioId, surface)
    case 'createMainMenuView': return assertMainMenuState(scenarioId, surface)
    case 'createOnboardingView': return assertOnboardingState(scenarioId, surface)
    case 'createPauseMenuView': return assertPauseState(scenarioId, surface)
    case 'createSaveIndicator': return assertSaveIndicatorState(surface)
    case 'createSessionOverlays': return assertSessionOverlayState(scenarioId, surface)
    case 'createSettingsView': return assertSettingsState(surface)
    case 'createTradeView': return assertTradeState(scenarioId, surface)
    default: return Promise.resolve()
  }
}

test.describe('T06 ledger-driven surface accessibility', () => {
  test.describe.configure({ mode: 'parallel' })

  accessibilityCases.forEach(({ surfaceId, reference, scenario }) => {
    if (scenario === undefined) {
      // Catches a composite ledger surface silently losing its pending scenario coverage.
      test(`${surfaceId}: ${reference} is waiting for a registered scenario`, () => {
        test.skip(true, `${surfaceId} scenario ${reference} is not registered`)
      })
      return
    }

    const contract = SURFACE_ACCESSIBILITY_CONTRACTS[surfaceId]
    if (contract === undefined) {
      throw new Error(`accessibility: missing contract for ${surfaceId}`)
    }
    // Catches a registered scenario dropping its source-derived role, name, or applicable state.
    test(`${surfaceId}: ${reference}`, async ({ page }) => {
      await openHarness(page, {
        panel: true,
        scenario: scenario.id,
        screen: scenario.screen,
      })
      const host = page.locator(
        `[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`,
      )
      const surface = host.locator(`[data-mx-ui="${contract.marker}"]`)
      await expect(surface).toHaveCount(1)

      await Promise.all(contract.anchors.map(async (anchor) => {
        const locator = anchor.root
          ? surface
          : anchor.selector !== undefined
            ? surface.locator(`[data-mx-ui="${anchor.selector}"]`)
            : anchor.name === undefined
              ? surface.getByRole(anchor.role)
              : surface.getByRole(anchor.role, { name: anchor.name })
        await expect(
          locator,
          `${reference}: expected ${anchor.role}${anchor.name ? ` named ${anchor.name}` : ''}`,
        ).toHaveCount(1)
        if (anchor.root === true || anchor.selector !== undefined) {
          await expect(locator).toHaveAttribute('role', anchor.role)
        }
        if ((anchor.root === true || anchor.selector !== undefined) && anchor.name !== undefined) {
          await expect(locator).toHaveAttribute('aria-label', anchor.name)
        }
      }))
      await assertScenarioState(surfaceId, scenario.id, surface)
      const ignoredMarkers = surfaceId === 'createHudView' ? ['slot'] : []
      const issues = await auditRenderedSemantics(surface, ignoredMarkers)
      expect(issues, `${reference}: ${issues.join('; ')}`).toStrictEqual([])
    })
  })

  // Catches a focusable selected slot missing an accessible role, name, or state; source does not define a button role.
  test('HUD selected hotbar slot exposes role, name, and selected state', async ({ page }) => {
    await openHarness(page, { panel: true, scenario: 'hud-full-selected-hotbar', screen: 'hud' })
    const hotbar = page.locator(
      '[data-harness-host="hud"][data-harness-scenario="hud-full-selected-hotbar"] [data-mx-ui="hotbar-radio-group"]',
    )
    const selected = hotbar.getByRole('radio', { checked: true })
    const unselected = hotbar.getByRole('radio', { checked: false })
    await expect(selected).toHaveCount(1)
    await expect(unselected).toHaveCount(8)
    await expect(selected).toHaveAttribute('role', 'radio')
    await expect(selected).toHaveAttribute('aria-label', /\S/)
    await expect(selected).toHaveAttribute('aria-checked', 'true')
    await expect(selected).toHaveAttribute('data-selected', '')
    await expect(selected).toHaveAttribute('tabindex', '0')
    const allUnselectedAreUnchecked = await unselected.evaluateAll((elements) =>
      elements.every((element) => element.getAttribute('aria-checked') === 'false'),
    )
    expect(allUnselectedAreUnchecked).toBe(true)
    const errors = browserErrors.get(page)
    expect(errors?.console ?? []).toHaveLength(0)
    expect(errors?.page ?? []).toHaveLength(0)
  })

  // Catches keyboard focus that falls to body or moves opposite the rendered panel order.
  test('debug panel and UI surface share a visible, visually ordered Tab sequence', async ({ page }) => {
    await openHarness(page, { panel: true, scenario: 'default', screen: 'main-menu' })
    const stage = page.locator('[data-harness-stage]')
    const panel = page.locator('[data-debug-panel]')
    const stageControls = stage.locator('button:visible, input:visible, select:visible, textarea:visible')
    const panelControls = panel.locator('button:visible, input:visible, select:visible, textarea:visible')
    await expect(stageControls).not.toHaveCount(0)
    await expect(panelControls).not.toHaveCount(0)

    const lastSurfaceControl = stageControls.last()
    const firstPanelControl = panelControls.first()
    const body = page.locator('body')
    const positions = await Promise.all([
      lastSurfaceControl.boundingBox(),
      firstPanelControl.boundingBox(),
      stage.boundingBox(),
      panel.boundingBox(),
    ])
    const [surfaceBox, panelControlBox, stageBox, panelBox] = positions
    expect(surfaceBox).not.toBeNull()
    expect(panelControlBox).not.toBeNull()
    expect(stageBox).not.toBeNull()
    expect(panelBox).not.toBeNull()
    expect((stageBox?.x ?? Number.POSITIVE_INFINITY) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(panelBox?.x ?? -1)
    expect(surfaceBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(panelControlBox?.x ?? -1)

    await lastSurfaceControl.focus()
    await page.keyboard.press('Tab')
    await expect(firstPanelControl).toBeFocused()
    await expect(body).not.toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(lastSurfaceControl).toBeFocused()
    await expect(body).not.toBeFocused()
  })
})
