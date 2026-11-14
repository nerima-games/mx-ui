import { expect, test, type Locator, type Page } from '@playwright/test'
import { openHarness } from './harness'

const tabUntilFocused = async (
  page: Page,
  target: Locator,
  maxTabs = 32,
): Promise<void> => {
  const focusByTab = async (remainingTabs: number): Promise<void> => {
    const focused = await target.evaluate((element) => element === document.activeElement)
    if (focused) {
      return
    }
    if (remainingTabs === 0) {
      await expect(target).toBeFocused()
      return
    }
    await page.keyboard.press('Tab')
    await focusByTab(remainingTabs - 1)
  }

  await focusByTab(maxTabs)
}

test('main-menu world actions emit host intents with their typed payloads', async ({ page }) => {
  await openHarness(page, { screen: 'main-menu', scenario: 'host-intents', panel: true })

  const activeHost = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="host-intents"]',
  )
  const intentOutput = page.getByTestId('diagnostics-intents')

  await activeHost.locator('[data-menu-entry="single-player"]').click()

  const world = activeHost.locator(
    '[data-mx-ui="menu-world-row-container"][data-session-id="world-one"]',
  )
  await expect(world).toBeVisible()
  await world.locator('[data-mx-ui="menu-world-row"]').click()
  await world.locator('[data-mx-ui="menu-world-export"]').click()

  await world.locator('[data-mx-ui="menu-world-delete"]').click()
  const confirmWorldDelete = world.locator('[data-mx-ui="menu-world-delete-confirm"]')
  const cancelWorldDelete = world.locator('[data-mx-ui="menu-world-delete-cancel"]')
  await expect(confirmWorldDelete).toBeVisible()
  await cancelWorldDelete.click()
  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    { sequence: 1, intent: { _tag: 'LoadWorld', sessionId: 'world-one', name: 'First world' } },
    { sequence: 2, intent: { _tag: 'ExportWorld', sessionId: 'world-one', name: 'First world' } },
  ])

  await world.locator('[data-mx-ui="menu-world-delete"]').click()
  await world.locator('[data-mx-ui="menu-world-delete-confirm"]').click()

  const unreadable = activeHost.locator(
    '[data-mx-ui="menu-unreadable-row"][data-save-key="broken-save"]',
  )
  await expect(unreadable).toBeVisible()
  await expect(unreadable.locator('[data-mx-ui="menu-unreadable-detail"]')).toContainText(
    'mc-save 4 · unsupported header',
  )
  await unreadable.locator('[data-mx-ui="menu-unreadable-delete"]').click()
  const confirmUnreadableDelete = unreadable.locator('[data-mx-ui="menu-unreadable-delete-confirm"]')
  await expect(confirmUnreadableDelete).toBeVisible()
  await unreadable.locator('[data-mx-ui="menu-unreadable-delete-cancel"]').click()
  await unreadable.locator('[data-mx-ui="menu-unreadable-delete"]').click()
  await unreadable.locator('[data-mx-ui="menu-unreadable-delete-confirm"]').click()

  await activeHost.locator('[data-mx-ui="menu-back"]').click()
  await activeHost.locator('[data-menu-entry="settings"]').click()
  await activeHost.locator('[data-menu-entry="single-player"]').click()
  await activeHost.locator('[data-mx-ui="menu-new-world"]').click()
  await activeHost.locator('input[data-mx-ui="menu-world-name"]').fill('Misty Highlands')
  await activeHost.locator('input[data-mx-ui="menu-world-seed"]').fill('8675309')

  const mode = activeHost.locator('[data-mx-ui="menu-game-mode"]')
  const difficulty = activeHost.locator('[data-mx-ui="menu-difficulty"]')
  const worldType = activeHost.locator('[data-mx-ui="menu-world-type"]')
  await mode.click()
  await difficulty.click()
  await worldType.click()
  await expect(mode).toHaveText('Creative')
  await expect(difficulty).toHaveText('Hard')
  await expect(worldType).toContainText('Amplified')
  await activeHost.locator('[data-menu-panel="new-world"] [data-menu-action="confirm"]').click()

  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    { sequence: 1, intent: { _tag: 'LoadWorld', sessionId: 'world-one', name: 'First world' } },
    { sequence: 2, intent: { _tag: 'ExportWorld', sessionId: 'world-one', name: 'First world' } },
    { sequence: 3, intent: { _tag: 'DeleteWorld', sessionId: 'world-one', name: 'First world' } },
    {
      sequence: 4,
      intent: {
        _tag: 'DeleteUnreadableSave',
        key: 'broken-save',
        format: 'mc-save',
        version: 4,
        reason: 'unsupported header',
        record: { _tag: 'Save', key: 'broken-save' },
        repair: { lastHealthyRevisionAvailable: false, discardableChunkKeys: [] },
      },
    },
    { sequence: 5, intent: { _tag: 'OpenSettings' } },
    {
      sequence: 6,
      intent: {
        _tag: 'CreateWorld',
        name: 'Misty Highlands',
        seed: { kind: 'fixed', value: 8675309 },
        mode: 'creative',
        difficulty: 'hard',
        worldType: 'amplified',
      },
    },
  ])
})

