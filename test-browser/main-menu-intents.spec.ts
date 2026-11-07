import { expect, test } from '@playwright/test'
import { openHarness } from './harness'

test('main-menu host actions log their tagged payloads', async ({ page }) => {
  // Catches main-menu host callbacks that are still wired to fixture no-ops.
  await openHarness(page, { screen: 'main-menu', scenario: 'load-world-one', panel: true })

  const activeHost = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="load-world-one"]',
  )
  const intentOutput = page.getByTestId('diagnostics-intents')

  await activeHost.locator('[data-mx-ui="menu-world-row"][data-session-id="world-one"]').click()
  await activeHost.locator('[data-menu-panel="load-world"] [data-menu-action="back"]').click()
  await activeHost.locator('[data-menu-entry="settings"]').click()
  await activeHost.locator('[data-menu-entry="new-world"]').click()
  await activeHost.locator('input[data-mx-ui="menu-world-name"]').fill('Misty Highlands')
  await activeHost.locator('[data-menu-panel="new-world"] [data-mx-ui="menu-game-mode"]').click()
  await activeHost.locator('[data-menu-panel="new-world"] [data-menu-action="confirm"]').click()

  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    {
      sequence: 1,
      intent: { _tag: 'LoadWorld', sessionId: 'world-one', name: 'First world' },
    },
    { sequence: 2, intent: { _tag: 'OpenSettings' } },
    {
      sequence: 3,
      intent: { _tag: 'CreateWorld', mode: 'creative', name: 'Misty Highlands' },
    },
  ])
})
