import { expect, test, type Page } from '@playwright/test'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import {
  MAX_HARNESS_STATE_JSON_BYTES,
  parseHarnessStateJson,
  serializeHarnessStateJson,
} from '../apps/browser-harness/json-state'
import { DEFAULT_HARNESS_STATE } from '../apps/browser-harness/url-state'
import type { HarnessUrlState, ScenarioDefinition } from '../apps/browser-harness/scenario-types'
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

const richStateFor = (scenario: ScenarioDefinition): HarnessUrlState => ({
  ...DEFAULT_HARNESS_STATE,
  screen: scenario.screen,
  scenario: scenario.id,
  layout: 'single',
  motion: 'reduced',
  cvd: 'deuteranopia',
  width: 390,
  height: 844,
  safe: 20,
  dpr: 2,
  textScale: 150,
  contrast: 'more',
  background: 'checker',
  time: 12.75,
  playing: false,
  speed: 2,
  panel: true,
  breakProgress: 0.375,
})

const scenarioForTest = (): ScenarioDefinition => {
  const scenario = SCENARIO_REGISTRY.find((entry) => !entry.isDefault)
  if (scenario === undefined) {
    throw new Error('json-state browser spec requires a registered non-default scenario')
  }
  return scenario
}

type InvalidImportCase = {
  readonly name: string
  readonly alert: string
  readonly input: (state: Record<string, unknown>) => string
}

const invalidImportCases: ReadonlyArray<InvalidImportCase> = [
  {
    name: 'malformed JSON',
    alert: 'Input is not valid JSON.',
    input: () => '{',
  },
  {
    name: 'wrong field type',
    alert: 'State JSON contains a field with the wrong type.',
    input: (state) => JSON.stringify({ ...state, width: 'wide' }),
  },
  {
    name: 'unknown field',
    alert: 'State JSON contains an unknown field.',
    input: (state) => JSON.stringify({ ...state, unexpected: true }),
  },
  {
    name: 'missing scenario',
    alert: 'State JSON names a screen or scenario not in the registry.',
    input: (state) => JSON.stringify({ ...state, scenario: 'missing-t08-scenario' }),
  },
  {
    name: 'oversized input',
    alert: 'State JSON must be 64 KiB or smaller.',
    input: () => `[${'x'.repeat(MAX_HARNESS_STATE_JSON_BYTES)}]`,
  },
  {
    name: 'duplicate key',
    alert: 'State JSON contains duplicate fields.',
    input: (state) => {
      const json = JSON.stringify(state)
      return `${json.slice(0, -1)},"screen":"missing-t08-screen"}`
    },
  },
]

