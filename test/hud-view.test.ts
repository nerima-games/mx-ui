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
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EntityHealthPoints, StackCount, itemStack, type ItemType } from '@nerima-games/mc-kernel'
import { Result, Schema } from 'effect'
import {
  DEFAULT_MAX_HEALTH_POINTS,
  DEFAULT_MAX_HUNGER_POINTS,
  HOTBAR_SIZE,
  InventoryCarriedSlotSchema,
  SPAWN_VITALS,
  VitalsSchema,
  type InventoryCarriedSlot,
  type Vitals,
} from '@nerima-games/mc-sim'
import {
  HEALTH_POINTS_PER_HEART,
  hotbarSlotIndex,
  hudViewModel as projectHudViewModel,
  slotView,
} from '../src/domain/hud-view-model'
import { HEART, ICON_EMPTY, SCRIM, SCRIM_ALPHA, cssColor } from '../src/domain/palette'
import { createHudView, EXPERIENCE_TRANSITION_MS } from '../src/application/hud-view'
import { FOCUS_RING_SHADOW_WIDTH, FOCUS_RING_WIDTH } from '../src/application/slot-element'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../src/application/palette-css'
import { fakeDocument, fakeElement, writeNames, type FakeElement } from './fake-dom'

const mount = (motion: 'full' | 'reduced' = 'full') => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('body'))
  const view = createHudView(factory, parent, motion)
  return { factory, parent, view, root: fakeElement(view.root) }
}

const emptyHotbar = Array.from(
  { length: HOTBAR_SIZE },
  (): InventoryCarriedSlot => undefined,
)

const hudViewModel = (
  vitals: Vitals = SPAWN_VITALS,
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot> = emptyHotbar,
  selectedHotbarSlot = 0,
) => projectHudViewModel(vitals, hotbarSlots, selectedHotbarSlot)

const damaged = (healthPoints: number): Vitals => ({
  ...SPAWN_VITALS,
  healthPoints: EntityHealthPoints(healthPoints),
})

const EXPANDED_MAX_HEALTH_POINTS = 30

const maxedVitals = (): Vitals => ({
  ...SPAWN_VITALS,
  healthPoints: EntityHealthPoints(EXPANDED_MAX_HEALTH_POINTS),
  maxHealthPoints: EntityHealthPoints(EXPANDED_MAX_HEALTH_POINTS),
})

const carriedSlot = (
  item: ItemType,
  count: number,
  durability: { readonly current: number; readonly max: number },
): InventoryCarriedSlot => {
  const result = itemStack(item, StackCount(count))
  if (Result.isFailure(result)) {
    throw new Error('test item stack must be valid')
  }
  return { ...result.success, durability }
}

const decodeOwnerVitals = Schema.decodeUnknownResult(VitalsSchema, {
  onExcessProperty: 'error',
})

// mc-sim exports this synchronous schema as Schema<unknown>, which omits the
// no-service decoder metadata needed by decodeUnknownResult.
const isOwnerCarriedSlot = Schema.is(InventoryCarriedSlotSchema)

const decodeOwnerVitalsOrThrow = (input: unknown): Vitals => {
  const decoded = decodeOwnerVitals(input)
  if (Result.isFailure(decoded)) {
    throw decoded.failure
  }
  return decoded.success
}

const assertOwnerCarriedSlot = (slot: InventoryCarriedSlot): InventoryCarriedSlot => {
  if (!isOwnerCarriedSlot(slot)) {
    throw new Error('owner carried-slot schema must accept a valid slot')
  }
  return slot
}

const expectOwnerSchemaFailure = <A>(
  decoded: Result.Result<A, Schema.SchemaError>,
): void => {
  expect(Result.isFailure(decoded)).toBe(true)
  if (Result.isFailure(decoded)) {
    expect(decoded.failure).toBeInstanceOf(Schema.SchemaError)
  }
}

