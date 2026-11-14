import { expect, test, type Page } from '@playwright/test'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { contrastRatio, TEXT_CONTRAST_MIN, type Rgb } from '../src/domain/palette'
import { openHarness } from './harness'

const MAIN_MENU_SCENARIOS = SCENARIO_REGISTRY.filter((scenario) => scenario.screen === 'main-menu')
const BACKGROUNDS = ['white', 'black', 'mid', 'checker'] as const
const CONTRAST_MODES = ['normal', 'more', 'forced'] as const

type TextRect = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

type ButtonLabel = {
  readonly label: string
  readonly foreground: Rgb
  readonly fontSize: number
  readonly fontWeight: number
  readonly threshold: number
  readonly buttonBackground: string
  readonly backgroundAlpha: number
  readonly backgroundImage: string
  readonly filters: ReadonlyArray<string>
  readonly rects: ReadonlyArray<TextRect>
  readonly signature: string
  readonly disabled: boolean
}

type PixelReading = {
  readonly darkest: Rgb | null
  readonly lightest: Rgb | null
  readonly pixels: number
}

const measureButtonLabels = async (page: Page): Promise<ReadonlyArray<ButtonLabel>> =>
  await page.evaluate((regularTextThreshold: number) => {
    const host = document.querySelector<HTMLElement>('[data-harness-host="main-menu"]')
    if (host === null) {
      throw new Error('main-menu harness host is missing')
    }

    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
    const measure = (button: HTMLButtonElement): ButtonLabel => {
      const range = document.createRange()
      range.selectNodeContents(button)
      const clippingAncestors: Array<{
        readonly left: number
        readonly top: number
        readonly right: number
        readonly bottom: number
        readonly clipsX: boolean
        readonly clipsY: boolean
      }> = []
      for (let element: HTMLElement | null = button; element !== null; element = element.parentElement) {
        const ancestorStyle = getComputedStyle(element)
        const clipsX = ['auto', 'clip', 'hidden', 'overlay', 'scroll'].includes(ancestorStyle.overflowX)
        const clipsY = ['auto', 'clip', 'hidden', 'overlay', 'scroll'].includes(ancestorStyle.overflowY)
        if (clipsX || clipsY) {
          const bounds = element.getBoundingClientRect()
          const left = bounds.left + element.clientLeft
          const top = bounds.top + element.clientTop
          clippingAncestors.push({
            left,
            top,
            right: left + element.clientWidth,
            bottom: top + element.clientHeight,
            clipsX,
            clipsY,
          })
        }
      }
      const rects = [...range.getClientRects()].flatMap((rect) => {
        let left = Math.max(rect.left, 0)
        let top = Math.max(rect.top, 0)
        let right = Math.min(rect.right, window.innerWidth)
        let bottom = Math.min(rect.bottom, window.innerHeight)
        for (const ancestor of clippingAncestors) {
          if (ancestor.clipsX) {
            left = Math.max(left, ancestor.left)
            right = Math.min(right, ancestor.right)
          }
          if (ancestor.clipsY) {
            top = Math.max(top, ancestor.top)
            bottom = Math.min(bottom, ancestor.bottom)
          }
        }
        return right > left && bottom > top ? [{ left, top, right, bottom }] : []
      })

      const chain: Array<{ filter: string; opacity: number }> = []
      for (let element: HTMLElement | null = button; element !== null; element = element.parentElement) {
        const style = getComputedStyle(element)
        chain.push({ filter: style.filter, opacity: Number(style.opacity) })
      }

      const style = getComputedStyle(button)
      const filters = chain.map((item) => item.filter).filter((filter) => filter !== 'none')
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')
      if (context === null) {
        throw new Error('Canvas 2D context is unavailable')
      }
      const filter = filters.length === 0 ? 'none' : filters.join(' ')
      context.filter = filter
      if (context.filter !== filter) {
        throw new Error(`Canvas did not apply ${filter}`)
      }
      context.fillStyle = style.color
      context.fillRect(0, 0, 1, 1)
      const pixel = context.getImageData(0, 0, 1, 1).data
      const [red = 0, green = 0, blue = 0] = pixel
      const foreground: Rgb = [red, green, blue]
      const fontSize = Number.parseFloat(style.fontSize)
      const fontWeight = Number.parseInt(style.fontWeight, 10)
      const threshold = fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700) ? 3 : regularTextThreshold
      const channels = style.backgroundColor.match(/[\d.]+/gu) ?? []
      const backgroundAlpha = channels.length >= 4 ? Number(channels[3]) : 1
      const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().replace(/\s+/gu, ' ')
      const signature = JSON.stringify({
        foreground,
        fontSize,
        fontWeight,
        threshold,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        filters,
        opacity: chain.map((item) => item.opacity),
      })

      return {
        label,
        foreground,
        fontSize,
        fontWeight,
        threshold,
        buttonBackground: style.backgroundColor,
        backgroundAlpha,
        backgroundImage: style.backgroundImage,
        filters,
        rects,
        signature,
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
      }
    }
    const labels = buttons
      .filter((button) => button.getClientRects().length > 0)
      .map(measure)

    for (const button of buttons) {
      button.style.setProperty('color', 'transparent', 'important')
      button.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
      button.style.setProperty('text-shadow', 'none', 'important')
      for (const child of button.querySelectorAll<HTMLElement>('*')) {
        child.style.setProperty('color', 'transparent', 'important')
        child.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
        child.style.setProperty('text-shadow', 'none', 'important')
      }
    }
    return labels
  }, TEXT_CONTRAST_MIN)

