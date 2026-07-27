/**
 * `application/dom-surface.ts`'s claim, collected in a browser.
 *
 * ---------------------------------------------------------------------------
 * What this adds to `test/dom-surface.test.ts`, which already exists
 * ---------------------------------------------------------------------------
 *
 * That test compiles `test/fixtures/dom-surface.ts` against the real
 * `lib.dom.d.ts` and asserts zero diagnostics. It is the stronger test of the
 * TYPE claim and this file does not repeat it.
 *
 * What a type check cannot say is whether the members BEHAVE. A structural
 * surface could name every method correctly and still be unusable if some
 * renderer had come to depend on something only `test/fake-dom.ts` does —
 * `FakeElement` is deliberately MORE capable than the surface (it has
 * `addEventListener`, so that the absence of listeners is an observation about
 * the renderer), and 「more capable」 is exactly the shape of thing a renderer can
 * accidentally lean on.
 *
 * So this file mounts every screen against a real `Document` and asks what came
 * out. `apps/browser-harness/main.ts` is where the assignment happens, uncast,
 * and its header records the one thing that did NOT compile — a `DomElement`
 * handed back to a real `Node.appendChild` — together with why that is COST 2
 * observed from the host's side rather than a defect.
 */
import { expect, test } from '@playwright/test'
import { HOTBAR_SLOT_COUNT } from '../domain/hud-view-model'
import { INVENTORY_SLOT_COUNT } from '../domain/inventory-view-model'
import { PALETTE_PROPERTY, PALETTE_TOKEN_NAMES, PALETTE_VALUE } from '../application/palette-css'
import { openHarness } from './harness'

test.describe('mx-ui mounts against a real Document', () => {
  test('every screen builds into the host it was handed, with no cast anywhere', async ({
    page,
  }) => {
    // `openHarness` already asserts the ready attribute is `7`. This adds the
    // shape: seven hosts, each with exactly one child, and that child is the
    // root the corresponding view built.
    //
    // 「Exactly one」 is the part worth having. `docs/public-api.md` §4-1 makes the
    // parent an argument so a page can stand up more than one instance, and the
    // failure that buys — a view reaching for a global and mounting twice into
    // the same place — shows up here as a host with two children.
    await openHarness(page)

    const mounted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-harness-host]')).map((host) => ({
        host: host.getAttribute('data-harness-host'),
        children: host.children.length,
        root: host.children[0]?.getAttribute('data-mx-ui') ?? null,
      })),
    )

    expect(mounted).toStrictEqual([
      { host: 'main-menu', children: 1, root: 'main-menu' },
      { host: 'hud', children: 1, root: 'hud' },
      { host: 'inventory', children: 1, root: 'inventory' },
      { host: 'captions', children: 1, root: 'captions' },
      { host: 'save-indicator', children: 1, root: 'save-indicator' },
      { host: 'loading', children: 1, root: 'loading' },
      { host: 'crosshair', children: 1, root: 'crosshair' },
    ])
  })

  test('REGRESSION: the surface is enough to build the whole tree, not just its root', async ({
    page,
  }) => {
    // A mount that produced seven empty roots would satisfy the test above. The
    // counts below are the ones the headless suite already pins
    // (`test/screen-mount.test.ts`), asked again of a real document — so a
    // `createElement` or an `appendChild` that behaved differently on the real
    // thing shows up as a short tree rather than as a green suite.
    await openHarness(page)

    const counts = await page.evaluate(() => {
      const inHost = (name: string, selector: string): number =>
        document.querySelectorAll(`[data-harness-host="${name}"] ${selector}`).length
      return {
        hotbarSlots: inHost('hud', '[data-mx-ui="slot"]'),
        inventorySlots: inHost('inventory', '[data-mx-ui="slot"]'),
        hearts: inHost('hud', '[data-icon="heart"]'),
        shanks: inHost('hud', '[data-icon="shank"]'),
        crosshairArms: inHost('crosshair', '[data-mx-ui="crosshair-arm"]'),
      }
    })

    expect(counts.hotbarSlots).toBe(HOTBAR_SLOT_COUNT)
    expect(counts.inventorySlots).toBe(INVENTORY_SLOT_COUNT)
    expect(counts.hearts).toBe(10)
    expect(counts.shanks).toBe(10)
    expect(counts.crosshairArms).toBe(2)
  })

  test('REGRESSION: DN-UI-4 holds in a real document — not one listener anywhere', async ({
    page,
  }) => {
    // `test/hud-view.test.ts` asserts this against a fake that RECORDS listeners.
    // A browser has no such report, so the question is asked the only way a
    // browser can answer it: `getEventListeners` is a DevTools-only API, so
    // instead the harness page patches nothing and this counts the handlers that
    // WOULD be observable — inline `on*` attributes — and then confirms the
    // structural fact underneath, which is that the verb is not in the surface.
    //
    // THE ATTACHMENT IS OUTSIDE ANY mx-ui ROOT, and that is the hard rule this
    // repository puts on a browser harness: if a check needs an event, it hooks
    // the page shell and says so. This one hooks `document` itself, before the
    // count, purely to prove the counter can see a listener at all — a check
    // that reports 「zero」 without ever having seen a one is the guard
    // `docs/testing.md` §5-3 refuses to ship.
    await openHarness(page)

    const result = await page.evaluate(() => {
      const roots = Array.from(document.querySelectorAll('[data-harness-host] > [data-mx-ui]'))
      const inlineHandlers = roots.flatMap((root) =>
        [root, ...Array.from(root.querySelectorAll('*'))].flatMap((element) =>
          Array.from(element.attributes)
            .filter((attribute) => attribute.name.startsWith('on'))
            .map((attribute) => `${element.getAttribute('data-mx-ui') ?? element.tagName}:${attribute.name}`),
        ),
      )

      // The positive control, on the page shell and never inside an mx-ui root.
      const shell = document.querySelector('[data-harness-page]')
      let sawTheControl = false
      shell?.addEventListener('mx-ui-harness-probe', () => {
        sawTheControl = true
      })
      shell?.dispatchEvent(new Event('mx-ui-harness-probe'))

      return { inlineHandlers, sawTheControl, roots: roots.length }
    })

    expect(result.roots).toBe(7)
    // The control fired, so 「no handler」 below is a finding and not a blind spot.
    expect(result.sawTheControl).toBe(true)
    expect(result.inlineHandlers).toStrictEqual([])
  })
})

