import { expect, test, type Page } from '@playwright/test'
import {
  OVERLAY_SCENARIOS,
  OVERLAY_TIME_BOUNDARIES,
} from '../../apps/browser-harness/scenarios/overlay'
import { openHarness } from '../harness'

const watchErrors = (page: Page): Array<string> => {
  const errors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const INITIAL_TIMES: Readonly<Record<string, number>> = {
  'achievement-toast-sequence': OVERLAY_TIME_BOUNDARIES.achievementToastSecondAtSecs,
  'captions-expiry-boundary': OVERLAY_TIME_BOUNDARIES.captionExpirySecs - 0.001,
  'crosshair-hit-window': OVERLAY_TIME_BOUNDARIES.crosshairPulseSecs - 0.001,
  'loading-ready-floor': OVERLAY_TIME_BOUNDARIES.loadingMinimumVisibleSecs - 0.01,
  'save-saved-expiry': OVERLAY_TIME_BOUNDARIES.savedVisibleSecs - 0.01,
}

for (const scenario of OVERLAY_SCENARIOS) {
  test(`${scenario.screen}/${scenario.id} renders and captures ${scenario.title}`, async ({ page }, testInfo) => {
    const errors = watchErrors(page)
    await openHarness(page, {
      screen: scenario.screen,
      scenario: scenario.id,
      time: INITIAL_TIMES[scenario.id] ?? 0,
    })

    const host = page.locator(`[data-harness-host="${scenario.screen}"]`)
    await expect(host).toBeVisible()
    await expect(host.locator(':scope > [data-mx-ui]')).toHaveCount(1)
    if (scenario.id === 'achievement-toast-sequence') {
      await expect(host.locator('[data-mx-ui="achievement-toast-title"]')).toHaveText('Getting an Upgrade')
    }
    if (scenario.id === 'crosshair-hit-window') {
      await expect(host.locator('[data-mx-ui="crosshair"]')).toHaveAttribute('data-crosshair-hit', '')
      await expect(host.locator('[data-mx-ui="crosshair-arm"]')).toHaveCount(2)
    }
    if (scenario.id === 'hud-death-respawn') {
      await expect(host.locator('[data-mx-ui="death-cause"]')).toHaveText('Cause: falling')
      await expect(host.locator('[data-mx-ui="death-coordinates"]')).toHaveText('Coordinates: 12.5 / 64.0 / -3.3')
      const respawn = host.locator('[data-mx-ui="respawn"]')
      await expect(respawn).toBeEnabled()
      await respawn.focus()
      await page.keyboard.press('Enter')
      await expect(host).toHaveAttribute('data-respawned', '')
    }

    const titleSlug = scenario.title.toLowerCase().replace(/[^a-z0-9]+/gu, '-')
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.id}-${titleSlug}.png`),
      fullPage: true,
    })
    if (scenario.id === 'achievement-toast-sequence') {
      await openHarness(page, {
        screen: scenario.screen,
        scenario: scenario.id,
        time: OVERLAY_TIME_BOUNDARIES.achievementToastDismissalSecs,
      })
      await expect(host.locator('[data-mx-ui="achievement-toast"]')).toHaveAttribute('hidden', '')
      await page.screenshot({
        path: testInfo.outputPath(`${scenario.id}-dismissed.png`),
        fullPage: true,
      })
    }
    expect(errors).toStrictEqual([])
  })
}
