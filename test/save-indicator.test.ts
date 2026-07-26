/**
 * The autosave indicator — the component the palette survey's headline finding
 * was about, and the reason it was uncomfortable that it did not exist.
 *
 * `domain/palette.ts` found a real defect in the reference implementation: a
 * successful autosave was inked `#d7f7c2` (`<reference-impl>/index.html:159`) and
 * a FAILED one `#ffd6d2` (`:212`), and simulated those two are 12 units apart
 * under protanopia and 22 under deuteranopia against a collapse threshold of 24.
 * The palette replaced them with a luminance ladder. Until this component
 * existed, that replacement was a fix to numbers: `test/palette-css.test.ts`
 * pinned `STATUS_OK` and `STATUS_BUSY` as declared-but-never-referenced and
 * `docs/testing.md` §4 said so in as many words.
 *
 * Both halves are here — the timing under `environment: 'node'` because it is
 * arithmetic, and the elements against `test/fake-dom.ts` because a fake document
 * can report that nothing happened and jsdom cannot (`docs/testing.md` §3).
 *
 * Plain `it`, not `it.effect`, per DN-UI-2: nothing here forks a fiber, and the
 * rule is followed anyway because the first test that does will be written by
 * copying one of these.
 */
import { describe, expect, it } from 'vitest'
import { COLOR_VISION_MODES } from '../domain/accessibility'
import {
  COLLAPSE_SEPARATION,
  CRITICAL_PAIRS,
  STATUS_ALERT,
  STATUS_BUSY,
  STATUS_OK,
  relativeLuminance,
  separation,
  simulateColorVision,
  surveyPalette,
  type Rgb,
} from '../domain/palette'
import {
  IDLE_SAVE_STATUS,
  SAVED_VISIBLE_SECS,
  saveStatus,
  saveStatusMessage,
} from '../domain/save-status'
import {
  createSaveIndicator,
  SAVE_MESSAGES,
  SAVE_STATUS_GLYPH,
  SAVE_STATUS_LABEL,
} from '../application/save-indicator'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../application/palette-css'
import { fakeDocument, type FakeElement } from './fake-dom'

const mount = () => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement
  const view = createSaveIndicator(factory, parent)
  return { factory, parent, view, root: view.root as FakeElement }
}

const lineOf = (root: FakeElement, message: string): FakeElement | undefined =>
  root.find('data-save-message', message)

const textOf = (line: FakeElement | undefined, part: string): string | undefined =>
  line?.find('data-mx-ui', part)?.textContent

