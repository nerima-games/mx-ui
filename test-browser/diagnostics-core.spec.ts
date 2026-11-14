import { expect, test, type Page } from '@playwright/test'
import {
  contrastRatio,
  createIntentLog,
  intentLogDiagnosticValue,
} from '../apps/browser-harness/diagnostics-core'
import { scenariosForScreen } from '../apps/browser-harness/scenario-registry'
import { openHarness } from './harness'

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

test('diagnostics follow the selected scenario without changing the UI root', async ({ page }) => {
  // Catches stale snapshots, accidental writes into the inspected subtree, and missing a11y/focus/token readings.
  const errors = watchBrowserErrors(page)
  const mainMenuScenarios = scenariosForScreen('main-menu')
  const selected = mainMenuScenarios.find((scenario) => scenario.id === 'root-panel')
  const next = mainMenuScenarios.find((scenario) => scenario.id === 'load-world-empty')
  expect(mainMenuScenarios.length).toBeGreaterThan(1)
  expect(selected).toBeDefined()
  expect(next).toBeDefined()
  if (selected === undefined || next === undefined) {
    throw new Error('diagnostics spec: main-menu scenarios are incomplete')
  }

  const options = { screen: 'main-menu', scenario: selected.id } as const
  const root = page.locator('[data-harness-host="main-menu"] > [data-mx-ui]')
  await openHarness(page, { ...options, panel: false })
  const beforePanel = await root.evaluate((element) => element.outerHTML)

  await openHarness(page, { ...options, panel: true })
  const inputJson = page.getByTestId('diagnostics-input-json')
  await expect(inputJson).toContainText(selected.id)
  const afterPanel = await root.evaluate((element) => element.outerHTML)
  expect(afterPanel).toBe(beforePanel)

  const intentOutput = page.getByTestId('diagnostics-intents')
  const viewModelOutput = page.getByTestId('diagnostics-view-model-json')
  await expect(intentOutput).toHaveText('no intents emitted')
  await expect(viewModelOutput).toContainText('"panel": "root"')
  await expect(viewModelOutput).toContainText('"savedWorlds": []')
  await root.locator('[data-menu-entry="single-player"]').click()
  await expect(intentOutput).toHaveText('no intents emitted')
  await root.locator('[data-mx-ui="menu-new-world"]').click()

  const a11yOutput = page.getByTestId('diagnostics-a11y-tree')
  await expect.poll(async () => a11yOutput.textContent()).toContain('"name": "Create"')
  const a11y = JSON.parse((await page.getByTestId('diagnostics-a11y-tree').textContent()) ?? 'null') as ReadonlyArray<{
    role: string
    name: string
    state: Readonly<Record<string, string | boolean>>
  }>
  expect(a11y.length).toBeGreaterThan(0)
  const createWorldButton = a11y.find(
    (node) => node.role === 'button' && node.name === 'Create',
  )
  expect(createWorldButton).toBeDefined()
  expect(createWorldButton?.state['disabled']).toBe(false)
  const selectedButtonCount = a11y.filter((node) => node.role === 'button').length
  expect(selectedButtonCount).toBeGreaterThan(0)

  const focus = JSON.parse((await page.getByTestId('diagnostics-focus-order').textContent()) ?? 'null') as ReadonlyArray<{
    index: number
    name: string
    role: string
  }>
  expect(focus.length).toBeGreaterThan(0)
  expect(focus[0]).toMatchObject({ index: 0, name: 'World name', role: 'textbox' })

  const tokens = JSON.parse((await page.getByTestId('diagnostics-tokens').textContent()) ?? 'null') as ReadonlyArray<{
    name: string
    value: string
    against: string
    againstValue: string
    contrastRatio: number | null
  }>
  expect(tokens.length).toBeGreaterThan(0)
  const ink = tokens.find((token) => token.name === '--mx-ui-ink')
  expect(ink).toBeDefined()
  expect(ink?.value).not.toBe('')
  expect(ink?.against).toBe('--mx-ui-surface')
  expect(ink?.againstValue).not.toBe('')
  expect(ink?.contrastRatio).toBeCloseTo(14.6, 1)

  await page.locator(`[data-scenario-buttons] button[data-scenario-id="${next.id}"]`).click()
  await expect(inputJson).toContainText(next.id)
  await expect(viewModelOutput).toContainText('"panel": "load-world"')
  const nextA11y = JSON.parse((await page.getByTestId('diagnostics-a11y-tree').textContent()) ?? 'null') as ReadonlyArray<{
    role: string
  }>
  const nextButtonCount = nextA11y.filter((node) => node.role === 'button').length
  expect(nextButtonCount).toBeLessThan(selectedButtonCount)
  expect(errors).toEqual([])
})

test('brewing controls log their view intents in click order', async ({ page }) => {
  // Catches discarded brewing callbacks and intent records that lose their sequence or tag.
  await openHarness(page, { screen: 'brewing', scenario: 'ready', panel: true })

  const intentOutput = page.getByTestId('diagnostics-intents')
  const viewModelOutput = page.getByTestId('diagnostics-view-model-json')
  await expect(viewModelOutput).toContainText('"fuelCharges": 3')
  const activeHost = page.getByRole('main').locator('[data-harness-host="brewing"][data-harness-scenario="ready"]')
  await activeHost.locator('[data-brewing-operation="insert-selected-item"]').click()
  await activeHost.locator('[data-brewing-operation="collect-bottle"]').click()
  await activeHost.locator('[data-brewing-operation="close"]').click()

  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    { sequence: 1, intent: { _tag: 'InsertSelectedItem' } },
    { sequence: 2, intent: { _tag: 'CollectBottle' } },
    { sequence: 3, intent: { _tag: 'Close' } },
  ])
})

