import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { InputAction } from '@nerima-games/mc-kernel/domain/settings'
import { Result } from 'effect'
import { fileURLToPath } from 'node:url'
import { furnaceViewModel } from '../src/domain/furnace-view-model'
import { onboardingViewModel } from '../src/domain/onboarding-view-model'
import { settingsViewModel, type SettingsViewModel } from '../src/domain/settings-view-model'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from '../test/fixtures/settings-input'
import { openHarness } from './harness'

const debugOverlayViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/debug-overlay-view.ts', import.meta.url),
)}`
const achievementToastViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/achievement-toast-view.ts', import.meta.url),
)}`
const pauseMenuViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/pause-menu-view.ts', import.meta.url),
)}`
const pauseMenuViewModelModule = `/@fs${fileURLToPath(
  new URL('../src/domain/pause-menu-view-model.ts', import.meta.url),
)}`
const settingsViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/settings-view.ts', import.meta.url),
)}`
const furnaceViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/furnace-view.ts', import.meta.url),
)}`
const onboardingViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/onboarding-view.ts', import.meta.url),
)}`

const warmViewModule = async (page: Page, modulePath: string): Promise<void> => {
  await page.goto('/')
  const response = await page.request.get(new URL(modulePath, page.url()).toString())
  expect(response.ok()).toBe(true)
}

const warmViewModules = async (page: Page, modulePaths: ReadonlyArray<string>): Promise<void> => {
  await page.goto('/')
  await Promise.all(
    modulePaths.map(async (modulePath) => {
      const response = await page.request.get(new URL(modulePath, page.url()).toString())
      expect(response.ok()).toBe(true)
    }),
  )
}

const isolateHarnessScreen = async (page: Page, name: 'main-menu' | 'inventory'): Promise<void> => {
  await page.evaluate((screenName) => {
    let foundTarget = false
    for (const host of document.querySelectorAll<HTMLElement>('[data-harness-host]')) {
      if (host.getAttribute('data-harness-host') === screenName) {
        host.removeAttribute('hidden')
        foundTarget = true
      } else {
        host.setAttribute('hidden', '')
      }
    }
    if (!foundTarget) {
      throw new Error(`Expected the ${screenName} harness fixture`)
    }
  }, name)
}

const settingsBaselineSnapshot = {
  ...DEFAULT_SETTINGS,
  difficulty: 'normal' as const,
  fovDegrees: 92,
  graphicsPreset: 'high' as const,
  graphicsQuality: 'high' as const,
  keyBindings: { ...DEFAULT_SETTINGS.keyBindings, moveForward: 'KeyW' },
  masterVolume: 0.8,
  mouseSensitivity: 1,
  reducedMotion: 'reduced' as const,
  sfxVolume: 1,
  uiScale: 1.25,
}
const settingsBaselineResult = settingsViewModel(
  settingsBaselineSnapshot,
  TEST_DEFAULT_BINDINGS,
  TEST_BINDABLE_ACTIONS,
)
if (!Result.isSuccess(settingsBaselineResult)) {
  throw new Error('Expected a valid settings baseline fixture')
}
const SETTINGS_BASELINE_MODEL: SettingsViewModel = settingsBaselineResult.success

const FURNACE_BASELINE_MODEL = furnaceViewModel({
  burnProgress: 0.4,
  cookProgress: 0.65,
  fuel: { count: 4, itemId: 'minecraft:coal' },
  input: { count: 2, itemId: 'minecraft:iron_ore' },
  output: { count: 2, itemId: 'minecraft:iron_ingot' },
})

const ONBOARDING_BASELINE_MODEL = onboardingViewModel({
  firstRun: true,
  quickControlsDismissed: false,
  quickControls: [
    { action: InputAction('openInventory'), keys: TEST_DEFAULT_BINDINGS.openInventory },
    { action: InputAction('jump'), keys: TEST_DEFAULT_BINDINGS.jump },
    { action: InputAction('openChat'), keys: TEST_DEFAULT_BINDINGS.openChat },
  ],
})

