import { expect, test, type Locator, type Page } from '@playwright/test'
import { openHarness } from './harness'

type RectBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type LayoutBound = RectBounds & {
  readonly selector: string
  readonly label: string
  readonly tag: string
  readonly rootOverflow: boolean
  readonly viewportOverflow: boolean
}

type DomDiffEntry = {
  readonly type: 'added' | 'removed' | 'changed'
  readonly selector: string
}

const readJson = async (locator: Locator): Promise<unknown> => {
  const text = await locator.textContent()
  if (text === null) {
    throw new Error('diagnostics layout spec: expected JSON output text')
  }
  return JSON.parse(text)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLayoutBound = (value: unknown): value is LayoutBound => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value['selector'] === 'string' &&
    typeof value['label'] === 'string' &&
    typeof value['tag'] === 'string' &&
    typeof value['x'] === 'number' &&
    typeof value['y'] === 'number' &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['rootOverflow'] === 'boolean' &&
    typeof value['viewportOverflow'] === 'boolean'
  )
}

const isDomDiffEntry = (value: unknown): value is DomDiffEntry =>
  isRecord(value) &&
  (value['type'] === 'added' || value['type'] === 'removed' || value['type'] === 'changed') &&
  typeof value['selector'] === 'string'

const readLayoutBounds = async (locator: Locator): Promise<LayoutBound[]> => {
  const value = await readJson(locator)
  if (!Array.isArray(value)) {
    throw new Error('diagnostics layout spec: bounds output was not an array')
  }
  return value.filter(isLayoutBound)
}

const layoutBoundFor = (bounds: ReadonlyArray<LayoutBound>, label: string): LayoutBound => {
  const bound = bounds.find((item) => item.label.includes(label))
  if (bound === undefined) {
    throw new Error(`diagnostics layout spec: no bounds entry for ${label}`)
  }
  return bound
}

const readDomDiff = async (locator: Locator): Promise<DomDiffEntry[]> => {
  const value = await readJson(locator)
  if (!Array.isArray(value)) {
    throw new Error('diagnostics layout spec: DOM diff output was not an array')
  }
  return value.filter(isDomDiffEntry)
}

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

const expectNoUnexpectedErrors = async (page: Page, browserErrors: ReadonlyArray<string>): Promise<void> => {
  expect(browserErrors).toEqual([])
  expect(await readJson(page.getByTestId('diagnostics-errors'))).toEqual([])
}

const readListenerCount = async (page: Page): Promise<number> => {
  const text = await page.getByTestId('diagnostics-document-listeners').textContent()
  if (text === null) {
    throw new Error('diagnostics layout spec: listener count output was empty')
  }
  const count = Number(text)
  if (!Number.isFinite(count)) {
    throw new Error(`diagnostics layout spec: invalid listener count ${text}`)
  }
  return count
}

const assertBoundsMatch = (shown: LayoutBound, actual: RectBounds): void => {
  expect(shown.x).toBeCloseTo(actual.x, 2)
  expect(shown.y).toBeCloseTo(actual.y, 2)
  expect(shown.width).toBeCloseTo(actual.width, 2)
  expect(shown.height).toBeCloseTo(actual.height, 2)
}

test('layout bounds and overflow follow a scenario switch and report the removed DOM', async ({ page }) => {
  // Catches stale bounds, missed viewport overflow, and empty DOM diffs after switching scenarios.
  const browserErrors = watchBrowserErrors(page)
  await openHarness(page, {
    screen: 'main-menu',
    scenario: 'load-world-200',
    width: 320,
    height: 180,
    panel: true,
  })

  const boundsOutput = page.getByTestId('diagnostics-layout-bounds')
  const overflowOutput = page.getByTestId('diagnostics-layout-overflow')
  const diffOutput = page.getByTestId('diagnostics-dom-diff')
  const refreshButton = page.getByTestId('diagnostics-layout-refresh')
  const worldRow = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="load-world-200"] [data-mx-ui="menu-world-row-container"][data-session-id="world-200"]',
  )
  const worldRoot = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="load-world-200"] [data-mx-ui="main-menu"]',
  )
  await expect(worldRow).toBeVisible()
  await refreshButton.click()

  const worldRect = await worldRow.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  const worldBound = layoutBoundFor(await readLayoutBounds(boundsOutput), 'Saved world 200')
  assertBoundsMatch(worldBound, worldRect)
  expect(worldBound.viewportOverflow).toBe(true)
  const overlayBox = page.locator(`[data-layout-bounds-for="${worldBound.selector}"]`)
  await expect(overlayBox).toBeVisible()
  await expect(overlayBox).toHaveCSS('border-top-color', 'rgb(208, 0, 0)')
  const worldOverflow = (await readLayoutBounds(overflowOutput)).find(
    (item) => item.selector === worldBound.selector,
  )
  expect(worldOverflow).toBeDefined()
  if (worldOverflow === undefined) {
    throw new Error('diagnostics layout spec: overflowing world row was not listed')
  }
  expect(worldOverflow.viewportOverflow).toBe(true)

  const beforeRoot = await worldRoot.evaluate((element) => element.outerHTML)
  await page.locator('[data-scenario-buttons] button[data-scenario-id="load-world-empty"]').click()
  await expect(page.getByTestId('diagnostics-input-json')).toContainText('load-world-empty')
  await refreshButton.click()

  const emptyRoot = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="load-world-empty"] [data-mx-ui="main-menu"]',
  )
  const backButton = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="load-world-empty"] [data-mx-ui="menu-back-worlds"]',
  )
  const afterRoot = await emptyRoot.evaluate((element) => element.outerHTML)
  expect(afterRoot).not.toBe(beforeRoot)
  const backRect = await backButton.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  const backBound = (await readLayoutBounds(boundsOutput)).find(
    (item) => item.tag === 'button' && item.label === 'Back' && item.x === backRect.x && item.y === backRect.y,
  )
  expect(backBound).toBeDefined()
  if (backBound === undefined) {
    throw new Error('diagnostics layout spec: no bounds entry for the Back button')
  }
  assertBoundsMatch(backBound, backRect)

  const diffText = await diffOutput.textContent()
  const diffEntries = await readDomDiff(diffOutput)
  expect(diffEntries.length).toBeGreaterThan(0)
  expect(diffEntries.some((entry) => entry.type === 'removed')).toBe(true)
  expect(diffText).toContain('world-200')
  await expectNoUnexpectedErrors(page, browserErrors)
})

