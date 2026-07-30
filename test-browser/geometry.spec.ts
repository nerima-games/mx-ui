/**
 * LAYOUT — `docs/testing.md` §4's first unproved item, and the half of
 * `docs/e2e-triage.md` #34 that no repository could answer.
 *
 * ---------------------------------------------------------------------------
 * WHAT #34 ASKED FOR, AND WHY THE 48 IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * #34 is `mobile-touch-controls.e2e.ts` 「controls fit the safe viewport and
 * expose touch-sized targets」. Its subject is `[data-touch-control]`: seven
 * free-standing on-screen buttons, each asserted `>= 48 x 48` and inside the
 * viewport. The triage split it in two, moved the ownership to mc-render on a
 * measurement rather than an intuition (mc-render's `dom-surface.ts` has
 * `addEventListener`; this one deliberately does not, DN-UI-4), and left the
 * layout half open with 「どちらにせよブラウザが要る」.
 *
 * **The browser is here now and the layout half still cannot be closed, for a
 * different reason than the one on record.** It is not that nobody could
 * measure the controls. It is that NOBODY BUILDS THEM:
 *
 *   - mx-ui builds elements and has no touch controls. It never did; the triage
 *     is right that `[data-touch-control]` is outside its vocabulary.
 *   - mc-render owns the tap and resolves it by `event.target` identity — but
 *     its `application/dom-surface.ts` has no `createElement` and no `style` at
 *     all. It BINDS controls; it cannot make one.
 *
 * So the elements #34 measures are the host's, and the host is mc-compose's
 * browser entry point. The row stays open, its reason changes from 「ブラウザが
 * 要る」 to 「誰も要素を作っていない」, and that is a sharper thing to be blocked on
 * because it names a missing owner rather than a missing tool.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ANSWERED HERE INSTEAD — and it found two defects
 * ---------------------------------------------------------------------------
 *
 * The question #34 is really asking is 「can a player on a phone reach and hit
 * the things this UI puts in front of them」, and mx-ui HAS one such thing: the
 * hotbar, which `test/accessibility-gate.test.ts` establishes is the only
 * focusable element in the repository. Asked of it, in a browser, at the two
 * widths `docs/e2e-triage.md` §3.6 names, the answer on the day this file was
 * written was NO, twice over:
 *
 *   - a hotbar slot rendered **43.3 x 4** (35.6 x 4 at 320px), because a slot's
 *     spans are empty until mc-sim supplies an item and nothing declared a
 *     height. `SLOT_TARGET_MIN_SIZE` is the fix and its comment is the record.
 *   - the nine slots rendered as **a vertical column of full-width bars**, 254px
 *     tall, because `application/hud-view.ts` never declared the grid that
 *     `application/inventory-view.ts` declares for the same nine slots on the
 *     inventory screen. One repository, two answers.
 *
 * Neither is visible to `test/fake-dom.ts`, which is the point of this file.
 * Both are pinned below.
 */
import { expect, test } from '@playwright/test'
import { HOTBAR_SLOT_COUNT } from '../domain/hud-view-model'
import { SLOT_TARGET_MIN_SIZE } from '../application/slot-element'
import { CROSSHAIR_ARM_HIT_WEIGHT, CROSSHAIR_SIZE } from '../application/crosshair-view'
import { NARROW_VIEWPORTS, openHarness } from './harness'

/**
 * WCAG 2.2 §2.5.8, Target Size (Minimum): 24 by 24 CSS pixels.
 *
 * Derived from `SLOT_TARGET_MIN_SIZE` rather than written as `24`, so the test
 * follows the constant. That is the same call `test/screen-mount.test.ts` makes
 * in the OTHER direction when it insists on a literal `27` for the inventory
 * grid — and the difference is instructive. There, deriving from the constant
 * would let the grid shrink and keep the test green, because the renderer counts
 * with the same constant. Here the constant is a FLOOR the renderer declares and
 * the browser measures independently: if somebody lowers it, the number this
 * repository promises has changed and the promise is what the test is about.
 */
const TARGET_MIN_PX = Number.parseFloat(SLOT_TARGET_MIN_SIZE)