describe('how long each save state is shown', () => {
  it('idle shows nothing at all', () => {
    expect(saveStatusMessage(IDLE_SAVE_STATUS, 0)).toBeUndefined()
    expect(saveStatusMessage(IDLE_SAVE_STATUS, 10_000)).toBeUndefined()
  })

  it('“saved” expires after SAVED_VISIBLE_SECS, and not one frame before', () => {
    const status = saveStatus('saved', 100)

    expect(saveStatusMessage(status, 100)).toBe('saved')
    expect(saveStatusMessage(status, 100 + SAVED_VISIBLE_SECS - 0.001)).toBe('saved')
    expect(saveStatusMessage(status, 100 + SAVED_VISIBLE_SECS)).toBeUndefined()
  })

  it('REGRESSION: “save failed” does NOT expire — a warning is not a receipt', () => {
    // The asymmetry is the point, and it is the second channel on which the two
    // states the reference collapsed differ. Missing a confirmation costs
    // nothing: the thing it confirms already happened. Missing a failure costs
    // the world, and the player who most needs to see it is the one who was
    // looking at the game rather than at the corner of the HUD — which is exactly
    // who a three-second toast loses.
    const failed = saveStatus('failed', 0)
    expect(saveStatusMessage(failed, 0)).toBe('failed')
    expect(saveStatusMessage(failed, SAVED_VISIBLE_SECS * 1000)).toBe('failed')

    // Only a later attempt saying something else clears it.
    expect(saveStatusMessage(saveStatus('saving', 3_000), 3_000)).toBe('saving')
  })

  it('REGRESSION: “saving” is not timed here either — mx-ui does not own the save', () => {
    // A spinner that gives up after N seconds tells the player the write finished
    // when it did not. mc-sim owns the save; this repository owns the report.
    const saving = saveStatus('saving', 0)
    expect(saveStatusMessage(saving, 1)).toBe('saving')
    expect(saveStatusMessage(saving, 86_400)).toBe('saving')
  })

  it('REGRESSION: nothing here reads a clock — the time is an argument (DN-UI-10)', () => {
    // Same discipline as `expireCaptions`. It is what lets a three-second
    // confirmation be aged in microseconds, and plan.md §4.3 bans the
    // alternative outright (`pnpm check:deps` rule 7).
    const status = saveStatus('saved', 0)
    expect(saveStatusMessage(status, 0.001, 0.002)).toBe('saved')
    expect(saveStatusMessage(status, 0.003, 0.002)).toBeUndefined()
  })

  it('a NaN or backwards clock keeps the message UP rather than hiding it', () => {
    // `domain/hud-view-model.ts` clamps NaN to `low` because `low` is the value
    // that invents nothing. Same call: hiding a status is a claim ("there is
    // nothing to tell you"), leaving it up for another frame is not.
    const status = saveStatus('saved', 100)
    expect(saveStatusMessage(status, Number.NaN)).toBe('saved')
    expect(saveStatusMessage(status, 50)).toBe('saved')
    // And a non-finite entry time is refused at construction, so a confirmation
    // cannot acquire the one behaviour reserved for a failure.
    expect(saveStatus('saved', Number.NaN).sinceSecs).toBe(0)
  })
})

