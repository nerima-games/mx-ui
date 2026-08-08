/**
 * The HUD, rendered — and the four properties that make it worth having.
 *
 * These are written with plain `it` rather than `it.effect`, per DN-UI-2 and
 * `docs/testing.md` §3. Nothing here forks a fiber, so the deadlock is not
 * reachable today; the rule is followed anyway, because the first test that DOES
 * fork will be written by copying one of these.
 *
 * There is no jsdom and no `@vitest-environment` pragma. `test/fake-dom.ts`
 * implements the same structural types a real `Document` satisfies — proved by
 * `test/dom-surface.test.ts` — so the choice recorded as undecided in
 * `docs/testing.md` §3「document をどうやって与えるか — 未決」 turns out to have a
 * third answer: neither A nor B, because a renderer written against a narrow
 * surface does not need an environment at all.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_HEALTH_POINTS,
  DEFAULT_MAX_HUNGER_POINTS,
  hudViewModel,
  spawnSnapshot,
  type VitalsSnapshot,
} from '../src/domain/hud-view-model'
import { HEART, ICON_EMPTY, SCRIM, SCRIM_ALPHA, cssColor } from '../src/domain/palette'
import { createHudView, EXPERIENCE_TRANSITION_MS } from '../src/application/hud-view'
import { FOCUS_RING_SHADOW_WIDTH, FOCUS_RING_WIDTH } from '../src/application/slot-element'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../src/application/palette-css'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'

const mount = (motion: 'full' | 'reduced' = 'full') => {
  const factory = fakeDocument()
  const parent = factory.createElement('body') as FakeElement
  const view = createHudView(factory, parent, motion)
  return { factory, parent, view, root: view.root as FakeElement }
}

const damaged = (healthPoints: number): VitalsSnapshot => ({
  ...spawnSnapshot,
  healthPoints,
})

describe('the HUD renderer applies the palette', () => {
  it('declares every token as a custom property on its own root, and nowhere else', () => {
    const { root } = mount()

    // THE point of the whole directory: the guarantee in `domain/palette.ts` is
    // stated about numbers, and this is where a number becomes a colour on an
    // element. `#e02828` is the value the survey MOVED — `<reference-impl>`'s
    // `#c81919` reaches only 2.61:1 over the worst world pixel — so this
    // assertion is the one that would catch a renderer quietly using the
    // reference's colour instead of the measured one.
    expect(root.style.properties.get(PALETTE_PROPERTY.heart)).toBe(cssColor(HEART))
    expect(root.style.properties.get(PALETTE_PROPERTY.iconEmpty)).toBe(cssColor(ICON_EMPTY))
    // SCRIM carries its alpha. 0.88 → 0.90 was 「the difference between a claim
    // and an aspiration」; a token that arrived opaque would look right and be
    // wrong.
    expect(root.style.properties.get(PALETTE_PROPERTY.scrim)).toBe(cssColor(SCRIM, SCRIM_ALPHA))

    // Declared on mx-ui's root, not on the host's parent. `application/palette-css.ts`
    // explains the two reasons: a `:root` declaration would put the tokens in
    // the same scope as the canvas's colour-vision attribute (the DN-UI-1a
    // failure), and would make the set of elements that can see a token wider
    // than the set the guarantee covers.
    const parentProperties = [...(mount().parent.style.properties.keys())]
    expect(parentProperties.filter((name) => name.startsWith('--mx-ui-'))).toStrictEqual([])
  })

  it('references tokens by name everywhere else — no element carries a colour literal', () => {
    const { view, root } = mount()
    view.render(hudViewModel(spawnSnapshot))

    for (const element of root.walk()) {
      for (const [property, value] of element.style.properties) {
        if (property.startsWith('--mx-ui-')) {
          // The declaration itself, on the root. Checked above.
          expect(element).toBe(root)
        } else {
          // Everything else that mentions a colour mentions it as `var(...)`.
          expect(value.includes('#')).toBe(false)
          expect(value.includes('rgba(')).toBe(false)
        }
      }
    }

    const heart = root.find('data-icon', 'heart')
    expect(heart?.children[1]?.style.properties.get('color')).toBe(PALETTE_VAR.heart)
    expect(heart?.children[0]?.style.properties.get('color')).toBe(PALETTE_VAR.iconEmpty)
  })

  it('carries the icon distinction on SHAPE and LENGTH as well as colour (palette G3)', () => {
    // `CRITICAL_PAIRS` declares heart-full / heart-empty as
    // `alsoDistinguishedBy: ['shape', 'position']`, and G3 says a pair that
    // declares a channel must actually have it. A renderer that recoloured one
    // glyph would keep every number in `surveyPalette` green and delete the
    // redundancy that underwrites the reference's decision to leave the DOM HUD
    // uncorrected (`<reference-impl>/index.html:416`).
    const { view, root } = mount()
    view.render(hudViewModel(damaged(19)))

    const hearts = root.findAll('data-icon', 'heart')
    expect(hearts).toHaveLength(DEFAULT_MAX_HEALTH_POINTS / 2)

    const glyphs = hearts.map((icon) => [icon.children[0]?.textContent, icon.children[1]?.children[0]?.textContent])
    // Hollow behind, solid in front — two different characters, on every icon.
    expect(new Set(glyphs.map((pair) => pair.join('/')))).toStrictEqual(new Set(['♡/♥']))

    const widths = hearts.map((icon) => icon.children[1]?.style.properties.get('width'))
    // Nine full, one half — DN-UI-6's 「A player on half a heart needs to see
    // half a heart」, expressed as a clip rather than as a colour.
    expect(widths).toStrictEqual([...Array<string>(9).fill('100%'), '50%'])
    expect(hearts.map((icon) => icon.attributes.get('data-icon-state'))).toStrictEqual([
      ...Array<string>(9).fill('full'),
      'half',
    ])
  })

  it('gives hearts and shanks different glyph pairs — the channel that carries most of that signal', () => {
    // `heart full / shank full` is 49 units and 1.21:1 apart: separated by
    // CHROMA, 「which is the channel dichromacy compresses hardest」. The palette
    // says outright that the shapes are 「most of the signal」 for this pair.
    const { view, root } = mount()
    view.render(hudViewModel(spawnSnapshot))

    const heart = root.find('data-icon', 'heart')
    const shank = root.find('data-icon', 'shank')
    expect(heart?.children[0]?.textContent).toBe('♡')
    expect(shank?.children[0]?.textContent).toBe('○')
    expect(root.findAll('data-icon', 'shank')).toHaveLength(DEFAULT_MAX_HUNGER_POINTS / 2)
  })
})

describe('the HUD renderer is idempotent', () => {
  it('REGRESSION: a re-render with an unchanged model mutates nothing at all', () => {
    // plan.md §5.2. `ui:hud-sync` runs every frame and the HUD's inputs change
    // on a handful of them; a renderer that rebuilds its tree — or that
    // reassigns `textContent` to the string it already holds, which destroys and
    // recreates a text node — spends the frame path on work with no observable
    // effect. Counting mutations makes that a fact rather than a benchmark.
    //
    // Both assertions below project to strings before comparing, and that is not
    // cosmetic. A `Mutation` holds its `target`, a `FakeElement` holds the shared
    // log, and the log holds every `Mutation` — so `toStrictEqual([])` on the raw
    // array sends the reporter round that cycle and exhausts the heap on the ONLY
    // day it matters, which is the day a write appears. A green assertion never
    // walks the objects, so the hazard is invisible until the regression it
    // guards actually happens and the runner dies instead of naming the write.
    const { factory, view } = mount()
    const model = hudViewModel(damaged(13))

    view.render(model)
    const before = factory.mark()
    view.render(model)
    expect(writeNames(factory.since(before))).toStrictEqual([])

    // And with an equal-but-not-identical model, so the diff is on VALUES rather
    // than on object identity — a renderer that memoised the reference would
    // pass the assertion above and fail this one.
    view.render(hudViewModel(damaged(13)))
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('writes only what changed when one heart changes', () => {
    const { factory, view, root } = mount()
    view.render(hudViewModel(damaged(20)))
    const before = factory.mark()
    view.render(hudViewModel(damaged(19)))

    const written = factory.since(before)
    // Exactly one icon moved: its state attribute and its clip width. Nothing
    // else in the HUD — not the other nine hearts, not the hotbar, not the XP
    // bar — and above all no colour, because colours are `var()` references
    // installed at mount.
    expect(written.map((mutation) => `${mutation.kind}:${mutation.name}`)).toStrictEqual([
      'attribute:data-icon-state',
      'style:width',
    ])
    expect(root.findAll('data-icon', 'heart')[9]?.attributes.get('data-icon-state')).toBe('half')
  })

  it('creates no element on a steady frame, and grows the row only when the maximum does', () => {
    const { factory, view } = mount()
    view.render(hudViewModel(spawnSnapshot))
    const created = factory.created.length

    for (let frame = 0; frame < 16; frame += 1) {
      view.render(hudViewModel(damaged(20 - frame)))
    }
    expect(factory.created.length).toBe(created)

    view.render(
      hudViewModel({ ...spawnSnapshot, healthPoints: 30, maxHealthPoints: 30 }),
    )
    // Five more hearts. `safeMaxPoints` deliberately does not bound the maximum,
    // so pre-allocating is not an option; growing on a max-health change is.
    expect(factory.created.length).toBeGreaterThan(created)
  })

  it('hides a surplus icon rather than removing it, and stops writing once hidden', () => {
    const { factory, view, root } = mount()
    view.render(hudViewModel({ ...spawnSnapshot, healthPoints: 30, maxHealthPoints: 30 }))
    view.render(hudViewModel(spawnSnapshot))

    const hearts = root.findAll('data-icon', 'heart')
    expect(hearts).toHaveLength(15)
    expect(hearts[14]?.attributes.get('hidden')).toBe('')

    const before = factory.mark()
    view.render(hudViewModel(spawnSnapshot))
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})

describe('the HUD renderer honours reduced motion', () => {
  it('REGRESSION: reduced motion REMOVES the transition rather than setting it to zero', () => {
    // `animationDurationMs(400, 'reduced')` is 0, and `domain/accessibility.ts`
    // is explicit that it is zero and not 「shorter」: 「A 100 ms version of a
    // screen shake is still a screen shake, and the setting exists for people
    // who get motion sick rather than for people who are impatient」.
    //
    // `transition: width 0ms` is the 100 ms version of that argument: it still
    // installs a transition and still fires `transitionend`. So the assertion is
    // that the property is ABSENT, not that it reads `0ms`.
    const reduced = mount('reduced')
    const fill = reduced.root.find('data-mx-ui', 'experience-fill')
    expect(fill?.style.properties.has('transition')).toBe(false)

    const full = mount('full')
    expect(full.root.find('data-mx-ui', 'experience-fill')?.style.properties.get('transition')).toBe(
      `width ${String(EXPERIENCE_TRANSITION_MS)}ms linear`,
    )
  })

  it('removes it when the preference flips at runtime, and puts it back', () => {
    const { view, root } = mount('full')
    const fill = root.find('data-mx-ui', 'experience-fill')

    view.setMotion('reduced')
    expect(fill?.style.properties.has('transition')).toBe(false)

    view.setMotion('full')
    expect(fill?.style.properties.get('transition')).toBe(
      `width ${String(EXPERIENCE_TRANSITION_MS)}ms linear`,
    )
  })
})

describe('the hotbar is focusable, and mx-ui still owns no keys', () => {
  const ringOf = (slot: FakeElement | undefined): FakeElement | undefined =>
    slot?.find('data-mx-ui', 'slot-focus-ring')

  it('is ONE tab stop, not nine — a roving tabindex the browser honours natively', () => {
    // This is what makes the focus ring honest without a listener: exactly one
    // slot is in the document's tab order, so the element the browser focuses on
    // Tab is the element mx-ui has drawn the ring on. `-1` rather than no
    // attribute, so the other eight stay programmatically focusable for whoever
    // owns input.
    const { root } = mount()
    const slots = root.findAll('data-mx-ui', 'slot')

    expect(slots.map((slot) => slot.attributes.get('tabindex'))).toStrictEqual([
      '0',
      ...Array<string>(8).fill('-1'),
    ])
    // And the group has a name. DN-UI-1c: 「the visible label is a sibling
    // `<span>`, so a screen reader would otherwise announce this only as "edit
    // text"」 — a focus stop with no accessible name announces nothing.
    expect(root.find('data-mx-ui', 'hotbar')?.attributes.get('aria-label')).toBe('Hotbar')
  })

  it('draws NO ring until somebody says where the keyboard is', () => {
    // A ring means "the keyboard is here". Drawing one at mount would make it
    // decoration, which is the 「後ろに何も無いフック」 DN-UI-1a rejects from the
    // other direction. `undefined` is a real state, not an absence of one.
    const { root, view } = mount()
    const slots = root.findAll('data-mx-ui', 'slot')

    expect(slots.every((slot) => ringOf(slot)?.attributes.get('hidden') === '')).toBe(true)

    view.setKeyboardFocus(3)
    expect(ringOf(slots[3])?.attributes.has('hidden')).toBe(false)

    view.setKeyboardFocus(undefined)
    expect(slots.every((slot) => ringOf(slot)?.attributes.get('hidden') === '')).toBe(true)
    // The tab stop goes home rather than disappearing: the hotbar stays
    // reachable, it just is not where the keyboard currently is.
    expect(slots[0]?.attributes.get('tabindex')).toBe('0')
  })

  it('REGRESSION: the ring and the SELECTION are different questions on different slots', () => {
    // `domain/palette.ts` on `FOCUS_RING`: 「Kept distinct from `SLOT_SELECTED`.
    // "Which slot is the game using" and "which control is the keyboard on" are
    // different questions and a player who is navigating by keyboard is asking
    // both at once」. This is that sentence, expressed as two elements that can
    // be lit on two different slots at the same moment.
    const { root, view } = mount()
    view.render(hudViewModel({ ...spawnSnapshot, selectedHotbarIndex: 1 }))
    view.setKeyboardFocus(7)

    const slots = root.findAll('data-mx-ui', 'slot')
    expect(slots[1]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotSelected)
    expect(ringOf(slots[1])?.attributes.get('hidden')).toBe('')
    expect(slots[7]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotBorder)
    expect(ringOf(slots[7])?.attributes.has('hidden')).toBe(false)
  })

  it('carries the ring on WEIGHT as well as colour, as two real widths (palette G3)', () => {
    // `CRITICAL_PAIRS` declares focus-ring / focus-ring-shadow as
    // `alsoDistinguishedBy: ['weight']`, and 「A single-colour ring has to contrast
    // with whatever it lands on and cannot, so the pair carries itself」. Three
    // pixels of gold inside five of near-black: both colours are `var()`
    // references installed at MOUNT, so focusing writes no colour at all.
    const { root, factory, view } = mount()
    const ring = ringOf(root.findAll('data-mx-ui', 'slot')[0])

    expect(ring?.style.properties.get('outline')).toBe(
      `${FOCUS_RING_WIDTH} solid ${PALETTE_VAR.focusRing}`,
    )
    expect(ring?.style.properties.get('box-shadow')).toBe(
      `0 0 0 ${FOCUS_RING_SHADOW_WIDTH} ${PALETTE_VAR.focusRingShadow}`,
    )
    expect(FOCUS_RING_WIDTH).not.toBe(FOCUS_RING_SHADOW_WIDTH)

    const before = factory.mark()
    view.setKeyboardFocus(0)
    // One attribute per slot that moved, and not a single style write.
    expect(writeNames(factory.since(before))).toStrictEqual([
      'removeAttribute:hidden',
    ])
  })

  it('clamps a told index through the SAME derivation the selection uses (DN-UI-7a)', () => {
    // Both indices arrive from across a boundary and both can be `9`, `-1` or
    // `NaN`. A HUD that loses its selection and a ring that vanishes are the same
    // bug twice, so there is one `hotbarSlotIndex` and not two copies of it.
    const { root, view } = mount()
    const slots = root.findAll('data-mx-ui', 'slot')

    view.setKeyboardFocus(9)
    expect(slots[8]?.attributes.get('tabindex')).toBe('0')
    view.setKeyboardFocus(-1)
    expect(slots[0]?.attributes.get('tabindex')).toBe('0')
    view.setKeyboardFocus(Number.NaN)
    expect(slots[0]?.attributes.get('tabindex')).toBe('0')
    expect(ringOf(slots[0])?.attributes.has('hidden')).toBe(false)
  })

  it('re-stating the same focus mutates nothing', () => {
    const { factory, view } = mount()
    view.setKeyboardFocus(4)
    const before = factory.mark()
    view.setKeyboardFocus(4)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('REGRESSION: making a slot focusable did not add a listener or a way to move focus', () => {
    // The half that is still mc-render's, pinned from three directions.
    // `application/dom-surface.ts` has no `addEventListener` (so nothing can
    // observe focus) and no `focus()` (so nothing can move it), and both
    // absences are what keep the Escape decision single (DN-UI-4/DN-UI-13c).
    const { view, root, parent } = mount()
    view.render(hudViewModel(spawnSnapshot))
    view.setKeyboardFocus(2)

    expect(root.listenersInTree()).toStrictEqual([])
    expect(parent.listenersInTree()).toStrictEqual([])
    expect('focus' in (root.findAll('data-mx-ui', 'slot')[0] ?? {})).toBe(false)
  })
})

describe('the HUD renderer owns no keys', () => {
  it('REGRESSION: attaches no event listener anywhere in its tree', () => {
    // DN-UI-4 / plan.md §3.13: 「モーダルの Escape は stopPropagation、閉じる責務は
    // フレーム側単一ハンドラ(mc-render の入力設計と対)」. `domain/modal-stack.ts` is
    // that single handler's decision. A renderer with its own key listener makes
    // it two, and the symptom is one Escape closing two screens — the 「Escape
    // didn't work, now I'm being eaten by a zombie」 bug that module names.
    //
    // `test/fake-dom.ts` implements `addEventListener` even though
    // `application/dom-surface.ts` does not declare it, precisely so that this
    // is an observation about the renderer rather than about the fake.
    const { view, root, parent } = mount()
    view.render(hudViewModel(spawnSnapshot))
    view.setMotion('reduced')

    expect(root.listenersInTree()).toStrictEqual([])
    expect(parent.listenersInTree()).toStrictEqual([])
  })

  it('exposes respawn as a named native button without owning its activation', () => {
    const { root, parent } = mount()
    const respawn = root.find('data-mx-ui', 'respawn')

    expect(respawn?.tagName).toBe('button')
    expect(respawn?.attributes.get('type')).toBe('button')
    expect(respawn?.textContent).toBe('Respawn')
    expect(respawn?.listeners).toStrictEqual([])
    expect(root.listenersInTree()).toStrictEqual([])
    expect(parent.listenersInTree()).toStrictEqual([])
  })

  it('projects death visibility onto one stable respawn control', () => {
    // The HUD says 「dead」 and exposes a host subscription point; it neither
    // opens a screen nor handles activation. The overlay owns visibility, so the
    // native button enters and leaves the keyboard order with its parent.
    const { view, root, factory } = mount()
    const death = root.find('data-mx-ui', 'death')
    const respawn = root.find('data-mx-ui', 'respawn')

    expect(death?.attributes.has('hidden')).toBe(true)
    expect(respawn?.attributes.has('hidden')).toBe(false)

    view.render(hudViewModel(damaged(0)))
    expect(root.attributes.get('data-dead')).toBe('')
    expect(death?.attributes.has('hidden')).toBe(false)
    expect(root.find('data-mx-ui', 'respawn')).toBe(respawn)

    const before = factory.mark()
    view.render(hudViewModel(damaged(0)))
    expect(writeNames(factory.since(before))).toStrictEqual([])

    view.render(hudViewModel(damaged(20)))
    expect(root.attributes.has('data-dead')).toBe(false)
    expect(death?.attributes.has('hidden')).toBe(true)
    expect(root.findAll('data-mx-ui', 'respawn')).toHaveLength(1)
  })
})

describe('the HUD renderer is a dumb projection', () => {
  it('REGRESSION: an empty slot draws no durability bar (DN-UI-7c, from the DOM side)', () => {
    // The bug DN-UI-7c records was hypothetical when it was written — there was
    // no DOM layer. This is that layer, written the way the note predicted
    // (「フィールドがあれば描く」), so the derivation's `empty` guard is the only
    // thing between a broken tool and a bar under an empty square.
    const { view, root } = mount()
    view.render(
      hudViewModel({
        ...spawnSnapshot,
        hotbar: [{ itemId: 'pickaxe', count: 0, durability: 0.5 }],
      }),
    )

    const [slot] = root.findAll('data-mx-ui', 'slot')
    expect(slot?.attributes.get('data-empty')).toBe('')
    expect(slot?.find('data-mx-ui', 'slot-durability')?.attributes.get('hidden')).toBe('')
  })

  it('switches the durability bar to the alert token below the threshold, and widens the border on selection', () => {
    const { view, root } = mount()
    view.render(
      hudViewModel({
        ...spawnSnapshot,
        hotbar: [
          { itemId: 'pickaxe', count: 1, durability: 0.8 },
          { itemId: 'axe', count: 1, durability: 0.1 },
        ],
        selectedHotbarIndex: 1,
      }),
    )

    const slots = root.findAll('data-mx-ui', 'slot')
    const fillColour = (slot: FakeElement | undefined): string | undefined =>
      slot?.find('data-mx-ui', 'slot-durability-fill')?.style.properties.get('background-color')

    expect(fillColour(slots[0])).toBe(PALETTE_VAR.durabilityHigh)
    expect(fillColour(slots[1])).toBe(PALETTE_VAR.durabilityLow)

    // The `weight` channel `CRITICAL_PAIRS` declares for slot-selected /
    // slot-border. Colour AND a pixel, so a player who cannot see the first can
    // still see which slot they are holding.
    expect(slots[1]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotSelected)
    expect(slots[1]?.style.properties.get('border-width')).toBe('3px')
    expect(slots[0]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotBorder)
    expect(slots[0]?.style.properties.get('border-width')).toBe('2px')
  })
})