/** The emulated notch. See `apps/browser-harness/main.ts` on why it is emulated. */
const SAFE_INSET_PX = 44

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const insideRect = (box: Box, rect: Box): boolean =>
  box.x >= rect.x - 0.5 &&
  box.y >= rect.y - 0.5 &&
  box.x + box.width <= rect.x + rect.width + 0.5 &&
  box.y + box.height <= rect.y + rect.height + 0.5

test.describe('the hotbar is a ROW of reachable targets', () => {
  for (const viewport of NARROW_VIEWPORTS) {
    test(`REGRESSION: hotbar slots are one row of >= ${String(TARGET_MIN_PX)}px targets at ${String(viewport.width)}px`, async ({
      page,
    }) => {
      // The port of `hud.e2e.ts` 「HUD remains usable at ${viewport.width}px」's
      // layout half, which `docs/e2e-triage.md` §3.6 recorded as unported with
      // 「レイアウト側(320px で収まるか、crosshair が中央か)は移植していない —
      // ブラウザが要る」. The other half of that test — the accessible names on
      // the vitals rows — was ported headlessly and is the one assertion mx-ui
      // answered NO to; this is its sibling and it also answered NO.
      await page.setViewportSize(viewport)
      await openHarness(page, { screen: 'hud' })

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-harness-host="hud"]')
        const box = (element: Element): Box => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        const slots = Array.from(host?.querySelectorAll('[data-mx-ui="slot"]') ?? [])
        return {
          slots: slots.map(box),
          // ONE row: every slot shares a top edge. This is what caught the
          // column, and it catches it in a way a height assertion would not —
          // nine stacked bars each clearing 24px would satisfy a size check
          // completely.
          distinctTops: new Set(slots.map((slot) => Math.round(slot.getBoundingClientRect().y))).size,
        }
      })

      expect(measured.slots).toHaveLength(HOTBAR_SLOT_COUNT)
      expect(measured.distinctTops, 'the nine hotbar slots are not on one row').toBe(1)

      const undersized = measured.slots
        .map((slot, index) => ({ index, ...slot }))
        .filter((slot) => slot.width < TARGET_MIN_PX || slot.height < TARGET_MIN_PX)
        .map(
          (slot) =>
            `slot ${String(slot.index)}: ${slot.width.toFixed(1)} x ${slot.height.toFixed(1)}`,
        )
      expect(undersized).toStrictEqual([])
    })
  }

  test(`REGRESSION: nine ${String(TARGET_MIN_PX)}px targets still fit the narrowest supported viewport`, async () => {
    // Arithmetic, and it is the reason the floor is 24 and not the 48 of #34.
    // Nine 48px slots need 432px and the narrowest viewport the triage names is
    // 320. A floor nobody can satisfy is a floor somebody deletes, so the number
    // is checked against the constraint here rather than discovered by a red
    // build on a phone.
    const narrowest = Math.min(...NARROW_VIEWPORTS.map((viewport) => viewport.width))
    expect(HOTBAR_SLOT_COUNT * TARGET_MIN_PX).toBeLessThanOrEqual(narrowest)
    expect(HOTBAR_SLOT_COUNT * 48).toBeGreaterThan(narrowest)
  })
})