describe('the autosave indicator puts the palette on a screen', () => {
  it('declares the tokens on its own root and references all three status colours at MOUNT', () => {
    // The gap this component closes. `surveyPalette` measures every entry in
    // `GUARDED_TOKENS`, so a token no element references is a token whose
    // guarantee is still about numbers — and until now `STATUS_OK` and
    // `STATUS_BUSY` were two of the three in that position (DN-UI-13g).
    //
    // At MOUNT, not on render: each message owns an element, so "did
    // `STATUS_BUSY` reach the screen?" does not depend on which state happened to
    // be showing last.
    const { root, parent } = mount()

    expect(root.style.properties.has(PALETTE_PROPERTY.statusOk)).toBe(true)
    expect(lineOf(root, 'saved')?.style.properties.get('color')).toBe(PALETTE_VAR.statusOk)
    expect(lineOf(root, 'saving')?.style.properties.get('color')).toBe(PALETTE_VAR.statusBusy)
    expect(lineOf(root, 'failed')?.style.properties.get('color')).toBe(PALETTE_VAR.statusAlert)

    // Its own root, never the host's parent — `application/palette-css.ts` on why
    // `:root` and `<body>` are both refused (DN-UI-13e).
    expect([...parent.style.properties.keys()].filter((name) => name.startsWith('--mx-ui-'))).toStrictEqual([])

    // And no element carries a colour literal; every one of them is a `var()`.
    for (const element of root.walk()) {
      for (const [property, value] of element.style.properties) {
        if (property.startsWith('--mx-ui-')) {
          expect(element).toBe(root)
          continue
        }
        expect(value.includes('#')).toBe(false)
        expect(value.includes('rgba(')).toBe(false)
      }
    }
  })

  it('shows one message at a time, and nothing at all when there is nothing to say', () => {
    const { view, root } = mount()

    expect(root.attributes.get('hidden')).toBe('')

    view.render('saving')
    expect(root.attributes.has('hidden')).toBe(false)
    expect(root.attributes.get('data-save-state')).toBe('saving')
    expect(SAVE_MESSAGES.filter((message) => !lineOf(root, message)?.attributes.has('hidden'))).toStrictEqual([
      'saving',
    ])

    view.render('failed')
    expect(SAVE_MESSAGES.filter((message) => !lineOf(root, message)?.attributes.has('hidden'))).toStrictEqual([
      'failed',
    ])

    view.render(undefined)
    expect(root.attributes.get('hidden')).toBe('')
    expect(root.attributes.has('data-save-state')).toBe(false)
  })

  it('is a live region, so a status that appears silently is not invisible', () => {
    // The same affordance `createCaptionView` needs and for the same reason: it
    // is text, and text that appears without an announcement reaches nobody who
    // is not already looking at that corner. `polite` rather than `assertive`
    // because a save status is never worth cutting off a sentence — and the
    // failure state does not need the interruption, because it does not expire.
    const { root } = mount()
    expect(root.attributes.get('role')).toBe('status')
    expect(root.attributes.get('aria-live')).toBe('polite')
  })

  it('REGRESSION: a re-render with an unchanged message mutates nothing at all', () => {
    // plan.md §5.2, and the property every renderer here holds: the assertion is
    // exact rather than a benchmark, because the fake document logs writes.
    const { factory, view } = mount()

    view.render('saved')
    const before = factory.mark()
    view.render('saved')
    expect(factory.since(before)).toStrictEqual([])

    view.render(undefined)
    view.render(undefined)
    const afterHidden = factory.mark()
    view.render(undefined)
    expect(factory.since(afterHidden)).toStrictEqual([])
  })

  it('writes no colour and no text on a state change — only three attributes', () => {
    // The strongest form of 「フレーム経路で色を書かない」 (DN-UI-13d): there is no
    // colour to swap, because each colour belongs to an element. The words do not
    // move either, and `textContent = x` destroys and recreates a text node even
    // when `x` is unchanged (`application/dom-write.ts`).
    const { factory, view } = mount()
    view.render('saved')
    const created = factory.created.length
    const before = factory.mark()

    view.render('failed')
    const written = factory.since(before)

    expect(written.map((mutation) => `${mutation.kind}:${mutation.name}`)).toStrictEqual([
      'attribute:data-save-state',
      'attribute:hidden',
      'removeAttribute:hidden',
    ])
    expect(factory.created.length).toBe(created)
  })

  it('REGRESSION: attaches no event listener anywhere in its tree', () => {
    // DN-UI-4. `test/fake-dom.ts` implements `addEventListener` even though
    // `application/dom-surface.ts` does not declare it, so this is an observation
    // about the renderer rather than about the fake.
    const { view, root, parent } = mount()
    view.render('failed')
    expect(root.listenersInTree()).toStrictEqual([])
    expect(parent.listenersInTree()).toStrictEqual([])
  })
})

