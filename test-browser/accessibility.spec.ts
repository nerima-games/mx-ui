import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { fileURLToPath } from 'node:url'
import { settingsViewModel } from '../src/domain/settings-view-model'
import { openHarness } from './harness'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from '../test/fixtures/settings-input'

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

const pauseMenuViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/pause-menu-view.ts', import.meta.url),
)}`
const pauseMenuViewModelModule = `/@fs${fileURLToPath(
  new URL('../src/domain/pause-menu-view-model.ts', import.meta.url),
)}`
const settingsViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/settings-view.ts', import.meta.url),
)}`

// BEGIN W4-C accessibility coverage
test.describe('W4-C pause menu accessibility', () => {
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

    const optionsDialog = host.getByRole('dialog', { name: 'Options' })
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


  test('renders named settings controls and supports native keyboard access', async ({ page }) => {
    const settingsSnapshot = {
      ...DEFAULT_SETTINGS,
      difficulty: 'hard' as const,
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
    const settingsResult = settingsViewModel(settingsSnapshot, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS)
    if (!Result.isSuccess(settingsResult)) {
      throw new Error('Expected a valid Settings snapshot')
    }
    const settingsModel = settingsResult.success

    await openHarness(page, { screen: 'crosshair' })
    await page.evaluate(
      async ({ viewPath, model }) => {
        const { createSettingsView } = (await import(viewPath)) as typeof import('../src/application/settings-view')
        const host = document.createElement('main')
        host.setAttribute('data-settings-browser-host', '')
        document.body.appendChild(host)

        const view = createSettingsView(document, host)
        view.render(model)
        // The host observes delegation metadata; the view itself stays passive.
        host.addEventListener('click', (event) => {
          if (event.target instanceof Element) {
            const control = event.target.closest('[data-interaction-target]')
            if (control) {
              host.setAttribute('data-host-delegated-target', control.getAttribute('data-interaction-target') ?? '')
              host.setAttribute('data-host-binding-action', control.getAttribute('data-binding-action') ?? '')
            }
          }
        })
      },
      { viewPath: settingsViewModule, model: settingsModel },
    )

    const host = page.locator('[data-settings-browser-host]')
    const settings = host.locator('[data-mx-ui="settings"]')
    const sliderExpectations = [
      ['Look sensitivity', settingsModel.mouseSensitivity],
      ['Master volume', settingsModel.masterVolume],
      ['SFX volume', settingsModel.sfxVolume],
      ['Field of view', settingsModel.fovDegrees],
      ['UI scale', settingsModel.uiScale],
    ] as const

    await Promise.all(sliderExpectations.map(async ([name, expected]) => {
      const slider = settings.getByRole('slider', { name })
      await expect(slider).toHaveAttribute('min', String(expected.minimum))
      await expect(slider).toHaveAttribute('max', String(expected.maximum))
      await expect(slider).toHaveAttribute('step', String(expected.step))
      await expect(slider).toHaveValue(String(expected.value))
    }))

    const difficultyGroup = settings.getByRole('group', { name: 'Difficulty' })
    const graphicsGroup = settings.getByRole('group', { name: 'Graphics preset' })
    const reducedMotionGroup = settings.getByRole('group', { name: 'Reduced motion' })
    const colorVisionGroup = settings.getByRole('group', { name: 'Color vision correction' })
    await Promise.all([difficultyGroup, graphicsGroup, reducedMotionGroup, colorVisionGroup].map(async (group) => {
      await expect(group).toBeVisible()
      await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1)
    }))
    await expect(difficultyGroup.getByRole('button', { name: 'Difficulty: Hard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(graphicsGroup.getByRole('button', { name: 'Graphics preset: High' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      reducedMotionGroup.getByRole('button', { name: 'Reduced motion: reduced' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      colorVisionGroup.getByRole('button', {
        name: `Color vision correction: ${settingsSnapshot.colorVisionCorrection}`,
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    const audioSwitch = settings.getByRole('switch', { name: 'Audio enabled' })
    const captionsSwitch = settings.getByRole('switch', { name: 'Sound captions' })
    await expect(audioSwitch).toHaveAttribute('aria-checked', String(settingsSnapshot.audioEnabled))
    await expect(captionsSwitch).toHaveAttribute('aria-checked', String(settingsSnapshot.captionsEnabled))
    await expect(audioSwitch).toHaveAttribute('data-interaction-target', 'settings-toggle')
    await expect(captionsSwitch).toHaveAttribute('data-interaction-target', 'settings-toggle')
    await expect(
      difficultyGroup.getByRole('button', { name: 'Difficulty: Hard' }),
    ).toHaveAttribute('data-interaction-target', 'settings-choice')

    const sensitivity = settings.getByRole('slider', { name: 'Look sensitivity' })
    const moveForwardBinding = settings.getByRole('button', { name: /Move forward key.*KeyW/i })
    const focusableElements = page.locator('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const focusableCount = await focusableElements.count()

    await tabUntilFocused(page, sensitivity, focusableCount)
    await expect(sensitivity).toBeFocused()
    const previousSensitivity = await sensitivity.inputValue()
    await page.keyboard.press('ArrowRight')
    await expect(sensitivity).not.toHaveValue(previousSensitivity)

    await tabUntilFocused(page, moveForwardBinding, focusableCount)
    await expect(moveForwardBinding).toBeFocused()
    await expect(moveForwardBinding).toHaveAttribute('type', 'button')
    await expect(moveForwardBinding).toHaveAttribute('data-interaction-target', 'settings-binding')
    await expect(moveForwardBinding).toHaveAttribute('data-binding-action', 'moveForward')
    await page.keyboard.press('Enter')
    await expect(host).toHaveAttribute('data-host-delegated-target', 'settings-binding')
    await expect(host).toHaveAttribute('data-host-binding-action', 'moveForward')
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
    await expect(region).toContainText('FPS: なし')
    await expect(region).toContainText('Coordinates: なし')
    await expect(region).toContainText('Frame delta: なし')
    await expect(region).not.toContainText('FPS: 0')
  })

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
