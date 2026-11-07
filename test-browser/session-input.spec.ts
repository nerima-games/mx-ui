import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, Array<string>>()

test.beforeEach(({ page }) => {
  const errors: Array<string> = []
  browserErrors.set(page, errors)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

const openSession = async (page: Page): Promise<void> => {
  await page.goto('/session.html')
  await page.waitForFunction(() => document.documentElement.dataset['sessionReady'] === '1')
  await expect(page.locator('[data-session-root] [data-mx-ui="mount-root"]')).toHaveCount(1)
}

test('F1 and F10 toggle their overlays and Escape dismisses one visible layer at a time', async ({ page }) => {
  // Catches an Escape handler that removes the settings layer and the inventory beneath it together.
  await openSession(page)
  const debug = page.locator('[data-mx-ui="debug-hud"]')
  const settings = page.locator('#session-root [data-mx-ui="settings"]')
  const inventory = page.locator('[data-mx-ui="inventory"]')

  await expect(debug).toBeHidden()
  await page.keyboard.press('F1')
  await expect(debug).toBeVisible()
  await page.keyboard.press('F3')
  await expect(debug).toBeVisible()
  await expect(settings).toBeHidden()
  await expect(inventory).toBeHidden()

  await page.keyboard.press('E')
  await expect(inventory).toBeVisible()
  await page.keyboard.press('F10')
  await expect(settings).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(inventory).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inventory).toBeHidden()
})

test('arrow keys move inventory focus and Enter and Space activate the same focused slot', async ({ page }) => {
  // Catches a key handler that moves its highlight without updating activation, or treats Space differently from Enter.
  await openSession(page)
  await page.keyboard.press('E')
  const focused = page.locator('[data-mx-ui="inventory"] [data-mx-ui="slot"][tabindex="0"]')

  await expect(focused).toHaveAttribute('data-slot-index', '0')
  await page.keyboard.press('ArrowRight')
  await expect(focused).toHaveAttribute('data-slot-index', '1')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-session-action="click"]')).toContainText('"index":1')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-session-action="click"]')).toContainText('"index":1')
})

test('mouse drag reports its real source and destination, and double-click activates the focused slot', async ({ page }) => {
  // Catches host input that ignores pointer-up targets or dispatches a double-click to an unrelated slot.
  await openSession(page)
  await page.keyboard.press('E')
  const source = page.locator('[data-mx-ui="inventory"] [data-region="hotbar"] [data-slot-index="0"]')
  const destination = page.locator('[data-mx-ui="inventory"] [data-region="main"] [data-slot-index="0"]')
  const sourceBox = await source.boundingBox()
  const destinationBox = await destination.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(destinationBox).not.toBeNull()
  if (sourceBox === null || destinationBox === null) {
    throw new Error('Expected visible inventory slots')
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2)
  await page.mouse.up()
  await expect(page.locator('[data-session-action="drag"]')).toContainText('"region":"hotbar"')
  await expect(page.locator('[data-session-action="drag"]')).toContainText('"region":"main"')

  const focusedHotbarSlot = page.locator(
    '[data-mx-ui="inventory"] [data-region="hotbar"] [data-mx-ui="slot"][tabindex="0"]',
  )
  const focusedBox = await focusedHotbarSlot.boundingBox()
  expect(focusedBox).not.toBeNull()
  if (focusedBox === null) {
    throw new Error('Expected the focused inventory slot to be visible')
  }
  await page.mouse.dblclick(focusedBox.x + focusedBox.width / 2, focusedBox.y + focusedBox.height / 2)
  await expect(page.locator('[data-session-action="click"]')).toContainText('"kind":"click"')
  await expect(page.locator('[data-session-action="click"]')).toContainText('"region":"hotbar"')
})

test('pointer and keyboard focus keep the hotbar ring on the focused slot', async ({ page }) => {
  // Catches the host forgetting to mirror pointer or native keyboard focus into mx-ui's focus ring.
  await openSession(page)
  const secondSlot = page.locator('[data-mx-ui="hud"] [data-mx-ui="slot"][data-slot-index="2"]')
  await secondSlot.click()
  await expect(secondSlot.locator('[data-mx-ui="slot-focus-ring"]')).toBeVisible()
  await expect(secondSlot).toHaveAttribute('tabindex', '0')

  await page.keyboard.press('Tab')
  await expect(secondSlot.locator('[data-mx-ui="slot-focus-ring"]')).toBeHidden()
})

test('key-remap conflict swaps the displaced binding and capture stops when focus leaves the row', async ({ page }) => {
  // Catches a remap that overwrites the existing Space binding or captures a key after focus moved away.
  await openSession(page)
  const jump = page.locator('[data-binding-action="jump"]')
  const sneak = page.locator('[data-binding-action="sneak"]')
  await expect(jump).toHaveText('Space')
  await expect(sneak).toHaveText('ShiftLeft')

  await sneak.click()
  await page.keyboard.press('Space')
  await expect(sneak).toHaveText('Space')
  await expect(jump).toHaveText('ShiftLeft')

  await jump.click()
  await page.locator('#unrelated-input').click()
  await page.keyboard.press('KeyQ')
  await expect(jump).toHaveText('ShiftLeft')
  await expect(sneak).toHaveText('Space')
})

test('pseudo-gamepad navigation and activation use the same UiMount inventory API', async ({ page }) => {
  // Catches a gamepad adapter that changes presentation locally instead of calling the mount navigation and activation methods.
  await openSession(page)
  await page.keyboard.press('E')

  // Playwright has no physical gamepad. Inject only this host-owned event at the session input adapter boundary.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('mx-ui:session-gamepad', { detail: { direction: 'right', kind: 'navigate' } }),
    )
    window.dispatchEvent(new CustomEvent('mx-ui:session-gamepad', { detail: { kind: 'activate' } }))
  })

  await expect(page.locator('[data-session-action="click"]')).toContainText('"index":1')
})

test('malformed gamepad details are ignored without moving inventory focus', async ({ page }) => {
  // Catches malformed host events reaching inventory navigation with an invalid or extra field.
  await openSession(page)
  await page.keyboard.press('E')
  const slotZero = page.locator(
    '[data-mx-ui="inventory"] [data-region="hotbar"] [data-mx-ui="slot"][data-slot-index="0"]',
  )
  await slotZero.focus()
  await expect(slotZero).toBeFocused()
  await expect(slotZero).toHaveAttribute('tabindex', '0')

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('mx-ui:session-gamepad', { detail: { kind: 'teleport' } }))
  })
  await expect(slotZero).toBeFocused()
  await expect(slotZero).toHaveAttribute('tabindex', '0')

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('mx-ui:session-gamepad', { detail: { direction: 'diagonal', kind: 'navigate' } }),
    )
  })
  await expect(slotZero).toBeFocused()
  await expect(slotZero).toHaveAttribute('tabindex', '0')

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('mx-ui:session-gamepad', {
        detail: { direction: 'right', index: 'not-a-number', kind: 'navigate' },
      }),
    )
  })
  await expect(slotZero).toBeFocused()
  await expect(slotZero).toHaveAttribute('tabindex', '0')

  await page.evaluate(() => {
    const detail = new Proxy({}, {
      ownKeys: () => {
        throw new Error('Unexpected gamepad detail read')
      },
    })
    window.dispatchEvent(new CustomEvent('mx-ui:session-gamepad', { detail }))
  })
  await expect(slotZero).toBeFocused()
  await expect(slotZero).toHaveAttribute('tabindex', '0')
})
