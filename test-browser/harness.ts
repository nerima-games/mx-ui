/**
 * Shared helpers for the browser gate.
 *
 * NOT A SPEC — a helper the `.spec.ts` files build on, the same role
 * `test/fake-dom.ts` plays for the headless suite and named the same way so the
 * pairing is visible.
 *
 * ---------------------------------------------------------------------------
 * The one non-obvious thing in here: reading a PIXEL
 * ---------------------------------------------------------------------------
 *
 * `getComputedStyle` answers 「what colour did the cascade resolve」, which is
 * `docs/testing.md` §4's second unproven item and worth a lot. It does NOT
 * answer 「what colour reached the screen」, because a translucent token is
 * composited against whatever is behind it and the composite is the thing
 * `domain/palette.ts`'s whole G1 guarantee is stated about — `SCRIM_ALPHA` is
 * 0.90 rather than the reference's 0.88 precisely because the COMPOSITE at 0.88
 * put `STATUS_ALERT` at 4.3:1 over a white world.
 *
 * So `samplePixels` screenshots the page and reads the buffer back INSIDE the
 * browser: the PNG goes in as a data URL, onto a canvas, out through
 * `getImageData`. That avoids adding an image-decoding dependency to a
 * repository whose entire runtime dependency list is `effect`, which is not a
 * stylistic preference — `pnpm check:deps` treats the manifest as policy, and a
 * decoder pulled in to read four bytes would be the cheapest possible precedent
 * for the next one.
 */
import { expect, type Page } from '@playwright/test'
import type { Rgb } from '../src/domain/palette'

/** The two viewports `docs/e2e-triage.md` §3.6 names for `usable at ${width}px`. */
export const NARROW_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const

export type NarrowViewport = (typeof NARROW_VIEWPORTS)[number]

/** Set by `apps/browser-harness/main.ts` once every screen has mounted. */
const READY_ATTRIBUTE = 'data-harness-ready'

export type HarnessOptions = {
  readonly screen?: string
  readonly motion?: 'full' | 'reduced'
  readonly breakProgress?: number
  /** Emulated `safe-area-inset`, in CSS pixels. See `main.ts` on why it is emulated. */
  readonly safe?: number
}

/**
 * Load the harness and wait for every screen to be mounted.
 *
 * The wait is on an ATTRIBUTE rather than on a timeout or a selector. A selector
 * would be satisfied by a partially built page — the harness mounts seven
 * screens in order, so `[data-mx-ui="hud"]` exists long before the crosshair
 * does — and the reference's own suite records what waiting on the wrong thing
 * costs (`loading-screen.e2e.ts` loosens a 2,500ms claim to 1,800ms 「for CI
 * jitter」, which `docs/e2e-triage.md` §3.6 notes is 「保険であって、主張の一部では
 * ない」). The attribute is written on the last line of `start()` and carries the
 * screen COUNT, so a harness that mounted six is a failure rather than a wait.
 */
export const openHarness = async (page: Page, options: HarnessOptions = {}): Promise<void> => {
  const params = new URLSearchParams()
  if (options.screen !== undefined) {
    params.set('screen', options.screen)
  }
  if (options.motion !== undefined) {
    params.set('motion', options.motion)
  }
  if (options.breakProgress !== undefined) {
    params.set('breakProgress', String(options.breakProgress))
  }
  if (options.safe !== undefined) {
    params.set('safe', String(options.safe))
  }

  const query = params.toString()
  await page.goto(query === '' ? '/' : `/?${query}`)
  await page.waitForFunction(
    (attribute: string) => document.documentElement.hasAttribute(attribute),
    READY_ATTRIBUTE,
  )
  // Seven screens, and asserted rather than assumed: a sweep over the screens
  // that happened to mount is a sweep that silently shrinks.
  await expect(page.locator('html')).toHaveAttribute(READY_ATTRIBUTE, '7')
}

/** `rgb(22, 26, 29)` / `rgba(10, 14, 18, 0.9)` -> channels. Alpha is dropped. */
export const parseCssRgb = (value: string): Rgb => {
  const numbers = value.match(/-?[\d.]+/gu)
  if (numbers === null || numbers.length < 3) {
    throw new Error(`browser gate: cannot read "${value}" as an rgb colour`)
  }
  return [Number(numbers[0]), Number(numbers[1]), Number(numbers[2])]
}

/** The alpha a CSS colour carries, or 1 when it is opaque. */
export const parseCssAlpha = (value: string): number => {
  const numbers = value.match(/-?[\d.]+/gu)
  return numbers !== null && numbers.length >= 4 ? Number(numbers[3]) : 1
}

export type PixelProbe = {
  readonly name: string
  readonly x: number
  readonly y: number
}

/**
 * Screenshot once, then read back the requested points.
 *
 * ONE screenshot for every probe rather than one each, because a per-probe clip
 * is a per-probe repaint and two probes taken from two paints are two different
 * pages. Everything the pixel assertions compare — a mark against the surface it
 * was measured on — has to come out of the same frame or the comparison is
 * between two frames.
 */
export const samplePixels = async (
  page: Page,
  probes: ReadonlyArray<PixelProbe>,
): Promise<Readonly<Record<string, Rgb>>> => {
  const shot = await page.screenshot()
  return await page.evaluate(
    async ({ data, points }: { data: string; points: ReadonlyArray<PixelProbe> }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (context === null) {
        throw new Error('browser gate: no 2d context to read the screenshot back through')
      }
      context.drawImage(image, 0, 0)

      // A screenshot is in DEVICE pixels and every coordinate a probe carries
      // came from `getBoundingClientRect`, which is in CSS pixels. Deriving the
      // ratio from the image rather than reading `devicePixelRatio` keeps the
      // two in step even when Playwright has scaled the capture.
      const scale = image.width / window.innerWidth

      const read: Record<string, [number, number, number]> = {}
      for (const point of points) {
        const pixel = context.getImageData(
          Math.round(point.x * scale),
          Math.round(point.y * scale),
          1,
          1,
        ).data
        read[point.name] = [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0]
      }
      return read
    },
    { data: shot.toString('base64'), points: probes },
  )
}

/**
 * The page colour the harness sits on, restated here so a spec can name it.
 *
 * `apps/browser-harness/index.html` explains the choice: 128 is the middle of
 * the range `worstCaseContrastOnScrim` bounds with black and white, and it is
 * the band `application/crosshair-view.ts` identifies as where the reference's
 * `mix-blend-mode: difference` reticle vanishes. A harness on a convenient
 * background would make every reading below flattering and none of them useful.
 */
export const HARNESS_WORLD_PIXEL: Rgb = [128, 128, 128]
