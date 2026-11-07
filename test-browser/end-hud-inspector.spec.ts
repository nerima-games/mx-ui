import { expect, test, type Locator, type Page } from '@playwright/test'
import { END_HUD_INSPECTOR_SCENARIOS } from '../apps/browser-harness/end-hud-inspector'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { openHarness } from './harness'

const TABLE_NAME = 'End HUD derived data inspector (read-only)'
const SCENARIO_ID = 'end-hud-inspector'

const watchBrowserErrors = (page: Page): { readonly consoleErrors: string[]; readonly pageErrors: string[] } => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { consoleErrors, pageErrors }
}

const openInspector = async (page: Page) => {
  await openHarness(page, {
    layout: 'single',
    panel: true,
    scenario: SCENARIO_ID,
    screen: 'hud',
  })
  const previews = (['left', 'right'] as const).map((side) => {
    const pane = page.locator(`[data-comparison-pane="${side}"]`)
    const preview = pane.locator('[data-comparison-host]')
    return { pane, preview }
  })
  await Promise.all(
    previews.flatMap(({ pane, preview }) => [
      expect(pane).toBeVisible(),
      expect(preview).toBeVisible(),
      expect(preview).toHaveAttribute('aria-hidden', 'true'),
      expect(preview).toHaveAttribute('inert', ''),
    ]),
  )
  const table = page.getByRole('table', { name: TABLE_NAME })
  await expect(table).toHaveCount(1)
  await expect(table).toBeVisible()
  return table
}

const expectCells = async (
  table: Locator,
  caseId: string,
  expected: ReadonlyArray<string>,
): Promise<void> => {
  const row = table.locator(`tbody tr[data-case="${caseId}"]`)
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('cell')).toHaveText([...expected])
}

const expectNoBrowserErrors = (errors: ReturnType<typeof watchBrowserErrors>): void => {
  expect(errors.consoleErrors).toStrictEqual([])
  expect(errors.pageErrors).toStrictEqual([])
}

