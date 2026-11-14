/**
 * A slot's icon wrapper must stop taking space once its icon is gone.
 *
 * `createIconWrapper` gives the wrapper both the `hidden` attribute and an
 * inline `display`, and `clearSlotIcon` toggles only `hidden` and `src`. The
 * headless fake DOM cannot tell whether `hidden` still hides the box, so these
 * cases measure the wrapper's layout box in a real browser after each
 * transition the HUD re-render can drive through `updateSlotElement`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const slotElementModule = `/@fs${fileURLToPath(
  new URL('../src/application/slot-element.ts', import.meta.url),
)}`
const itemIconModule = `/@fs${fileURLToPath(
  new URL('../src/domain/item-icon.ts', import.meta.url),
)}`
const uiLocalizationModule = `/@fs${fileURLToPath(
  new URL('../src/application/ui-localization.ts', import.meta.url),
)}`
const itemSurfaceFixtureModule = `/@fs${fileURLToPath(
  new URL('../apps/browser-harness/ui1-item-surface-fixture.ts', import.meta.url),
)}`

const ICON_URL = 'https://items.test/apple.svg'
/** `ICON_EDGE_PIXELS` in `src/application/slot-element.ts`; a `url` icon fills it in both axes. */
const ICON_EDGE_PIXELS = 16
const RENDER_SLOT_KEY = '__mxUiSlotIconProbeRender'

/**
 * `resolved`: apple, whose icon the fixture resolver returns.
 * `unresolved`: bone, for which the same resolver fails with `ItemIconUnavailable`.
 * `empty`: no item at all.
 */
type SlotState = 'resolved' | 'unresolved' | 'empty'

const mountSlot = async (page: Page): Promise<Locator> => {
  await page.route(ICON_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="#df5548"/></svg>',
  }))
  await page.goto('/session.html')
  await page.waitForFunction(() => document.documentElement.dataset['sessionReady'] === '1')

  await page.evaluate(async ({ slotPath, iconPath, localizationPath, fixturePath, iconUrl, renderKey }) => {
    const [
      { createSlotElement, updateSlotElement },
      { itemIconView },
      { applyUiLanguage },
      { createUi1ItemIconResolver },
    ] = await Promise.all([
      import(slotPath),
      import(iconPath),
      import(localizationPath),
      import(fixturePath),
    ])

    const host = document.createElement('div')
    host.setAttribute('data-slot-icon-probe', '')
    document.body.prepend(host)
    applyUiLanguage(host, 'en')

    const slot = createSlotElement(document, 0)
    host.appendChild(slot.root)
    const resolver = createUi1ItemIconResolver(iconUrl)

    const viewFor = (state: string): Record<string, unknown> => {
      const base = { countLabel: undefined, durabilityPercent: undefined, index: 0, selected: false }
      if (state === 'empty') {
        return { ...base, empty: true, itemId: undefined }
      }
      const itemId = state === 'resolved' ? 'apple' : 'bone'
      return { ...base, empty: false, itemIcon: itemIconView(itemId, resolver), itemId }
    }

    Reflect.set(globalThis, renderKey, (state: string): void => {
      const result = updateSlotElement(slot, viewFor(state))
      // Only effect's Failure carries an own `failure` field.
      if (Object.hasOwn(result, 'failure')) {
        throw new Error(`updateSlotElement rejected the ${state} view: ${JSON.stringify(result.failure)}`)
      }
    })
  }, {
    slotPath: slotElementModule,
    iconPath: itemIconModule,
    localizationPath: uiLocalizationModule,
    fixturePath: itemSurfaceFixtureModule,
    iconUrl: ICON_URL,
    renderKey: RENDER_SLOT_KEY,
  })

  return page.locator('[data-slot-icon-probe] [data-mx-ui="slot"] [data-mx-ui="slot-icon"]')
}

const renderSlot = async (page: Page, state: SlotState): Promise<void> => {
  await page.evaluate(({ renderKey, next }) => {
    const render: unknown = Reflect.get(globalThis, renderKey)
    if (typeof render !== 'function') {
      throw new Error('Expected the slot probe to be mounted')
    }
    render(next)
  }, { renderKey: RENDER_SLOT_KEY, next: state })
}

/** The wrapper's layout size; a box that is not rendered at all occupies 0x0. */
const occupiedSize = async (icon: Locator): Promise<Readonly<{ width: number; height: number }>> => {
  const box = await icon.boundingBox()
  if (box === null) {
    return { width: 0, height: 0 }
  }
  return { width: box.width, height: box.height }
}

const expectIconShown = async (icon: Locator): Promise<void> => {
  await expect(icon).not.toHaveAttribute('hidden')
  await expect(icon).toBeVisible()
  expect(await occupiedSize(icon)).toEqual({ width: ICON_EDGE_PIXELS, height: ICON_EDGE_PIXELS })
}

const expectIconGone = async (icon: Locator): Promise<void> => {
  // The attribute assertion separates "the code did not ask to hide it" from
  // "it asked, and the layout ignored the request".
  await expect(icon).toHaveAttribute('hidden', '')
  await expect(icon).toBeHidden()
  expect(await occupiedSize(icon)).toEqual({ width: 0, height: 0 })
}

test.describe('slot icon wrapper visibility across re-renders', () => {
  test('a resolved icon is hidden and takes no space once the slot becomes empty', async ({ page }) => {
    const icon = await mountSlot(page)
    await renderSlot(page, 'resolved')
    await expectIconShown(icon)

    await renderSlot(page, 'empty')
    await expectIconGone(icon)
  })

  test('a resolved icon is hidden and takes no space once the next item icon fails to resolve', async ({ page }) => {
    const icon = await mountSlot(page)
    await renderSlot(page, 'resolved')
    await expectIconShown(icon)

    await renderSlot(page, 'unresolved')
    await expectIconGone(icon)
  })

  test('an icon resolved again after being cleared is shown at its icon size', async ({ page }) => {
    const icon = await mountSlot(page)
    await renderSlot(page, 'resolved')
    await renderSlot(page, 'empty')
    await renderSlot(page, 'resolved')
    await expectIconShown(icon)

    await renderSlot(page, 'unresolved')
    await renderSlot(page, 'resolved')
    await expectIconShown(icon)
  })
})