test.describe('the keyboard focus ring is a ring, and not merely an element', () => {
  test('REGRESSION: the ring has area, covers its slot, and only its slot', async ({ page }) => {
    // `docs/testing.md` §4 named this exactly: 「フォーカスリングがスロットの上に
    // 見えるか(`outline` と `box-shadow` の重なり順)も…レイアウトの問いである」.
    //
    // The headless suite asserts the ring element is not `hidden`
    // (`test/screen-mount.test.ts`: 「the selection is the GAME's answer and the
    // ring is the KEYBOARD's」), which was TRUE and insufficient: measured, the
    // ring was `386 x 0`. It is an `inset: 0` overlay and an absolutely
    // positioned box resolves against its containing block's PADDING box, which
    // was zero tall. A visible element with no area is what 「the ring reaches an
    // element」 and 「the player can see where the keyboard is」 look like when
    // they come apart.
    await page.setViewportSize(NARROW_VIEWPORTS[1])
    await openHarness(page, { screen: 'hud' })

    const rings = await page.evaluate(() => {
      const host = document.querySelector('[data-harness-host="hud"]')
      const slots = Array.from(host?.querySelectorAll('[data-mx-ui="slot"]') ?? [])
      return slots.map((slot, index) => {
        const ring = slot.querySelector('[data-mx-ui="slot-focus-ring"]')
        const slotBox = slot.getBoundingClientRect()
        const ringBox = ring?.getBoundingClientRect()
        return {
          index,
          visible: ring !== null && !ring.hasAttribute('hidden'),
          selected: slot.hasAttribute('data-selected'),
          tabStop: slot.getAttribute('tabindex') === '0',
          ringArea: ringBox === undefined ? 0 : ringBox.width * ringBox.height,
          insideSlot:
            ringBox !== undefined &&
            ringBox.x >= slotBox.x &&
            ringBox.y >= slotBox.y &&
            ringBox.x + ringBox.width <= slotBox.x + slotBox.width + 0.5 &&
            ringBox.y + ringBox.height <= slotBox.y + slotBox.height + 0.5,
        }
      })
    })

    // `apps/browser-harness/screens.ts` focuses slot 4 and `spawnSnapshot`
    // selects slot 0, which is the arrangement `domain/palette.ts` keeps
    // `FOCUS_RING` and `SLOT_SELECTED` apart in order to make possible: 「a
    // player who is navigating by keyboard is asking both at once」.
    const visible = rings.filter((ring) => ring.visible)
    expect(visible.map((ring) => ring.index)).toStrictEqual([4])
    expect(rings.filter((ring) => ring.selected).map((ring) => ring.index)).toStrictEqual([0])
    expect(rings.filter((ring) => ring.tabStop).map((ring) => ring.index)).toStrictEqual([4])

    // THE ASSERTION THAT WAS RED. A ring with zero area is drawn and invisible.
    for (const ring of visible) {
      expect(ring.ringArea, `the ring on slot ${String(ring.index)} has no area`).toBeGreaterThan(0)
      expect(ring.insideSlot, `the ring on slot ${String(ring.index)} is not on its slot`).toBe(true)
    }
  })

  test('REGRESSION: the `weight` distinguisher is a real number of pixels', async ({ page }) => {
    // `domain/palette.ts` declares `slot selected / slot border` as
    // `alsoDistinguishedBy: ['weight']` and G3 insists that is 「belt AND
    // braces」 rather than an excuse for a weak colour pair. The headless suite
    // can only check that two different `border-width` STRINGS were written.
    // Whether the browser draws two different thicknesses is this file's
    // question, and it stopped being obvious when the slot was four pixels tall
    // and the border was the whole slot.
    await page.setViewportSize(NARROW_VIEWPORTS[1])
    await openHarness(page, { screen: 'hud' })

    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-harness-host="hud"] [data-mx-ui="slot"]')).map(
        (slot) => ({
          selected: slot.hasAttribute('data-selected'),
          border: Number.parseFloat(getComputedStyle(slot).borderTopWidth),
          content: slot.getBoundingClientRect().height,
        }),
      ),
    )

    const selected = widths.filter((slot) => slot.selected)
    const plain = widths.filter((slot) => !slot.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0]?.border).toBeGreaterThan(plain[0]?.border ?? 0)
    // And the frame is a frame around something, rather than the something.
    // A border thicker than a third of the box is a bar, not an outline.
    for (const slot of widths) {
      expect(slot.border * 3).toBeLessThan(slot.content)
    }
  })
})

