/**
 * The bridge between the palette's numbers and a document.
 *
 * `docs/testing.md` §4 records completion criterion 4 as ⚠️ with a precise
 * reason: 「パレットに消費者が無い。トークンは値であり、CSS にする層がまだ無い。だから保証
 * …は数値については証明済みで、描かれた画面については未証明である」. This file is the
 * consumer, and the sweep below is what stops it from becoming a PARTIAL
 * consumer without anybody noticing — which would be the same gap, quieter.
 */
import { describe, expect, it } from 'vitest'
import * as palette from '../domain/palette'
import {
  PALETTE_PROPERTY,
  PALETTE_PROPERTY_PREFIX,
  PALETTE_SOURCE,
  PALETTE_TOKEN_NAMES,
  PALETTE_VALUE,
  PALETTE_VAR,
  declarePalette,
} from '../application/palette-css'
import { captionLines, emptyCaptionQueue } from '../domain/caption'
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../domain/inventory-view-model'
import { createCaptionView } from '../application/caption-view'
import { createHudView } from '../application/hud-view'
import { createInventoryView } from '../application/inventory-view'
import { fakeDocument, type FakeElement } from './fake-dom'

const isRgb = (value: unknown): value is palette.Rgb =>
  Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === 'number')

/**
 * The two `Rgb` exports that are NOT tokens.
 *
 * `SCRIM_OVER_DARKEST_WORLD` / `SCRIM_OVER_BRIGHTEST_WORLD` are the composites
 * `worstCaseContrastOnScrim` measures against — the analysis's own working, not
 * anything a screen shows. Giving them custom properties would put the two ends
 * of a bound into a stylesheet as if they were colours somebody could use.
 */
const NON_TOKEN_RGB_EXPORTS = new Set(['SCRIM_OVER_DARKEST_WORLD', 'SCRIM_OVER_BRIGHTEST_WORLD'])