describe('REGRESSION: the two states the reference collapsed are told apart without hue', () => {
  it('names the reference’s two values, shows they collapse, and shows the screen does not depend on them', () => {
    // THE regression this whole component exists for.
    //
    // `<reference-impl>/index.html:159` inks a successful autosave `#d7f7c2`;
    // `:212` inks a FAILED one `#ffd6d2`. The hex values are written out here so
    // that anybody who "restores the reference's colours" is told, by a failing
    // test, what those colours cost. `test/view-model.test.ts` asserts the same
    // two numbers about the PALETTE; this asserts it about the SCREEN.
    const REFERENCE_SAVED: Rgb = [215, 247, 194] // #d7f7c2, index.html:159
    const REFERENCE_FAILED: Rgb = [255, 214, 210] // #ffd6d2, index.html:212

    const worstReference = Math.min(
      ...COLOR_VISION_MODES.map((mode) =>
        separation(
          simulateColorVision(REFERENCE_SAVED, mode),
          simulateColorVision(REFERENCE_FAILED, mode),
        ),
      ),
    )
    expect(worstReference).toBeLessThan(COLLAPSE_SEPARATION)

    // Now the component. Strip the colour out entirely — take only what a
    // greyscale print would keep — and the two states are still two different
    // characters and two different sentences.
    const { view, root } = mount()

    view.render('saved')
    const savedLine = lineOf(root, 'saved')
    expect(savedLine?.attributes.has('hidden')).toBe(false)
    expect(textOf(savedLine, 'save-glyph')).toBe('✔')
    expect(textOf(savedLine, 'save-label')).toBe('World saved')

    view.render('failed')
    const failedLine = lineOf(root, 'failed')
    expect(failedLine?.attributes.has('hidden')).toBe(false)
    expect(textOf(failedLine, 'save-glyph')).toBe('✖')
    expect(textOf(failedLine, 'save-label')).toBe('Save failed')

    // Different elements, different glyphs, different words. None of the three
    // is a colour, and none of the three is an attribute.
    expect(savedLine).not.toBe(failedLine)
    expect(SAVE_STATUS_GLYPH.saved).not.toBe(SAVE_STATUS_GLYPH.failed)
    expect(SAVE_STATUS_LABEL.saved).not.toBe(SAVE_STATUS_LABEL.failed)

    // And the palette's own replacement values do clear the threshold, so the
    // colour channel is a third signal rather than the only one.
    const worstOurs = Math.min(
      ...COLOR_VISION_MODES.map((mode) =>
        separation(simulateColorVision(STATUS_OK, mode), simulateColorVision(STATUS_ALERT, mode)),
      ),
    )
    expect(worstOurs).toBeGreaterThanOrEqual(COLLAPSE_SEPARATION)
  })

  it('REGRESSION: the shape channel is an ELEMENT, not a `data-` attribute (DN-UI-13f)', () => {
    // 「`data-icon-state="half"` を出すだけのレンダラは `surveyPalette` の数値を全部
    // 緑に保ったまま、その冗長性を削除する」. `data-save-state` exists — it is how the
    // tests above read the current state — but it is not what carries the
    // distinction, and this asserts the difference. Every one of the three
    // messages has its own glyph text in its own element, present whether or not
    // it is the one showing.
    const { root } = mount()
    const glyphs = SAVE_MESSAGES.map((message) => textOf(lineOf(root, message), 'save-glyph'))

    expect(glyphs).toStrictEqual(['⟳', '✔', '✖'])
    expect(new Set(glyphs).size).toBe(SAVE_MESSAGES.length)
    // The glyph is redundant WITH the words, so it is for the eyes only.
    expect(lineOf(root, 'saved')?.find('data-mx-ui', 'save-glyph')?.attributes.get('aria-hidden')).toBe(
      'true',
    )
  })

  it('REGRESSION: “saved” versus “saving” is a declared pair now, and it is carried by chroma', () => {
    // The gap building this component exposed. The survey declared the two pairs
    // involving `STATUS_ALERT` — the reference's defect was about failure — and
    // stopped; a four-state indicator makes the player compare "saved" against
    // "still saving" too. An undeclared pair is guarded by the all-pairs sweep,
    // which is an accident rather than a promise, and G3 never asks it for a
    // non-colour channel.
    const survey = surveyPalette()
    const pair = survey.pairs.find(
      (reading) =>
        reading.pair.left.name === 'status ok' && reading.pair.right.name === 'status busy',
    )

    expect(pair).toBeDefined()
    expect(pair?.pair.alsoDistinguishedBy).toContain('shape')
    expect(pair?.collapsed).toBe(false)
    // Separated by CHROMA, like `heart full / shank full`: it clears the
    // separation floor comfortably and posts under 3:1 in every mode, so the
    // glyphs are most of the signal rather than a decoration on it.
    expect(pair?.hueOnly).toBe(true)

    // The ladder the survey forced, in the order it forced it.
    expect(relativeLuminance(STATUS_OK)).toBeGreaterThan(relativeLuminance(STATUS_BUSY))
    expect(relativeLuminance(STATUS_BUSY)).toBeGreaterThan(relativeLuminance(STATUS_ALERT))
    expect(CRITICAL_PAIRS.every((critical) => critical.alsoDistinguishedBy.length > 0)).toBe(true)
  })
})