test('virtual time changes produce DOM diff entries for the selected scenario', async ({ page }) => {
  // Catches a stale DOM diff after virtual time changes the crosshair progress value.
  const browserErrors = watchBrowserErrors(page)
  await openHarness(page, {
    screen: 'crosshair',
    scenario: 'crosshair-progress-range',
    panel: true,
  })

  const progress = page.locator(
    '[data-harness-host="crosshair"][data-harness-scenario="crosshair-progress-range"] [data-mx-ui="crosshair-progress"]',
  )
  const root = page.locator(
    '[data-harness-host="crosshair"][data-harness-scenario="crosshair-progress-range"] [data-mx-ui="crosshair"]',
  )
  const diffOutput = page.getByTestId('diagnostics-dom-diff')
  const refreshButton = page.getByTestId('diagnostics-layout-refresh')
  await expect(progress).toHaveAttribute('aria-valuenow', '0')
  await refreshButton.click()
  const beforeRoot = await root.evaluate((element) => element.outerHTML)

  await page.getByTestId('time-slider').evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('diagnostics layout spec: time slider was not an input')
    }
    element.value = '2'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
  await refreshButton.click()

  const afterRoot = await root.evaluate((element) => element.outerHTML)
  expect(afterRoot).not.toBe(beforeRoot)
  const diffEntries = await readDomDiff(diffOutput)
  expect(diffEntries.length).toBeGreaterThan(0)
  expect(diffEntries.some((entry) => entry.type === 'changed')).toBe(true)
  await expectNoUnexpectedErrors(page, browserErrors)
})

test('scenario disposal restores document listeners and a leaking mount raises the count', async ({ page }) => {
  // Catches a document keydown listener surviving scenario disposal and a counter that misses a leaked mount.
  const browserErrors = watchBrowserErrors(page)
  await openHarness(page, {
    screen: 'session-overlays',
    scenario: 'pause-only',
    panel: true,
  })

  const refreshButton = page.getByTestId('diagnostics-layout-refresh')
  await refreshButton.click()
  const baseline = await readListenerCount(page)
  await page.locator('[data-scenario-buttons] button[data-scenario-id="factory-settings-open"]').click()
  await expect(page.getByTestId('diagnostics-input-json')).toContainText('factory-settings-open')
  expect(await readListenerCount(page)).toBeGreaterThan(baseline)

  await page.locator('[data-scenario-buttons] button[data-scenario-id="pause-only"]').click()
  await expect(page.getByTestId('diagnostics-input-json')).toContainText('pause-only')
  expect(await readListenerCount(page)).toBe(baseline)

  const leakingMount = await page.evaluateHandle(() => {
    const listener = (): void => undefined
    document.addEventListener('t10-deliberate-leak', listener)
    return {
      dispose: (): void => undefined,
      cleanup: (): void => document.removeEventListener('t10-deliberate-leak', listener),
    }
  })
  try {
    await leakingMount.evaluate((mount) => mount.dispose())
    expect(await readListenerCount(page)).toBeGreaterThan(baseline)
    await leakingMount.evaluate((mount) => mount.cleanup())
    expect(await readListenerCount(page)).toBe(baseline)
  } finally {
    await leakingMount.evaluate((mount) => mount.cleanup())
    await leakingMount.dispose()
  }

  await expectNoUnexpectedErrors(page, browserErrors)
})

test('layout diagnostics flag an explicitly oversized element inside a mounted scenario root', async ({ page }) => {
  // Catches a detector that ignores an element extending beyond both scenario-root and viewport bounds.
  const browserErrors = watchBrowserErrors(page)
  await openHarness(page, {
    screen: 'main-menu',
    scenario: 'root-panel',
    width: 320,
    height: 180,
    panel: true,
  })

  await page.evaluate(() => {
    const root = document.querySelector(
      '[data-harness-host="main-menu"][data-harness-scenario="root-panel"] [data-mx-ui="main-menu"]',
    )
    if (!(root instanceof HTMLElement)) {
      throw new Error('diagnostics layout spec: selected main-menu root was not mounted')
    }
    const overflowing = document.createElement('div')
    overflowing.setAttribute('aria-label', 'deliberately oversized overflow control')
    overflowing.style.position = 'absolute'
    overflowing.style.left = '0'
    overflowing.style.top = '0'
    overflowing.style.width = '2000px'
    overflowing.style.height = '1px'
    root.append(overflowing)
  })
  await page.getByTestId('diagnostics-layout-refresh').click()

  const overflow = (await readLayoutBounds(page.getByTestId('diagnostics-layout-overflow'))).find(
    (item) => item.label === 'deliberately oversized overflow control',
  )
  expect(overflow).toBeDefined()
  if (overflow === undefined) {
    throw new Error('diagnostics layout spec: deliberately overflowing element was not listed')
  }
  expect(overflow.rootOverflow).toBe(true)
  expect(overflow.viewportOverflow).toBe(true)
  await expectNoUnexpectedErrors(page, browserErrors)
})