const mountDebugFixture = async (page: Page, populated: boolean): Promise<void> => {
  await warmViewModule(page, debugOverlayViewModule)
  await openHarness(page, { screen: 'crosshair' })
  await page.evaluate(
    async ({ modulePath, populatedFixture }) => {
      const { createDebugOverlayView } = await import(modulePath)
      const host = document.createElement('main')
      host.setAttribute('data-d-baseline', populatedFixture ? 'f3-public-snapshot' : 'f3-unavailable')
      host.style.setProperty('box-sizing', 'border-box')
      host.style.setProperty('width', '480px')
      host.style.setProperty('padding', '20px')
      host.style.setProperty('background-color', '#161b22')
      host.style.setProperty('color', '#f0f3f6')
      host.style.setProperty('font-family', 'ui-monospace, monospace')
      host.style.setProperty('font-size', '16px')
      host.style.setProperty('line-height', '1.5')
      document.body.appendChild(host)

      const view = createDebugOverlayView(document, host)
      view.update(
        populatedFixture
          ? {
              cameraPose: {
                position: { worldX: 12.5, worldY: 70, worldZ: -8.25 },
                yawRadians: 0.5,
                pitchRadians: -0.25,
                capturedAtSecs: 2.5,
              },
              dimension: 'overworld',
              worldTime: { ticks: 2400, dayLengthTicks: 24000 },
              frame: {
                elapsedSecs: 12.5,
                deltaSecs: 1 / 60,
                cameraPosition: { worldX: 12.5, worldY: 70, worldZ: -8.25 },
                dimension: 'overworld',
              },
              gpuTimingSupported: true,
              latestGpuTimeMs: 3.1,
              qualityPreset: 'high',
            }
          : {
              cameraPose: undefined,
              dimension: undefined,
              worldTime: undefined,
              frame: undefined,
              gpuTimingSupported: undefined,
              latestGpuTimeMs: undefined,
              qualityPreset: undefined,
            },
      )
      view.root.removeAttribute('hidden')
    },
    { modulePath: debugOverlayViewModule, populatedFixture: populated },
  )
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

const mountAchievementToastFixture = async (page: Page): Promise<void> => {
  await warmViewModule(page, achievementToastViewModule)
  await openHarness(page, { screen: 'crosshair' })
  await page.evaluate(async (modulePath) => {
    const { createAchievementToastView } = await import(modulePath)
    const host = document.createElement('main')
    host.setAttribute('data-d-baseline', 'achievement-toast-unlocked')
    host.style.setProperty('box-sizing', 'border-box')
    host.style.setProperty('width', '480px')
    host.style.setProperty('padding', '20px')
    host.style.setProperty('background-color', '#161b22')
    host.style.setProperty('color', '#f0f3f6')
    host.style.setProperty('font-family', 'ui-monospace, monospace')
    host.style.setProperty('font-size', '16px')
    host.style.setProperty('line-height', '1.5')
    document.body.appendChild(host)

    const view = createAchievementToastView(document, host)
    view.render({
      achievement: 'minecraft:story/mine_stone',
      icon: 'minecraft:wooden_pickaxe',
      player: 'player:baseline-test',
      tick: 7,
      title: 'Stone Age',
    })
  }, achievementToastViewModule)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

test.describe('D: exact debug overlay and achievement toast baselines', () => {
  test('F3 unavailable snapshot', async ({ page }) => {
    await mountDebugFixture(page, false)
    await expect(page.locator('[data-d-baseline="f3-unavailable"]')).toHaveScreenshot(
      'f3-unavailable.png',
      { maxDiffPixels: 0, threshold: 0 },
    )
  })

  test('F3 public snapshot', async ({ page }) => {
    await mountDebugFixture(page, true)
    await expect(page.locator('[data-d-baseline="f3-public-snapshot"]')).toHaveScreenshot(
      'f3-public-snapshot.png',
      { maxDiffPixels: 0, threshold: 0 },
    )
  })

  test('achievement toast unlocked', async ({ page }) => {
    await mountAchievementToastFixture(page)
    await expect(page.locator('[data-d-baseline="achievement-toast-unlocked"]')).toHaveScreenshot(
      'achievement-toast-unlocked.png',
      { maxDiffPixels: 0, threshold: 0 },
    )
  })
})

test.describe('exact screen baselines', () => {
  test('main menu', async ({ page }) => {
    await openHarness(page)
    await isolateHarnessScreen(page, 'main-menu')
    await expect(page.locator('[data-harness-host="main-menu"]')).toHaveScreenshot('main-menu.png', {
      maxDiffPixels: 0,
      threshold: 0,
    })
  })

  test('pause menu with settings open', async ({ page }) => {
    await warmViewModules(page, [pauseMenuViewModule, pauseMenuViewModelModule, settingsViewModule])
    await openHarness(page, { screen: 'crosshair' })
    await page.evaluate(
      async ({ pausePath, pauseModelPath, settingsPath, model }) => {
        const [{ createPauseMenuView }, { pauseMenuViewModel }, { createSettingsView }] = await Promise.all([
          import(pausePath) as Promise<typeof import('../src/application/pause-menu-view')>,
          import(pauseModelPath) as Promise<
            typeof import('../src/domain/pause-menu-view-model')
          >,
          import(settingsPath) as Promise<typeof import('../src/application/settings-view')>,
        ])
        const host = document.createElement('main')
        host.setAttribute('data-d-baseline', 'pause-settings')
        host.style.setProperty('box-sizing', 'border-box')
        host.style.setProperty('width', '840px')
        host.style.setProperty('margin', '0 auto')
        host.style.setProperty('padding', '24px')
        host.style.setProperty('background-color', '#161b22')
        host.style.setProperty('color', '#f0f3f6')
        host.style.setProperty('font-family', 'system-ui, sans-serif')
        host.style.setProperty('font-size', '16px')
        host.style.setProperty('line-height', '1.5')
        document.body.appendChild(host)

        const pause = createPauseMenuView(document, host)
        pause.render(pauseMenuViewModel(['pause', 'settings']))
        const settingsPanel = host.querySelector('[data-mx-ui="pause-settings-modal"]')
        if (!(settingsPanel instanceof HTMLElement)) {
          throw new Error('Expected the pause settings panel fixture')
        }
        const settings = createSettingsView(document, settingsPanel)
        settings.render(model)
      },
      {
        pauseModelPath: pauseMenuViewModelModule,
        pausePath: pauseMenuViewModule,
        settingsPath: settingsViewModule,
        model: SETTINGS_BASELINE_MODEL,
      },
    )
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await expect(page.locator('[data-d-baseline="pause-settings"]')).toHaveScreenshot('pause-settings.png', {
      maxDiffPixels: 0,
      threshold: 0,
    })
  })

  test('inventory', async ({ page }) => {
    await openHarness(page)
    await isolateHarnessScreen(page, 'inventory')
    await expect(page.locator('[data-harness-host="inventory"]')).toHaveScreenshot('inventory.png', {
      maxDiffPixels: 0,
      threshold: 0,
    })
  })

  test('furnace station', async ({ page }) => {
    await warmViewModule(page, furnaceViewModule)
    await openHarness(page, { screen: 'crosshair' })
    await page.evaluate(
      async ({ modulePath, model }) => {
        const { createFurnaceView } = (await import(modulePath)) as typeof import('../src/application/furnace-view')
        const host = document.createElement('main')
        host.setAttribute('data-d-baseline', 'furnace-station')
        host.style.setProperty('box-sizing', 'border-box')
        host.style.setProperty('width', '640px')
        host.style.setProperty('margin', '0 auto')
        host.style.setProperty('padding', '24px')
        host.style.setProperty('background-color', '#161b22')
        host.style.setProperty('color', '#f0f3f6')
        host.style.setProperty('font-family', 'system-ui, sans-serif')
        host.style.setProperty('font-size', '16px')
        host.style.setProperty('line-height', '1.5')
        document.body.appendChild(host)

        const heading = document.createElement('h1')
        heading.textContent = 'Furnace'
        host.appendChild(heading)
        const view = createFurnaceView(document, host)
        view.render(model, { focusedSlot: 'input', status: 'Smelting iron ore' })
      },
      { modulePath: furnaceViewModule, model: FURNACE_BASELINE_MODEL },
    )
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await expect(page.locator('[data-d-baseline="furnace-station"]')).toHaveScreenshot('furnace-station.png', {
      maxDiffPixels: 0,
      threshold: 0,
    })
  })

  test('onboarding', async ({ page }) => {
    await warmViewModule(page, onboardingViewModule)
    await openHarness(page, { screen: 'crosshair' })
    await page.evaluate(
      async ({ modulePath, model }) => {
        const { createOnboardingView } = (await import(modulePath)) as typeof import('../src/application/onboarding-view')
        const host = document.createElement('main')
        host.setAttribute('data-d-baseline', 'onboarding')
        host.style.setProperty('box-sizing', 'border-box')
        host.style.setProperty('width', '640px')
        host.style.setProperty('margin', '0 auto')
        host.style.setProperty('padding', '24px')
        host.style.setProperty('background-color', '#161b22')
        host.style.setProperty('color', '#f0f3f6')
        host.style.setProperty('font-family', 'system-ui, sans-serif')
        host.style.setProperty('font-size', '16px')
        host.style.setProperty('line-height', '1.5')
        document.body.appendChild(host)

        const view = createOnboardingView(document, host, { onIntent: () => undefined })
        view.render(model)
      },
      { modulePath: onboardingViewModule, model: ONBOARDING_BASELINE_MODEL },
    )
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await expect(page.locator('[data-d-baseline="onboarding"]')).toHaveScreenshot('onboarding.png', {
      maxDiffPixels: 0,
      threshold: 0,
    })
  })
})