test.describe('reduced motion removes the animation and keeps the signal', () => {
  test('REGRESSION: a hit is still a heavier reticle when the scale is suppressed', async ({
    page,
  }) => {
    // `application/crosshair-view.ts`'s claim, in used pixels rather than in
    // written strings: 「a hit is a heavier mark ALWAYS, and additionally a scale
    // when motion is allowed. Nobody loses the signal; some people also get the
    // animation」. It is the same mistake the reference makes with its frozen
    // loading bar — the accessible path silently losing information instead of
    // carrying it differently — and `domain/accessibility.ts` is explicit that
    // reduced motion is 「せっかちな人のためではなく、乗り物酔いする人のため」.
    //
    // The headless suite pins the two `writeStyle` calls. What it cannot pin is
    // that the browser RESOLVES them to different thicknesses: `4px` written
    // into a `width` is a string until a layout engine uses it, and the arm is
    // the one element in this repository whose entire meaning is its thickness.
    // TWO DIFFERENT MEASUREMENTS, and the first draft conflated them.
    //
    // `declared` is the used value of the thickness property — what the engine
    // resolved `4px` to before anything was transformed. `rendered` is
    // `getBoundingClientRect`, which is POST-TRANSFORM. Under full motion the
    // arms measure 5.8 rather than 4, because the hit pulse scales the mark by
    // 1.45 and the box comes back scaled with it.
    //
    // Asserting the two runs were identical failed, correctly. The claim was
    // never that the reticle LOOKS the same with the animation off — it is that
    // the WEIGHT, which is the declared `Distinguisher`, is the same either way,
    // and the scale is an addition on top for the people who can have it.
    const reticle = async (motion: 'full' | 'reduced'): Promise<{
      readonly declared: ReadonlyArray<number>
      readonly rendered: ReadonlyArray<number>
      readonly transform: string
      readonly progressHidden: boolean
      readonly progressTransform: string
    }> => {
      await openHarness(page, { screen: 'crosshair', motion })
      return await page.evaluate(() => {
        const host = document.querySelector('[data-harness-host="crosshair"]')
        const arms = Array.from(host?.querySelectorAll('[data-mx-ui="crosshair-arm"]') ?? [])
        const mark = host?.querySelector('[data-mx-ui="crosshair-mark"]') ?? null
        const progress = host?.querySelector('[data-mx-ui="crosshair-progress"]') ?? null
        // The thickness axis: the vertical arm is thin in width, the horizontal
        // one in height, so the smaller of the two is the weight either way.
        const thinner = (width: string, height: string): number =>
          Math.min(Number.parseFloat(width), Number.parseFloat(height))
        return {
          declared: arms.map((arm) => {
            const computed = getComputedStyle(arm)
            return thinner(computed.width, computed.height)
          }),
          rendered: arms.map((arm) => {
            const rect = arm.getBoundingClientRect()
            return Math.min(rect.width, rect.height)
          }),
          transform: mark === null ? '' : getComputedStyle(mark).transform,
          progressHidden: progress?.hasAttribute('hidden') ?? false,
          progressTransform: progress === null ? '' : getComputedStyle(progress).transform,
        }
      })
    }

    // `apps/browser-harness/screens.ts` renders the crosshair mid-hit, so both
    // runs are of the state where the two answers differ.
    const full = await reticle('full')
    const reduced = await reticle('reduced')

    expect(full.declared).toHaveLength(2)
    expect(full.progressHidden).toBe(true)
    expect(reduced.progressHidden).toBe(true)
    expect(reduced.progressTransform).toBe(full.progressTransform)

    // THE SIGNAL SURVIVES. Both arms carry the hit weight under both
    // preferences, and it is the constant the renderer declares.
    const hitWeight = Number.parseFloat(CROSSHAIR_ARM_HIT_WEIGHT)
    expect(reduced.declared).toStrictEqual(full.declared)
    for (const weight of reduced.declared) {
      expect(weight).toBe(hitWeight)
    }

    // THE ANIMATION DOES NOT. `clearStyle` REMOVES the transform rather than
    // setting `scale(1)`, so the computed value is the identity — and the
    // centring translate lives on the ROOT, which is why removing this one does
    // not move the reticle off the point it marks (asserted separately below).
    expect(full.transform).not.toBe('none')
    expect(reduced.transform).toBe('none')

    // And the scale really did reach the pixels for the people who get it, so
    // 「reduced motion removed something」 is a measurement rather than a claim
    // about a string that was never used.
    for (const [index, rendered] of reduced.rendered.entries()) {
      expect(rendered).toBe(hitWeight)
      expect(full.rendered[index] ?? 0).toBeGreaterThan(rendered)
    }
  })
})

