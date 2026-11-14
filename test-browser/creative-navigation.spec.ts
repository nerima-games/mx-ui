import { expect, type Locator, type Page, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const creativeInventoryViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/creative-inventory-view.ts', import.meta.url),
)}`

type ItemBox = Readonly<{ itemId: string; x: number; y: number }>

const focusedItemBox = async (page: Page): Promise<ItemBox> => {
  const box = await page.evaluate(() => {
    const active = document.activeElement
    const itemId = active?.getAttribute('data-item-id')
    if (active === null || typeof itemId !== 'string') {
      return null
    }
    const rect = active.getBoundingClientRect()
    return { itemId, x: rect.x, y: rect.y }
  })
  if (box === null) {
    throw new Error('Expected a focused creative item')
  }
  return box
}

/**
 * Focus the first item, press ArrowRight once per remaining item plus one more
 * (which must not move past the row end), and return every focused position.
 */
const walkRight = async (page: Page, first: Locator, itemCount: number): Promise<ReadonlyArray<ItemBox>> => {
  await first.focus()
  const start = [await focusedItemBox(page)]
  return Array.from({ length: itemCount }).reduce<Promise<ReadonlyArray<ItemBox>>>(
    async (previous) => {
      const visited = await previous
      await page.keyboard.press('ArrowRight')
      return [...visited, await focusedItemBox(page)]
    },
    Promise.resolve(start),
  )
}

const expectLeftToRightRow = (visited: ReadonlyArray<ItemBox>): void => {
  const [first] = visited
  if (typeof first === 'undefined') {
    throw new Error('Expected at least one visited item')
  }
  for (const [index, box] of visited.entries()) {
    expect(box.y).toBe(first.y)
    const previous = visited[index - 1]
    if (typeof previous !== 'undefined' && previous.itemId !== box.itemId) {
      expect(box.x).toBeGreaterThan(previous.x)
    }
  }
}

test('creative inventory arrow navigation follows the visible grid after search and category changes', async ({ page }) => {
  await page.goto('/session.html')
  await page.waitForFunction(() => document.documentElement.dataset['sessionReady'] === '1')

  await page.evaluate(async ({ creativePath }) => {
    const root = document.querySelector<HTMLElement>('#session-root')
    const mountedUi = root?.querySelector<HTMLElement>('[data-mx-ui="mount-root"]')
    if (root === null || mountedUi === null || typeof mountedUi === 'undefined') {
      throw new Error('Expected the mounted session UI root')
    }
    mountedUi.setAttribute('hidden', '')

    const fixture = document.createElement('main')
    fixture.setAttribute('data-creative-navigation', '')
    fixture.style.setProperty('box-sizing', 'border-box')
    fixture.style.setProperty('margin', '20px auto')
    fixture.style.setProperty('max-width', '900px')
    fixture.style.setProperty('padding', '16px')
    root.appendChild(fixture)

    const { createCreativeInventoryView } = await import(creativePath)
    createCreativeInventoryView(document, fixture)
  }, { creativePath: creativeInventoryViewModule })

  const creative = page.locator('[data-creative-navigation] [data-mx-ui="creative-inventory"]')
  await expect(creative).toBeVisible()
  const search = creative.locator('[data-mx-ui="creative-search"]')
  const item = (itemId: string): Locator =>
    creative.locator(`[data-mx-ui="creative-item"][data-item-id="${itemId}"]`)
  const visibleItems = creative.locator('[data-mx-ui="creative-item"]:visible')

  await search.fill('book')
  await expect(visibleItems).toHaveCount(5)
  const bookWalk = await walkRight(page, item('bookshelf'), 5)
  expect(bookWalk.map(({ itemId }) => itemId)).toEqual([
    'bookshelf',
    'enchanted_book',
    'book',
    'written_book',
    'writable_book',
    'writable_book',
  ])
  expectLeftToRightRow(bookWalk)

  await creative.locator('[data-mx-ui="creative-category"][data-category="redstone"]').click()
  await search.fill('stone')
  await expect(visibleItems).toHaveCount(7)
  const redstoneWalk = await walkRight(page, item('redstone_block'), 7)
  expect(redstoneWalk.map(({ itemId }) => itemId)).toEqual([
    'redstone_block',
    'redstone_torch',
    'stone_button',
    'redstone_lamp',
    'redstone_dust',
    'redstone_ore',
    'deepslate_redstone_ore',
    'deepslate_redstone_ore',
  ])
  expectLeftToRightRow(redstoneWalk)
})