const sampleLabelBackgrounds = async (
  page: Page,
  labels: ReadonlyArray<ButtonLabel>,
): Promise<ReadonlyArray<PixelReading>> => {
  const screenshot = await page.screenshot()
  return await page.evaluate(
    async ({ base64, probes }: { base64: string; probes: ReadonlyArray<ButtonLabel> }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) {
        throw new Error('Canvas 2D context is unavailable for screenshot readback')
      }
      context.drawImage(image, 0, 0)
      const scale = image.width / window.innerWidth

      return probes.map((probe) => {
        let darkestColor: Rgb | null = null
        let lightestColor: Rgb | null = null
        let lightest = -1
        let darkest = 2
        let pixels = 0
        for (const rect of probe.rects) {
          const left = Math.max(0, Math.floor(rect.left))
          const top = Math.max(0, Math.floor(rect.top))
          const right = Math.min(window.innerWidth, Math.ceil(rect.right))
          const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom))
          const imageLeft = Math.round(left * scale)
          const imageTop = Math.round(top * scale)
          const imageRight = Math.round(right * scale)
          const imageBottom = Math.round(bottom * scale)
          const width = imageRight - imageLeft
          const height = imageBottom - imageTop
          if (width > 0 && height > 0) {
            const { data } = context.getImageData(imageLeft, imageTop, width, height)
            for (let index = 0; index < data.length; index += 4) {
              const [red = 0, green = 0, blue = 0] = data.subarray(index, index + 3)
              const color: Rgb = [red, green, blue]
              const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
              pixels += 1
              if (luminance > lightest) {
                lightest = luminance
                lightestColor = color
              }
              if (luminance < darkest) {
                darkest = luminance
                darkestColor = color
              }
            }
          }
        }
        return { darkest: darkestColor, lightest: lightestColor, pixels }
      })
    },
    { base64: screenshot.toString('base64'), probes: labels },
  )
}