test('hides world-type controls when the host provides no choices', async ({ page }) => {
  await openHarness(page, { screen: 'main-menu', scenario: 'new-world-survival', panel: true })

  const host = page.locator(
    '[data-harness-host="main-menu"][data-harness-scenario="new-world-survival"]',
  )
  await expect(host.locator('[data-menu-field="world-type"]')).toBeHidden()
  await expect(host.locator('[data-mx-ui="menu-world-type"]')).toBeHidden()
  const actions = [
    host.locator('[data-mx-ui="menu-back-worlds"]'),
    host.locator('[data-mx-ui="menu-create-world"]'),
  ]
  const fitsInMenu = await Promise.all(actions.map(async (action) => {
    await expect(action).toBeVisible()
    return action.evaluate((element) => {
      const content = element.closest('[data-mx-ui="menu-content"]')
      if (content === null) {
        return false
      }
      const bounds = element.getBoundingClientRect()
      const contentBounds = content.getBoundingClientRect()
      return bounds.top >= contentBounds.top && bounds.bottom <= contentBounds.bottom
    })
  }))
  expect(fitsInMenu).toEqual([true, true])
})

test('restores keyboard focus when returning from world creation and the world list', async ({ page }) => {
  await openHarness(page, { screen: 'main-menu', scenario: 'host-intents', panel: true })

  const host = page.locator('[data-harness-host="main-menu"][data-harness-scenario="host-intents"]')
  const singlePlayer = host.locator('[data-menu-entry="single-player"]')
  const newWorld = host.locator('[data-mx-ui="menu-new-world"]')
  const createWorld = host.locator('input[data-mx-ui="menu-world-name"]')
  const backToWorlds = host.locator('[data-mx-ui="menu-back-worlds"]')
  const backToRoot = host.locator('[data-mx-ui="menu-back"]')

  await expect(singlePlayer).not.toBeFocused()
  await tabUntilFocused(page, singlePlayer)
  await page.keyboard.press('Enter')
  await expect(host.locator('[data-menu-panel="load-world"]')).toBeVisible()
  await expect(newWorld).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(host.locator('[data-menu-panel="new-world"]')).toBeVisible()
  await expect(createWorld).toBeFocused()

  await tabUntilFocused(page, backToWorlds)
  await page.keyboard.press('Enter')
  await expect(host.locator('[data-menu-panel="load-world"]')).toBeVisible()
  await expect(newWorld).toBeFocused()

  await tabUntilFocused(page, backToRoot)
  await page.keyboard.press('Enter')
  await expect(host.locator('[data-menu-panel="root"]')).toBeVisible()
  await expect(singlePlayer).toBeFocused()
})
