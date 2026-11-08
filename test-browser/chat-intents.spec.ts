import { expect, test } from '@playwright/test'
import { openHarness } from './harness'

test('global T and Escape control chat and slash submissions reach the host', async ({ page }) => {
  await openHarness(page, { screen: 'chat', scenario: 'keyboard-intents', panel: true })

  const host = page.locator(
    '[data-harness-host="chat"][data-harness-scenario="keyboard-intents"]',
  )
  const chat = host.locator('[data-mx-ui="chat"]')
  const history = chat.locator('[data-mx-ui="chat-history"]')
  const form = chat.locator('[data-mx-ui="chat-form"]')
  const input = chat.locator('input[data-mx-ui="chat-input"]')
  const intentOutput = page.getByTestId('diagnostics-intents')

  await expect(history).toContainText('Welcome to chat')
  await expect(form).toBeHidden()
  await page.keyboard.press('t')
  await expect(form).toBeVisible()
  await expect(input).toBeFocused()

  await page.keyboard.type('/time set noon')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
  expect(JSON.parse((await intentOutput.textContent()) ?? 'null')).toEqual([
    {
      sequence: 1,
      intent: { _tag: 'ChatSubmission', kind: 'command', command: 'time set noon' },
    },
  ])

  await page.keyboard.press('Escape')
  await expect(form).toBeHidden()
  await expect(history).toContainText('Welcome to chat')
})