describe('every colour in domain/palette.ts reaches the DOM', () => {
  it('REGRESSION: no exported token is missing a custom property', () => {
    // A token defined and never surfaced is a token whose measured guarantee
    // describes nothing on screen. That is exactly the gap this directory
    // closes, and without this sweep it would reopen one token at a time —
    // silently, because `surveyPalette` would keep reporting it green.
    const declared = new Set(Object.values(PALETTE_SOURCE))

    for (const [name, value] of Object.entries(palette)) {
      if (!isRgb(value) || NON_TOKEN_RGB_EXPORTS.has(name)) {
        continue
      }
      expect(declared.has(value), `${name} has no custom property`).toBe(true)
    }
  })

  it('every guarded token — the ones the guarantee is actually ABOUT — has one', () => {
    // `GUARDED_TOKENS` is the list `surveyPalette` measures. If one of those
    // never reaches an element, the measurement is about a colour nobody sees.
    const declared = new Set(Object.values(PALETTE_SOURCE))
    for (const token of palette.GUARDED_TOKENS) {
      expect(declared.has(token.color), `${token.name} is guarded but not declared`).toBe(true)
    }
  })

  it('renders values through cssColor only, and carries the alpha of the two that have one', () => {
    // `domain/palette.ts` on `Rgb`: 「`hex` and `cssColor` render it for a
    // stylesheet; those are the only two ways a DOM layer should ever turn a
    // token into text, so that nobody re-derives `rgba(...)` by hand and drifts」.
    expect(PALETTE_VALUE.heart).toBe(palette.cssColor(palette.HEART))
    expect(PALETTE_VALUE.scrim).toBe(palette.cssColor(palette.SCRIM, palette.SCRIM_ALPHA))
    expect(PALETTE_VALUE.slotFill).toBe(palette.cssColor(palette.SLOT_FILL, palette.SLOT_FILL_ALPHA))
    // The alpha is the guarantee. 0.88 lands STATUS_ALERT at 4.3:1 over a white
    // world pixel and misses the text floor; 0.90 does not.
    expect(PALETTE_VALUE.scrim.startsWith('rgba(')).toBe(true)
    expect(PALETTE_VALUE.slotFill.startsWith('rgba(')).toBe(true)
  })

  it('names every property under one prefix, and every reference matches its property', () => {
    for (const name of PALETTE_TOKEN_NAMES) {
      expect(PALETTE_PROPERTY[name].startsWith(PALETTE_PROPERTY_PREFIX)).toBe(true)
      expect(PALETTE_VAR[name]).toBe(`var(${PALETTE_PROPERTY[name]})`)
    }
    // A short name is a name that eventually collides with the host page's.
    expect(PALETTE_PROPERTY_PREFIX).toBe('--mx-ui-')
  })

  it('REGRESSION: records exactly which guarded tokens are DECLARED but not yet REFERENCED', () => {
    // The precise remaining edge of criterion 4 in `docs/testing.md` §4, made
    // measurable instead of argued.
    //
    // Declaring `--mx-ui-focus-ring` on a root is not the same as a screen
    // drawing a focus ring. `surveyPalette` measures every entry in
    // `GUARDED_TOKENS`, so a token that no element references is a token whose
    // guarantee is still about numbers only — which is precisely the gap this
    // directory was written to close. The set below is the part still open, and
    // each member is open for a reason that is not fixable by writing more CSS:
    //
    //   FOCUS_RING       — nothing is focusable. A focus ring needs a control,
    //   FOCUS_RING_SHADOW  a control needs keys, and keys are mc-render's
    //                      (plan.md §2.3-2) with the decision at frame level
    //                      (DN-UI-4). See `test/screen-views.test.ts` on settings.
    //
    //   STATUS_OK        — the autosave indicator is not built. This is the
    //   STATUS_BUSY        uncomfortable one: `status ok / status alert` is THE
    //                      pair the survey found collapsed in the reference
    //                      (`#d7f7c2` vs `#ffd6d2`, 12 units apart under
    //                      protanopia), and the component that would show it does
    //                      not exist here yet. `STATUS_ALERT` reaches the screen
    //                      through the death overlay; its partner does not.
    //
    // When one of these gets a consumer, THIS TEST is the one that fails, and
    // that is the intended way to notice.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const hud = createHudView(factory, parent, 'full')
    hud.render(hudViewModel(spawnSnapshot))
    const captions = createCaptionView(factory, parent, 'full')
    captions.render(captionLines(emptyCaptionQueue, 0))
    const inventory = createInventoryView(factory, parent)
    inventory.render(inventoryViewModel(emptyInventorySnapshot))

    const referenced = new Set<string>()
    for (const root of [hud.root, captions.root, inventory.root]) {
      for (const element of (root as FakeElement).walk()) {
        for (const [property, value] of element.style.properties) {
          if (property.startsWith(PALETTE_PROPERTY_PREFIX)) {
            continue
          }
          for (const name of PALETTE_TOKEN_NAMES) {
            if (value.includes(PALETTE_VAR[name])) {
              referenced.add(name)
            }
          }
        }
      }
    }

    const guardedNames = new Set(palette.GUARDED_TOKENS.map((token) => token.name))
    const unreferencedGuarded = PALETTE_TOKEN_NAMES.filter((name) => {
      const constantName = name.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()
      return guardedNames.has(constantName) && !referenced.has(name)
    })

    expect([...unreferencedGuarded].sort()).toStrictEqual(['focusRing', 'statusBusy', 'statusOk'])
  })

  it('declares the whole set on one element and writes each property exactly once', () => {
    const factory = fakeDocument()
    const root = factory.createElement('div') as FakeElement
    const before = factory.mark()
    declarePalette(root)

    const written = factory.since(before)
    expect(written).toHaveLength(PALETTE_TOKEN_NAMES.length)
    expect(new Set(written.map((mutation) => mutation.name)).size).toBe(PALETTE_TOKEN_NAMES.length)
    expect(written.every((mutation) => mutation.kind === 'style')).toBe(true)
    expect(written.every((mutation) => mutation.target === root)).toBe(true)
  })
})