test.describe('screens stay inside the safe area, and the reticle stays on the point', () => {
  for (const viewport of NARROW_VIEWPORTS) {
    test(`content-bearing screens fit the safe rect at ${String(viewport.width)}px`, async ({
      page,
    }) => {
      // `hud.e2e.ts`'s `expectInsideViewport` and `inventory-overlay.e2e.ts`'s
      // 「inventory remains usable at ${width}px」, ported. The reference asked for
      // containment in the VIEWPORT; this asks for containment in the SAFE RECT,
      // which is strictly stronger and is the half of #34 that generalises past
      // the touch controls nobody builds.
      await page.setViewportSize(viewport)
      await openHarness(page, { safe: SAFE_INSET_PX })

      const measured = await page.evaluate(
        ({ inset }: { inset: number }) => {
          const safe = {
            x: inset,
            y: inset,
            width: window.innerWidth - inset * 2,
            height: window.innerHeight - inset * 2,
          }
          const roots = Array.from(
            document.querySelectorAll('[data-harness-host] > [data-mx-ui]'),
          ).map((root) => {
            const rect = root.getBoundingClientRect()
            return {
              name: root.getAttribute('data-mx-ui') ?? root.tagName,
              box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            }
          })
          return { safe, roots }
        },
        { inset: SAFE_INSET_PX },
      )

      // The crosshair is EXEMPT and the exemption is the interesting part, not a
      // loophole. A reticle marks the camera's principal point, which is the
      // centre of the canvas and has nothing to do with where a phone's chrome
      // happens to be — an inset crosshair would be a crosshair pointing at the
      // wrong place. It gets its own assertion below rather than a pass here.
      const outside = measured.roots
        .filter((root) => root.name !== 'crosshair')
        .filter((root) => !insideRect(root.box, measured.safe))
        .map(
          (root) =>
            `${root.name}: ${JSON.stringify(root.box)} leaves ${JSON.stringify(measured.safe)}`,
        )

      expect(measured.roots.length).toBe(7)
      expect(outside).toStrictEqual([])
    })

    test(`the crosshair stays on the viewport centre at ${String(viewport.width)}px, inset or not`, async ({
      page,
    }) => {
      // `hud.e2e.ts:61-62`, which the triage left in mc-compose as 「中央に来て
      // いるかの検証も持ってこない — それはレイアウトでブラウザが要る」. It is
      // mx-ui's after all: `application/crosshair-view.ts` writes the `left: 50%`
      // and the `translate(-50%, -50%)` itself, and its own header says 「Centring
      // is not verified here」. Now it is.
      //
      // With a safe-area inset applied to the host, which is the case that makes
      // this non-trivial: the host carries the inset as PADDING, and an
      // absolutely positioned child resolves against the padding box, so the
      // reticle stays on the viewport centre while everything in normal flow
      // moves in. That asymmetry is correct and is asserted rather than assumed.
      await page.setViewportSize(viewport)
      await openHarness(page, { screen: 'crosshair', safe: SAFE_INSET_PX })

      const reticle = await page.evaluate(() => {
        const element = document.querySelector('[data-harness-host="crosshair"] [data-mx-ui="crosshair"]')
        if (element === null) {
          throw new Error('no crosshair')
        }
        const rect = element.getBoundingClientRect()
        return {
          centreX: rect.x + rect.width / 2,
          centreY: rect.y + rect.height / 2,
          width: rect.width,
          height: rect.height,
          wantX: window.innerWidth / 2,
          wantY: window.innerHeight / 2,
        }
      })

      expect(reticle.centreX).toBeCloseTo(reticle.wantX, 0)
      expect(reticle.centreY).toBeCloseTo(reticle.wantY, 0)
      // And it is the box `CROSSHAIR_SIZE` declares, so 「centred」 is not being
      // satisfied by a zero-sized element sitting at the midpoint.
      expect(reticle.width).toBe(Number.parseFloat(CROSSHAIR_SIZE))
      expect(reticle.height).toBe(Number.parseFloat(CROSSHAIR_SIZE))
    })
  }
})
