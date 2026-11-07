import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { DEFAULT_SCREEN_IDS, SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { buildHarnessUrl, openHarness } from './harness'

const watchBrowserErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const defaultScenarioIdFor = (screen: string): string => {
  const scenario = SCENARIO_REGISTRY.find(
    (candidate) => candidate.screen === screen && candidate.isDefault,
  )
  if (scenario === undefined) {
    throw new Error(`browser-harness contract: screen "${screen}" has no default scenario`)
  }
  return scenario.id
}

test('registry defaults and panel list cover every registered screen', async ({ page }) => {
  const registryScreens = [...new Set(SCENARIO_REGISTRY.map((scenario) => scenario.screen))].sort()
  const defaults = SCENARIO_REGISTRY.filter((scenario) => scenario.isDefault)
  expect(registryScreens.length).toBeGreaterThan(0)
  expect([...DEFAULT_SCREEN_IDS].sort()).toEqual(registryScreens)
  expect(defaults.map((scenario) => scenario.screen).sort()).toEqual(registryScreens)

  await openHarness(page, { panel: true })
  const panel = page.locator('[data-debug-panel]')
  await expect(panel).toBeVisible()
  const screenOptions = panel.getByLabel('Screen').locator('option')
  await expect(screenOptions).toHaveCount(registryScreens.length)
  const panelScreens = await screenOptions.evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).sort(),
  )
  expect(panelScreens).toEqual(registryScreens)
})

for (const screen of DEFAULT_SCREEN_IDS) {
  test(`panel selects ${screen} and mounts its default scenario`, async ({ page }) => {
    const errors = watchBrowserErrors(page)
    await openHarness(page, { panel: true })
    const panel = page.locator('[data-debug-panel]')
    const expectedScenarioId = defaultScenarioIdFor(screen)
    await panel.getByLabel('Screen').selectOption(screen)
    const host = page.locator(`[data-harness-host="${screen}"]`)
    await expect(host).toBeVisible()
    await expect(page.locator(`[data-harness-host="${screen}"] > [data-mx-ui]`)).toHaveCount(1)
    await expect(host).toHaveAttribute('data-harness-scenario', expectedScenarioId)
    const defaultScenarioButton = panel.locator(
      `[data-scenario-buttons][data-screen="${screen}"] button[data-scenario-id="${expectedScenarioId}"]`,
    )
    await expect(defaultScenarioButton).toHaveCount(1)
    await expect(defaultScenarioButton).toHaveAttribute('aria-pressed', 'true')
    expect(errors).toEqual([])
  })
}

test('gallery and environment controls update the active harness state', async ({ page }) => {
  await openHarness(page, { panel: true })

  await page.getByTestId('gallery-toggle').click()
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-layout', 'gallery')
  await expect(page.locator('[data-scenario-card="default"]')).toBeVisible()
  await expect(page.locator('[data-harness-ready]')).toHaveAttribute(
    'data-harness-ready',
    String(SCENARIO_REGISTRY.filter((scenario) => scenario.screen === 'main-menu').length),
  )

  await page.getByLabel('Motion').selectOption('reduced')
  await page.getByLabel('Harness color vision').selectOption('deuteranopia')
  await page.getByLabel('Viewport width').fill('390')
  await page.getByLabel('Viewport width').press('Tab')
  await page.getByLabel('Viewport height').fill('844')
  await page.getByLabel('Viewport height').press('Tab')
  await page.getByLabel('Safe area').fill('20')
  await page.getByLabel('Safe area').press('Tab')
  await page.getByLabel('DPR').selectOption('2')
  await page.getByLabel('Text scale').selectOption('150')
  await page.getByLabel('Contrast').selectOption('more')
  await page.getByLabel('Background').selectOption('black')

  const stage = page.locator('[data-harness-stage]')
  await expect(stage).toHaveAttribute('data-motion', 'reduced')
  await expect(stage).toHaveAttribute('data-cvd', 'deuteranopia')
  await expect(stage).toHaveAttribute('data-width', '390')
  await expect(stage).toHaveAttribute('data-height', '844')
  await expect(stage).toHaveAttribute('data-dpr', '2')
  await expect(stage).toHaveAttribute('data-text-scale', '150')
  await expect(stage).toHaveAttribute('data-contrast', 'more')
  await expect(stage).toHaveAttribute('data-background', 'black')
  expect(new URL(page.url()).searchParams.get('safe')).toBe('20')
})

test('timeline controls pause, step, play, change speed, and reset virtual time', async ({ page }) => {
  await openHarness(page, { panel: true })
  const panel = page.locator('[data-debug-panel]')
  const timeReadout = panel.getByTestId('time-readout')
  const pause = panel.getByRole('button', { name: 'Pause' })
  const play = panel.getByRole('button', { name: 'Play' })

  await panel.getByRole('button', { name: 'Step frame' }).click()
  await expect(timeReadout).toHaveText('0.017 s')

  await play.click()
  await expect
    .poll(async () => Number.parseFloat((await timeReadout.textContent()) ?? '0'))
    .toBeGreaterThan(0.02)
  await pause.click()
  const pausedAt = await timeReadout.textContent()
  await page.waitForTimeout(75)
  await expect(timeReadout).toHaveText(pausedAt ?? '')

  await panel.getByLabel('Speed').selectOption('2')
  await expect(new URL(page.url()).searchParams.get('speed')).toBe('2')
  await panel.getByLabel('Motion').selectOption('reduced')
  await panel.getByRole('button', { name: 'Reset' }).click()
  await expect(timeReadout).toHaveText('0.000 s')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-motion', 'reduced')
  await expect(new URL(page.url()).searchParams.get('motion')).toBe('reduced')
})

test('invalid and duplicate query fields fall back locally and show an alert', async ({ page }) => {
  await page.goto(
    '/?screen=unknown&scenario=missing&layout=invalid&motion=fast&w=-4&play=maybe&speed=0.7&background=black&panel=1&extra=ignored',
  )
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-ready'))

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Unknown screen')
  await expect(alert).toContainText('Unknown scenario')
  await expect(alert).toContainText('Invalid layout')
  await expect(alert).toContainText('Invalid motion')
  await expect(alert).toContainText('Invalid w')
  await expect(alert).toContainText('Unknown query parameter')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-motion', 'full')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-background', 'black')
  await expect(page.locator('[data-harness-host="main-menu"]')).toBeVisible()

  await page.goto('/?screen=hud&screen=inventory&motion=reduced&panel=1')
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-ready'))
  await expect(page.getByRole('alert')).toContainText('screen appears more than once')
  await expect(page.locator('[data-harness-host="main-menu"]')).toBeVisible()
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-motion', 'reduced')
})

test('URL builder serializes the canonical state fields', () => {
  const url = new URL(
    buildHarnessUrl({
      screen: 'crosshair',
      scenario: 'default',
      safe: 48,
      time: 12,
      playing: true,
      panel: true,
    }),
    'http://localhost',
  )
  const params = url.searchParams
  expect(params.get('screen')).toBe('crosshair')
  expect(params.get('scenario')).toBe('default')
  expect(params.get('cvd')).toBe('none')
  expect(params.get('safe')).toBe('48')
  expect(params.get('time')).toBe('12')
  expect(params.get('play')).toBe('1')
})

test('filesystem serving does not expose repository-level files', async ({ request }) => {
  const response = await request.get(`/@fs${resolve('package.json')}`)
  expect(response.status()).toBe(403)
})