const ownerCarriedSlotForCount = (count: number): Exclude<InventoryCarriedSlot, undefined> => {
  const stack = itemStack('stone', StackCount(count))
  if (Result.isFailure(stack)) {
    throw stack.failure
  }
  if (stack.success === undefined) {
    throw new Error('test item stack must contain one item')
  }
  assertOwnerCarriedSlot(stack.success)
  return stack.success
}

const validOwnerVitalsArbitrary = fc
  .record({
    maxHealthPoints: fc.integer({ min: 1, max: 40 }),
    healthOffset: fc.integer({ min: 0, max: 40 }),
    maxHungerPoints: fc.integer({ min: 0, max: 40 }),
    hungerOffset: fc.integer({ min: 0, max: 40 }),
    saturationOffset: fc.integer({ min: 0, max: 40 }),
    exhaustion: fc.double({ min: 0, max: 3.999, noNaN: true }),
    foodTimerSecs: fc.double({ min: 0, max: 3.999, noNaN: true }),
    totalExperience: fc.integer({ min: 0, max: 10_000 }),
    lastDamageCause: fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
  })
  .map(
    ({
      maxHealthPoints,
      healthOffset,
      maxHungerPoints,
      hungerOffset,
      saturationOffset,
      ...rest
    }) => {
      const hungerPoints = Math.min(hungerOffset, maxHungerPoints)
      return {
        ...rest,
        healthPoints: Math.min(healthOffset, maxHealthPoints),
        maxHealthPoints,
        hungerPoints,
        maxHungerPoints,
        saturation: Math.min(saturationOffset, hungerPoints),
      }
    },
  )

const validHotbarCountsArbitrary = fc.array(
  fc.option(fc.integer({ min: 1, max: 64 }), { nil: undefined }),
  { minLength: 0, maxLength: HOTBAR_SIZE },
)