test.describe('end HUD inspector', () => {
  // Bug caught: a missing registry entry, an accidental default scenario, an unlabeled table, or editable controls.
  test('registers a read-only debug table under the existing HUD screen', async ({ page }) => {
    const errors = watchBrowserErrors(page)
    const definition = END_HUD_INSPECTOR_SCENARIOS.find((scenario) => scenario.id === SCENARIO_ID)

    expect(definition).toMatchObject({ screen: 'hud', id: SCENARIO_ID, isDefault: false })
    expect(SCENARIO_REGISTRY).toContain(definition)

    const table = await openInspector(page)
    await expect(page.getByRole('note')).toHaveText(
      'Browser debug harness output only; this is not an in-game screen.',
    )
    await expect(page.getByRole('button', { name: 'End HUD inspector (read-only)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(table.getByRole('row')).toHaveCount(22)
    await expect(table.getByRole('cell')).toHaveCount(105)
    await expect(table.locator('input, select, textarea, button')).toHaveCount(0)
    expectNoBrowserErrors(errors)
  })

  // Bug caught: health values outside the valid range or non-finite values produce incorrect progress or visibility.
  test('shows boss health clamps and progress boundaries', async ({ page }) => {
    const errors = watchBrowserErrors(page)
    const table = await openInspector(page)

    await expectCells(table, 'boss-zero', [
      'Boss health',
      'Zero',
      'current=0; max=100; phase=circling',
      'current=0; max=100; progress=0%; hidden=true',
      'Ender Dragon: 0 of 100 health, circling.',
    ])
    await expectCells(table, 'boss-full', [
      'Boss health',
      'Maximum',
      'current=100; max=100; phase=charging',
      'current=100; max=100; progress=100%; hidden=false',
      'Ender Dragon: 100 of 100 health, charging.',
    ])
    await expectCells(table, 'boss-over-max', [
      'Boss health',
      'Over maximum',
      'current=150; max=100; phase=charging',
      'current=100; max=100; progress=100%; hidden=false',
      'Ender Dragon: 100 of 100 health, charging.',
    ])
    await expectCells(table, 'boss-nan-current', [
      'Boss health',
      'NaN current',
      'current=NaN; max=100; phase=circling',
      'current=0; max=100; progress=0%; hidden=true',
      'Ender Dragon: 0 of 100 health, circling.',
    ])
    await expectCells(table, 'boss-nan-max', [
      'Boss health',
      'NaN maximum',
      'current=50; max=NaN; phase=circling',
      'current=0; max=0; progress=0%; hidden=true',
      'Ender Dragon: 0 of 0 health, circling.',
    ])
    expectNoBrowserErrors(errors)
  })

  // Bug caught: locator normalization and portal-eye clamping or percentage rounding drift from their source rules.
  test('shows locator directions and portal-eye progress boundaries', async ({ page }) => {
    const errors = watchBrowserErrors(page)
    const table = await openInspector(page)

    await expectCells(table, 'locator-origin', [
      'Stronghold locator',
      'Origin',
      'bearing=0°; distance=0 blocks',
      'status=tracking; bearing=0°; distance=0 blocks',
      'Stronghold: 0 blocks away, ahead.',
    ])
    await expectCells(table, 'locator-wrapped', [
      'Stronghold locator',
      'Wrapped bearing',
      'bearing=405°; distance=128.2 blocks',
      'status=tracking; bearing=45°; distance=128.2 blocks',
      'Stronghold: 128 blocks away, 45 degrees right.',
    ])
    await expectCells(table, 'locator-behind', [
      'Stronghold locator',
      'Behind',
      'bearing=180°; distance=1 blocks',
      'status=tracking; bearing=180°; distance=1 blocks',
      'Stronghold: 1 blocks away, behind.',
    ])
    await expectCells(table, 'locator-nan-bearing', [
      'Stronghold locator',
      'NaN bearing',
      'bearing=NaN°; distance=20 blocks',
      'status=unknown',
      'Stronghold location unknown.',
    ])
    await expectCells(table, 'locator-nan-distance', [
      'Stronghold locator',
      'NaN distance',
      'bearing=0°; distance=NaN blocks',
      'status=unknown',
      'Stronghold location unknown.',
    ])
    await expectCells(table, 'eyes-zero', [
      'Portal eyes',
      'Zero',
      'inserted=0',
      'inserted=0/12; progress=0%; complete=false',
      '0 of 12 portal eyes inserted.',
    ])
    await expectCells(table, 'eyes-half', [
      'Portal eyes',
      'Half',
      'inserted=6',
      'inserted=6/12; progress=50%; complete=false',
      '6 of 12 portal eyes inserted.',
    ])
    await expectCells(table, 'eyes-full', [
      'Portal eyes',
      'Maximum',
      'inserted=12',
      'inserted=12/12; progress=100%; complete=true',
      '12 of 12 portal eyes inserted.',
    ])
    await expectCells(table, 'eyes-over-max', [
      'Portal eyes',
      'Over maximum',
      'inserted=15',
      'inserted=12/12; progress=100%; complete=true',
      '12 of 12 portal eyes inserted.',
    ])
    await expectCells(table, 'eyes-nan', [
      'Portal eyes',
      'NaN',
      'inserted=NaN',
      'inserted=0/12; progress=0%; complete=false',
      '0 of 12 portal eyes inserted.',
    ])
    expectNoBrowserErrors(errors)
  })

  // Bug caught: reward keys become unstable, XP is not clamped, or an empty event ID creates a notification.
  test('shows defeat reward keys and XP boundaries', async ({ page }) => {
    const errors = watchBrowserErrors(page)
    const table = await openInspector(page)

    await expectCells(table, 'reward-zero', [
      'Defeat reward',
      'Zero XP',
      'eventId=encounter-zero; experiencePoints=0',
      'presentationKey=end-hud:dragon-defeat:encounter-zero; experiencePoints=0',
      'Ender Dragon defeated. 0 XP awarded.',
    ])
    await expectCells(table, 'reward-ordinary', [
      'Defeat reward',
      'Typical XP',
      'eventId=encounter-42; experiencePoints=12000',
      'presentationKey=end-hud:dragon-defeat:encounter-42; experiencePoints=12000',
      'Ender Dragon defeated. 12000 XP awarded.',
    ])
    await expectCells(table, 'reward-max', [
      'Defeat reward',
      'Maximum XP',
      'eventId=encounter-max; experiencePoints=9007199254740991',
      'presentationKey=end-hud:dragon-defeat:encounter-max; experiencePoints=9007199254740991',
      'Ender Dragon defeated. 9007199254740991 XP awarded.',
    ])
    await expectCells(table, 'reward-over-max', [
      'Defeat reward',
      'Over maximum',
      'eventId=encounter-over-max; experiencePoints=9007199254740992',
      'presentationKey=end-hud:dragon-defeat:encounter-over-max; experiencePoints=9007199254740991',
      'Ender Dragon defeated. 9007199254740991 XP awarded.',
    ])
    await expectCells(table, 'reward-nan', [
      'Defeat reward',
      'NaN XP',
      'eventId=encounter-nan; experiencePoints=NaN',
      'presentationKey=end-hud:dragon-defeat:encounter-nan; experiencePoints=0',
      'Ender Dragon defeated. 0 XP awarded.',
    ])
    await expectCells(table, 'reward-empty-id', [
      'Defeat reward',
      'Blank event id',
      "eventId='   '; experiencePoints=12",
      'notification=none; presentationKey=none; experiencePoints=none',
      'No defeat reward notification.',
    ])
    expectNoBrowserErrors(errors)
  })
})
