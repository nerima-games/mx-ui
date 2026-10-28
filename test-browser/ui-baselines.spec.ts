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