test.describe('main-menu button label contrast', () => {
  test('covers every registered main-menu scenario exactly once', () => {
    const ids = MAIN_MENU_SCENARIOS.map((scenario) => scenario.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const scenario of MAIN_MENU_SCENARIOS) {
    for (const background of BACKGROUNDS) {
      for (const contrast of CONTRAST_MODES) {
        test(`${scenario.id} / ${background} / ${contrast}`, async ({ page }) => {
          await openHarness(page, {
            screen: 'main-menu',
            scenario: scenario.id,
            background,
            contrast,
            layout: 'single',
          })

          const labels = await measureButtonLabels(page)
          expect(labels.length, 'the scenario must render labeled main-menu buttons').toBeGreaterThan(0)
          expect(labels.filter((label) => label.disabled), 'no disabled labels are excluded from this check').toHaveLength(0)
          for (const label of labels) {
            expect(label.backgroundAlpha, `${label.label} backdrop must be opaque`).toBe(1)
            expect(label.backgroundImage, `${label.label} button must have a solid background`).toBe('none')
          }

          const visibleLabels = labels.filter((label) => label.rects.length > 0)
          expect(visibleLabels.length, 'the scenario must render visible button labels').toBeGreaterThan(0)
          const pixels = await sampleLabelBackgrounds(page, visibleLabels)
          expect(pixels.length).toBe(visibleLabels.length)
          const groups = new Map<string, { labels: ButtonLabel[]; ratio: number | null; sampledPixels: number }>()
          const pairs = visibleLabels.map((label, index) => [label, pixels.at(index)] as const)
          for (const [label, sample] of pairs) {
            if (sample === undefined) {
              throw new Error('browser contrast measurement lost a label')
            }
            const group = groups.get(label.signature) ?? { labels: [], ratio: null, sampledPixels: 0 }
            group.labels.push(label)
            group.sampledPixels += sample.pixels
            const backgrounds = [sample.darkest, sample.lightest].filter((color): color is Rgb => color !== null)
            for (const backgroundColor of backgrounds) {
              const ratio = contrastRatio(label.foreground, backgroundColor)
              group.ratio = group.ratio === null ? ratio : Math.min(group.ratio, ratio)
            }
            groups.set(label.signature, group)
          }

          expect(groups.size).toBeGreaterThan(0)
          for (const group of groups.values()) {
            const [label] = group.labels
            if (label === undefined) {
              throw new Error('browser contrast measurement produced an empty style group')
            }
            expect(group.sampledPixels, `${label.label} style must be sampled from rendered pixels`).toBeGreaterThan(0)
            expect(label.backgroundAlpha, `${label.label} backdrop must be opaque`).toBe(1)
            expect(label.backgroundImage, `${label.label} button must have a solid background`).toBe('none')
            expect(
              group.ratio,
              `${scenario.id} / ${background} / ${contrast}: ${label.label}, ${label.buttonBackground}`,
            ).not.toBeNull()
            for (const item of group.labels) {
              expect(
                group.ratio,
                `${scenario.id} / ${background} / ${contrast}: ${item.label} ` +
                  `(${item.fontSize}px, weight ${item.fontWeight}) needs ${item.threshold}:1`,
              ).toBeGreaterThanOrEqual(item.threshold)
            }
          }
        })
      }
    }

    test(`${scenario.id} / system forced-colors`, async ({ page }) => {
      await openHarness(page, {
        screen: 'main-menu',
        scenario: scenario.id,
        background: 'mid',
        contrast: 'normal',
        layout: 'single',
      })
      const before = await page.locator('[data-harness-host="main-menu"] button').evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => {
            const style = getComputedStyle(button)
            return { color: style.color, backgroundColor: style.backgroundColor }
          }),
      )
      expect(before.length).toBeGreaterThan(0)

      await page.emulateMedia({ forcedColors: 'active' })
      const forced = await page.locator('[data-harness-host="main-menu"] button').evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => {
            const style = getComputedStyle(button)
            return {
              color: style.color,
              backgroundColor: style.backgroundColor,
              forcedColorAdjust: style.getPropertyValue('forced-color-adjust'),
            }
          }),
      )
      expect(forced).toHaveLength(before.length)
      for (let index = 0; index < forced.length; index += 1) {
        const authored = before[index]
        const system = forced[index]
        expect(authored).toBeDefined()
        expect(system?.forcedColorAdjust).toBe('auto')
        expect(system?.color).not.toBe(authored?.color)
        expect(system?.backgroundColor).not.toBe(authored?.backgroundColor)
      }
    })
  }
})
