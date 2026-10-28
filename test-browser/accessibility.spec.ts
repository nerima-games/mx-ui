import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openHarness } from './harness'

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