test('onboarding actions log their view intents in click order', async ({ page }) => {
  // Catches onboarding buttons that remain connected to discarded no-op handlers.
  await openHarness(page, { screen: 'onboarding', scenario: 'open', panel: true })

  const intentOutput = page.getByTestId('diagnostics-intents')
  const viewModelOutput = page.getByTestId('diagnostics-view-model-json')
  await expect(viewModelOutput).toContainText('"quickControlsVisible": true')
  const activeHost = page.getByRole('main').locator('[data-harness-host="onboarding"][data-harness-scenario="open"]')
  await activeHost.locator('[data-onboarding-action="OpenHowToPlay"]').click()
  await activeHost.locator('[data-onboarding-action="PersistQuickControlsDismissal"]').click()

  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    { sequence: 1, intent: { _tag: 'OpenHowToPlay' } },
    { sequence: 2, intent: { _tag: 'PersistQuickControlsDismissal' } },
  ])
})

test('trade controls log tagged payloads and expose the rendered model', async ({ page }) => {
  // Catches trade callbacks that drop actor, offer, or villager payloads from diagnostics.
  await openHarness(page, { screen: 'trade', scenario: 'available', panel: true })

  const intentOutput = page.getByTestId('diagnostics-intents')
  const viewModelOutput = page.getByTestId('diagnostics-view-model-json')
  await expect(viewModelOutput).toContainText('"professionLabel": "Farmer"')
  const activeHost = page.getByRole('main').locator('[data-harness-host="trade"][data-harness-scenario="available"]')
  await activeHost.locator('[data-mx-ui="trade-offer"]').click()
  await activeHost.locator('[data-mx-ui="trade-close"]').click()

  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    {
      sequence: 1,
      intent: {
        _tag: 'TradeVillager',
        actor: 'player-1',
        offerId: 'farmer-wheat',
        villager: 'villager-1',
      },
    },
    { sequence: 2, intent: { _tag: 'CloseTradeUi' } },
  ])
})

test('a static HUD reports an available empty intent log', async ({ page }) => {
  // Catches static no-intent screens being mislabeled as unsupported.
  await openHarness(page, { screen: 'hud', scenario: 'default', panel: true })
  await expect(page.getByTestId('diagnostics-intents')).toHaveText('no intents emitted')
  await expect(page.getByTestId('diagnostics-view-model-json')).toContainText('"hearts"')
})

test('view-model diagnostics do not refresh on virtual-clock frames', async ({ page }) => {
  // Catches view-model serialization on every clock frame instead of scenario changes.
  await openHarness(page, { screen: 'loading', scenario: 'loading-ready-floor', panel: true })

  const loadingRoot = page.locator(
    '[data-harness-host="loading"][data-harness-scenario="loading-ready-floor"] > [data-mx-ui="loading"]',
  )
  await expect(loadingRoot).not.toHaveAttribute('hidden', '')
  await expect(loadingRoot).toHaveAttribute('data-loading-held', '')
  const viewModelOutput = page.getByTestId('diagnostics-view-model-json')
  await expect(viewModelOutput).toContainText('"held": true')
  const before = await viewModelOutput.textContent()
  await page.getByTestId('time-slider').evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('diagnostics spec: time slider is not an input')
    }
    element.value = '3'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.getByTestId('time-readout')).toHaveText('3.000 s')
  await expect(loadingRoot).toHaveAttribute('hidden', '')
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await expect(viewModelOutput).toHaveText(before ?? '')
})

test('intent log preserves order, evicts oldest entries, and resets for a scenario change', () => {
  // Catches reversed insertion order, an unbounded log, and stale intents surviving a scenario reset.
  const log = createIntentLog(2)
  log.add({ _tag: 'first' })
  log.add({ _tag: 'second' })
  log.add({ _tag: 'third' })

  expect(log.get()).toEqual([
    { sequence: 2, intent: { _tag: 'second' } },
    { sequence: 3, intent: { _tag: 'third' } },
  ])
  expect(intentLogDiagnosticValue(log)).toEqual({
    status: 'available',
    value: [
      { sequence: 2, intent: { _tag: 'second' } },
      { sequence: 3, intent: { _tag: 'third' } },
    ],
  })
  log.reset()
  expect(log.get()).toEqual([])
  expect(intentLogDiagnosticValue(log)).toEqual({ status: 'available', value: [] })
  log.add({ _tag: 'new-scenario' })
  expect(log.get()).toEqual([{ sequence: 1, intent: { _tag: 'new-scenario' } }])
})

test('contrast ratio uses WCAG relative luminance for black and white', () => {
  // Catches channel-space averaging or a non-WCAG contrast formula.
  expect(contrastRatio('#000000', '#ffffff')).toBe(21)
  expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21)
})