const registerInvalidImportTest = (inputCase: InvalidImportCase): void => {
  // This test catches an invalid import being accepted, losing the current scenario, or stopping controls.
  test(`invalid import rejects ${inputCase.name} and preserves the active scenario`, async ({ page }) => {
    const errors = watchBrowserErrors(page)
    const scenario = scenarioForTest()
    await openHarness(page, richStateFor(scenario))

    const jsonField = page.getByLabel('Canonical state JSON')
    const base = JSON.parse(await jsonField.inputValue()) as Record<string, unknown>
    await jsonField.fill(inputCase.input(base))
    await page.getByRole('button', { name: 'Import JSON' }).click()

    const alert = page.getByRole('alert').filter({ hasText: inputCase.alert })
    await expect(alert).toHaveCount(1)
    await expect(alert).toBeVisible()
    await expect(alert).toHaveText(inputCase.alert)
    await expect(
      page.locator(`[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`),
    ).toBeVisible()
    await expect(
      page.locator(`[data-scenario-buttons] button[data-scenario-id="${scenario.id}"]`),
    ).toHaveAttribute('aria-pressed', 'true')

    const previousTime = await page.getByTestId('time-readout').textContent()
    const step = page.getByRole('button', { name: 'Step frame' })
    await expect(step).toBeEnabled()
    await step.click()
    await expect(page.getByTestId('time-readout')).not.toHaveText(previousTime ?? '')
    await expect(
      page.locator(`[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`),
    ).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('canonical JSON parser returns typed refusals and rejects oversized text before parsing', () => {
  // This catches accidental fallback acceptance when required fields, values, or registry IDs are invalid.
  const scenario = scenarioForTest()
  const validState = richStateFor(scenario)
  const validJson = serializeHarnessStateJson(validState)
  const state = JSON.parse(validJson) as Record<string, unknown>
  const invalidSchema = { ...state, width: '390' }
  const unknownField = { ...state, unexpected: true }
  const missingField = { ...state }
  delete missingField['time']
  const missingScenario = { ...state, scenario: 'missing-t08-scenario' }
  const duplicateScreen = `${validJson.slice(0, -1)},\n  "screen": "missing-t08-screen"\n}`
  const cases = [
    { input: '{', kind: 'invalid-json' },
    { input: JSON.stringify(invalidSchema), kind: 'invalid-schema' },
    { input: JSON.stringify(unknownField), kind: 'invalid-schema' },
    { input: JSON.stringify(missingField), kind: 'invalid-schema' },
    { input: duplicateScreen, kind: 'invalid-schema' },
    { input: JSON.stringify(missingScenario), kind: 'unknown-scenario' },
    { input: `[${'x'.repeat(MAX_HARNESS_STATE_JSON_BYTES)}]`, kind: 'too-large' },
    { input: JSON.stringify('€'.repeat(22_000)), kind: 'too-large' },
  ] as const

  const accepted = parseHarnessStateJson(validJson, SCENARIO_REGISTRY)
  expect(accepted.ok).toBe(true)
  if (!accepted.ok) {
    throw new Error(`canonical test fixture was rejected: ${accepted.error.kind}`)
  }
  expect(accepted.state).toEqual(validState)
  expect(serializeHarnessStateJson(accepted.state)).toBe(validJson)

  for (const inputCase of cases) {
    const result = parseHarnessStateJson(inputCase.input, SCENARIO_REGISTRY)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe(inputCase.kind)
      expect(result.error.message).not.toContain(inputCase.input)
    }
  }
})

test('JSON import restores the complete state and exports the same canonical string', async ({ page }) => {
  // This catches drift between URL state serialization and JSON import/export ordering or values.
  const errors = watchBrowserErrors(page)
  const scenario = scenarioForTest()
  const state = richStateFor(scenario)
  await openHarness(page, state)

  const jsonField = page.getByLabel('Canonical state JSON')
  await expect(jsonField).toBeEditable()
  const exported = await jsonField.inputValue()
  expect(Object.keys(JSON.parse(exported) as object)).toEqual([
    'screen',
    'scenario',
    'layout',
    'motion',
    'cvd',
    'width',
    'height',
    'safe',
    'dpr',
    'textScale',
    'contrast',
    'background',
    'time',
    'playing',
    'speed',
    'panel',
    'breakProgress',
  ])
  expect(JSON.parse(exported) as unknown).toEqual(state)

  await page.getByLabel('Background').selectOption('white')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-background', 'white')
  await jsonField.fill(exported)
  await page.getByRole('button', { name: 'Import JSON' }).click()

  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-background', 'checker')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-motion', 'reduced')
  await expect(page.locator('[data-harness-stage]')).toHaveAttribute('data-width', '390')
  await expect(jsonField).toHaveValue(exported)
  const importedUrl = new URL(page.url())
  expect(importedUrl.searchParams.get('screen')).toBe(scenario.screen)
  expect(importedUrl.searchParams.get('scenario')).toBe(scenario.id)
  expect(importedUrl.searchParams.get('cvd')).toBe('deuteranopia')
  expect(importedUrl.searchParams.get('w')).toBe('390')
  expect(importedUrl.searchParams.get('h')).toBe('844')
  expect(importedUrl.searchParams.get('safe')).toBe('20')
  expect(importedUrl.searchParams.get('dpr')).toBe('2')
  expect(importedUrl.searchParams.get('textScale')).toBe('150')
  expect(importedUrl.searchParams.get('contrast')).toBe('more')
  expect(importedUrl.searchParams.get('background')).toBe('checker')
  expect(importedUrl.searchParams.get('time')).toBe('12.75')
  expect(importedUrl.searchParams.get('play')).toBe('0')
  expect(importedUrl.searchParams.get('speed')).toBe('2')
  expect(importedUrl.searchParams.get('panel')).toBe('1')
  expect(importedUrl.searchParams.get('breakProgress')).toBe('0.375')
  expect(errors).toEqual([])
})

invalidImportCases.forEach(registerInvalidImportTest)

test('copy fallback keeps JSON selectable when clipboard access is unavailable', async ({ page }) => {
  // This catches copy controls that lose the only usable JSON when the clipboard API is denied or absent.
  const errors = watchBrowserErrors(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('Permission denied.', 'NotAllowedError')
        },
      },
    })
  })
  await openHarness(page, { panel: true })

  const jsonField = page.getByLabel('Canonical state JSON')
  const exported = await jsonField.inputValue()
  expect(exported).toContain('"screen"')
  await page.getByRole('button', { name: 'Copy JSON' }).click()
  await expect(page.getByText('Clipboard unavailable. The JSON is selected for manual copying.')).toBeVisible()
  const selection = await jsonField.evaluate((field: HTMLTextAreaElement) => ({
    value: field.value,
    start: field.selectionStart,
    end: field.selectionEnd,
    focused: document.activeElement === field,
  }))
  expect(selection).toEqual({
    value: exported,
    start: 0,
    end: exported.length,
    focused: true,
  })

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
  await page.getByRole('button', { name: 'Copy JSON' }).click()
  await expect(page.getByText('Clipboard unavailable. The JSON is selected for manual copying.')).toBeVisible()
  const selectionWithoutApi = await jsonField.evaluate((field: HTMLTextAreaElement) => ({
    value: field.value,
    start: field.selectionStart,
    end: field.selectionEnd,
    focused: document.activeElement === field,
  }))
  expect(selectionWithoutApi).toEqual({
    value: exported,
    start: 0,
    end: exported.length,
    focused: true,
  })
  expect(errors).toEqual([])
})