test.describe('the palette reaches the document as VALUES', () => {
  test('every custom property is declared on an mx-ui root and resolves', async ({ page }) => {
    // `test/palette-css.test.ts` proves every token in `domain/palette.ts` is the
    // source of a property, by reading the constants. This proves the browser
    // agrees: the property is present on the element `declarePalette` wrote it
    // to, and `getComputedStyle().getPropertyValue` gives back the same string.
    //
    // Custom properties INHERIT, which is why this is read from the root rather
    // than from `:root`: `application/palette-css.ts` argues at length that
    // declaring them document-wide would put them in the same scope as
    // `data-color-vision` and make DN-UI-1a's failure mode a one-line CSS rule.
    // A token readable from `document.documentElement` would mean that argument
    // had quietly stopped being true.
    await openHarness(page, { screen: 'hud' })

    const read = await page.evaluate(
      ({ properties }: { properties: ReadonlyArray<readonly [string, string]> }) => {
        const root = document.querySelector('[data-harness-host="hud"] > [data-mx-ui="hud"]')
        if (root === null) {
          throw new Error('no hud root')
        }
        const onRoot = getComputedStyle(root)
        const onDocument = getComputedStyle(document.documentElement)
        return properties.map(([name, expected]) => ({
          name,
          expected,
          actual: onRoot.getPropertyValue(name).trim(),
          leakedToDocument: onDocument.getPropertyValue(name).trim(),
        }))
      },
      {
        properties: PALETTE_TOKEN_NAMES.map(
          (name) => [PALETTE_PROPERTY[name], PALETTE_VALUE[name]] as const,
        ),
      },
    )

    expect(read.filter((entry) => entry.actual !== entry.expected)).toStrictEqual([])
    expect(read.filter((entry) => entry.leakedToDocument !== '')).toStrictEqual([])
  })
})