const pointsShownByIcons = (icons: ReadonlyArray<'full' | 'half' | 'empty'>): number =>
  icons.reduce((total, icon) => total + (icon === 'full' ? 2 : icon === 'half' ? 1 : 0), 0)

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
    view.render(hudViewModel(SPAWN_VITALS))

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
    const fullHeartCount = DEFAULT_MAX_HEALTH_POINTS / HEALTH_POINTS_PER_HEART
    expect(hearts).toHaveLength(fullHeartCount)

    const glyphs = hearts.map((icon) => [icon.children[0]?.textContent, icon.children[1]?.children[0]?.textContent])
    // Hollow behind, solid in front — two different characters, on every icon.
    expect(new Set(glyphs.map((pair) => pair.join('/')))).toStrictEqual(new Set(['♡/♥']))

    const widths = hearts.map((icon) => icon.children[1]?.style.properties.get('width'))
    // Nine full, one half — DN-UI-6's 「A player on half a heart needs to see
    // half a heart」, expressed as a clip rather than as a colour.
    expect(widths).toStrictEqual([...Array<string>(fullHeartCount - 1).fill('100%'), '50%'])
    expect(hearts.map((icon) => icon.attributes.get('data-icon-state'))).toStrictEqual([
      ...Array<string>(fullHeartCount - 1).fill('full'),
      'half',
    ])
  })

  it('gives hearts and shanks different glyph pairs — the channel that carries most of that signal', () => {
    // `heart full / shank full` is 49 units and 1.21:1 apart: separated by
    // CHROMA, 「which is the channel dichromacy compresses hardest」. The palette
    // says outright that the shapes are 「most of the signal」 for this pair.
    const { view, root } = mount()
    view.render(hudViewModel(SPAWN_VITALS))

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
    const hearts = root.findAll('data-icon', 'heart')
    expect(hearts[DEFAULT_MAX_HEALTH_POINTS / HEALTH_POINTS_PER_HEART - 1]?.attributes.get('data-icon-state')).toBe('half')
  })

  it('creates no element on a steady frame, and grows the row only when the maximum does', () => {
    const { factory, view } = mount()
    view.render(hudViewModel(SPAWN_VITALS))
    const created = factory.created.length

    for (let frame = 0; frame < 16; frame += 1) {
      view.render(hudViewModel(damaged(20 - frame)))
    }
    expect(factory.created.length).toBe(created)

    view.render(
      hudViewModel(maxedVitals()),
    )
    // Owner supplied max health expands the projected row from ten hearts to fifteen.
    expect(factory.created.length).toBeGreaterThan(created)
  })

  it('hides a surplus icon rather than removing it, and stops writing once hidden', () => {
    const { factory, view, root } = mount()
    view.render(hudViewModel(maxedVitals()))
    view.render(hudViewModel(SPAWN_VITALS))

    const hearts = root.findAll('data-icon', 'heart')
    expect(hearts).toHaveLength(EXPANDED_MAX_HEALTH_POINTS / HEALTH_POINTS_PER_HEART)
    expect(hearts[14]?.attributes.get('hidden')).toBe('')

    const before = factory.mark()
    view.render(hudViewModel(SPAWN_VITALS))
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
      ...Array<string>(HOTBAR_SIZE - 1).fill('-1'),
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
    view.render(hudViewModel(SPAWN_VITALS, emptyHotbar, 1))
    view.setKeyboardFocus(HOTBAR_SIZE - 2)

    const slots = root.findAll('data-mx-ui', 'slot')
    expect(slots[1]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotSelected)
    expect(ringOf(slots[1])?.attributes.get('hidden')).toBe('')
    expect(slots[HOTBAR_SIZE - 2]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotBorder)
    expect(ringOf(slots[HOTBAR_SIZE - 2])?.attributes.has('hidden')).toBe(false)
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
    // Both indices arrive from across a boundary and both can be `HOTBAR_SIZE`, `-1` or
    // `NaN`. A HUD that loses its selection and a ring that vanishes are the same
    // bug twice, so there is one `hotbarSlotIndex` and not two copies of it.
    const { root, view } = mount()
    const slots = root.findAll('data-mx-ui', 'slot')

    view.setKeyboardFocus(HOTBAR_SIZE)
    expect(slots[HOTBAR_SIZE - 1]?.attributes.get('tabindex')).toBe('0')
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
    view.render(hudViewModel(SPAWN_VITALS))
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
    view.render(hudViewModel(SPAWN_VITALS))
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
    view.render(hudViewModel(SPAWN_VITALS, [undefined]))

    const [slot] = root.findAll('data-mx-ui', 'slot')
    expect(slot?.attributes.get('data-empty')).toBe('')
    expect(slot?.find('data-mx-ui', 'slot-durability')?.attributes.get('hidden')).toBe('')
  })

  it('does not show durability for an owner slot without durability metadata', () => {
    const stack = itemStack('stone', StackCount(1))
    if (Result.isFailure(stack)) {
      throw new Error('test item stack must be valid')
    }

    const { view, root } = mount()
    view.render(hudViewModel(SPAWN_VITALS, [stack.success]))

    const [slot] = root.findAll('data-mx-ui', 'slot')
    expect(slot?.find('data-mx-ui', 'slot-durability')?.attributes.get('hidden')).toBe('')
  })

  it('keeps shared screen slots on their local durability projection', () => {
    expect(slotView({ itemId: 'stone', count: 1, durability: 0.25 }, 0, 0).durabilityPercent).toBe(25)
    expect(slotView({ itemId: 'stone', count: 1 }, 0, 0).durabilityPercent).toBeUndefined()
  })

  it('switches the durability bar to the alert token below the threshold, and widens the border on selection', () => {
    const { view, root } = mount()
    view.render(
      hudViewModel(
        SPAWN_VITALS,
        [
          carriedSlot('iron_pickaxe', 1, { current: 80, max: 100 }),
          carriedSlot('iron_sword', 1, { current: 10, max: 100 }),
        ],
        1,
      ),
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

  it('REGRESSION: a shorter hotbar than the DOM leaves the surplus slot elements untouched', () => {
    // A caller may hand the renderer a shorter projection than the simulation's
    // usual hotbar, and surplus DOM slots remain stable.
    const { view, root } = mount()
    expect(() =>
      view.render({
        dead: false,
        experienceLevelLabel: '',
        experiencePercent: 0,
        hearts: [],
        hotbar: [],
        shanks: [],
      }),
    ).not.toThrow()
    expect(root.findAll('data-mx-ui', 'slot')).toHaveLength(HOTBAR_SIZE)
  })
})

describe('HUD owner projection contracts', () => {
  it('accepts fixed owner boundaries and reports typed failures just outside them', () => {
    for (const points of [0, 1, 2, 19, 20]) {
      const vitals = decodeOwnerVitalsOrThrow({
        ...SPAWN_VITALS,
        healthPoints: points,
        hungerPoints: points,
        saturation: points,
      })
      const model = projectHudViewModel(vitals, [], 0)

      expect(model.hearts).toHaveLength(Math.ceil(DEFAULT_MAX_HEALTH_POINTS / HEALTH_POINTS_PER_HEART))
      expect(pointsShownByIcons(model.hearts)).toBe(points)
      expect(model.shanks).toHaveLength(Math.ceil(DEFAULT_MAX_HUNGER_POINTS / HEALTH_POINTS_PER_HEART))
      expect(pointsShownByIcons(model.shanks)).toBe(points)
    }

    const noHunger = decodeOwnerVitalsOrThrow({
      ...SPAWN_VITALS,
      maxHungerPoints: 0,
      hungerPoints: 0,
      saturation: 0,
    })
    expect(projectHudViewModel(noHunger, [], 0).shanks).toStrictEqual([])

    const outOfRangeVitals: ReadonlyArray<unknown> = [
      { ...SPAWN_VITALS, maxHealthPoints: 0 },
      { ...SPAWN_VITALS, healthPoints: -1 },
      { ...SPAWN_VITALS, healthPoints: DEFAULT_MAX_HEALTH_POINTS + 1 },
      { ...SPAWN_VITALS, maxHungerPoints: 0, hungerPoints: 1, saturation: 0 },
      { ...SPAWN_VITALS, hungerPoints: -1, saturation: 0 },
      { ...SPAWN_VITALS, hungerPoints: DEFAULT_MAX_HUNGER_POINTS + 1 },
      { ...SPAWN_VITALS, hungerPoints: 5, saturation: 6 },
      { ...SPAWN_VITALS, exhaustion: 4 },
      { ...SPAWN_VITALS, foodTimerSecs: 4 },
    ]
    for (const input of outOfRangeVitals) {
      expectOwnerSchemaFailure(decodeOwnerVitals(input))
    }

    const missingHealth: Record<string, unknown> = { ...SPAWN_VITALS }
    delete missingHealth['healthPoints']
    expectOwnerSchemaFailure(decodeOwnerVitals(missingHealth))
    expectOwnerSchemaFailure(
      decodeOwnerVitals({ ...SPAWN_VITALS, healthPoints: null }),
    )
    expectOwnerSchemaFailure(
      decodeOwnerVitals({ ...SPAWN_VITALS, mxUiOnly: true }),
    )

    const validSlot = ownerCarriedSlotForCount(1)
    assertOwnerCarriedSlot(undefined)
    expect(isOwnerCarriedSlot(null)).toBe(false)
    expect(isOwnerCarriedSlot({ item: validSlot.item, count: validSlot.count })).toBe(false)
    expect(isOwnerCarriedSlot({ ...validSlot, count: 0 })).toBe(false)
    expect(isOwnerCarriedSlot({ ...validSlot, item: 'unknown-owner-item' })).toBe(false)
  })

  it('projects generated strict-schema vitals and owner hotbar slots', () => {
    const validSlot = ownerCarriedSlotForCount(1)
    const missingHealth: Record<string, unknown> = { ...SPAWN_VITALS }
    delete missingHealth['healthPoints']
    const fixedSchemaCases = {
      acceptedPoints: [0, 1, 2, 19, 20],
      malformedVitals: [
        { ...SPAWN_VITALS, maxHealthPoints: 0 },
        { ...SPAWN_VITALS, healthPoints: -1 },
        { ...SPAWN_VITALS, healthPoints: DEFAULT_MAX_HEALTH_POINTS + 1 },
        { ...SPAWN_VITALS, maxHungerPoints: 0, hungerPoints: 1, saturation: 0 },
        { ...SPAWN_VITALS, hungerPoints: -1, saturation: 0 },
        { ...SPAWN_VITALS, hungerPoints: DEFAULT_MAX_HUNGER_POINTS + 1 },
        { ...SPAWN_VITALS, hungerPoints: 5, saturation: 6 },
        { ...SPAWN_VITALS, exhaustion: 4 },
        { ...SPAWN_VITALS, foodTimerSecs: 4 },
        missingHealth,
        { ...SPAWN_VITALS, healthPoints: null },
        { ...SPAWN_VITALS, mxUiOnly: true },
      ],
      malformedSlots: [
        null,
        { item: validSlot.item, count: validSlot.count },
        { ...validSlot, count: 0 },
        { ...validSlot, item: 'unknown-owner-item' },
      ],
    }

    fc.assert(
      fc.property(
        validOwnerVitalsArbitrary,
        validHotbarCountsArbitrary,
        fc.integer({ min: -20, max: 20 }),
        fc.constant(fixedSchemaCases),
        (rawVitals, counts, selectedHotbarSlot, schemaCases) => {
          const vitals = decodeOwnerVitalsOrThrow(rawVitals)
          const slots = counts.map((count) =>
            count === undefined
              ? assertOwnerCarriedSlot(undefined)
              : ownerCarriedSlotForCount(count),
          )
          const model = projectHudViewModel(vitals, slots, selectedHotbarSlot)
          const selectedIndex = hotbarSlotIndex(selectedHotbarSlot)
          const expectedHotbar = slots.map((slot, index) => ({
            countLabel:
              slot === undefined || slot.count <= 1 ? undefined : String(slot.count),
            durabilityPercent: undefined,
            empty: slot === undefined,
            index,
            itemId: slot?.item,
            selected: index === selectedIndex,
          }))

          expect(model.hearts).toHaveLength(
            Math.ceil(rawVitals.maxHealthPoints / HEALTH_POINTS_PER_HEART),
          )
          expect(pointsShownByIcons(model.hearts)).toBe(rawVitals.healthPoints)
          expect(model.shanks).toHaveLength(
            Math.ceil(rawVitals.maxHungerPoints / HEALTH_POINTS_PER_HEART),
          )
          expect(pointsShownByIcons(model.shanks)).toBe(rawVitals.hungerPoints)
          expect(model.hotbar).toStrictEqual(expectedHotbar)
          expect(model.dead).toBe(rawVitals.healthPoints === 0)

          for (const points of schemaCases.acceptedPoints) {
            const boundaryVitals = decodeOwnerVitalsOrThrow({
              ...SPAWN_VITALS,
              healthPoints: points,
              hungerPoints: points,
              saturation: points,
            })
            const boundaryModel = projectHudViewModel(boundaryVitals, [], 0)

            expect(pointsShownByIcons(boundaryModel.hearts)).toBe(points)
            expect(pointsShownByIcons(boundaryModel.shanks)).toBe(points)
          }

          for (const input of schemaCases.malformedVitals) {
            expectOwnerSchemaFailure(decodeOwnerVitals(input))
          }
          for (const input of schemaCases.malformedSlots) {
            expect(isOwnerCarriedSlot(input)).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
