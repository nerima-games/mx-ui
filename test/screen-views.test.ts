/**
 * The other two screens that have a shape to render, and the accessibility
 * switch that finally has a consumer.
 *
 * Settings is deliberately NOT here. A settings screen is an INPUT surface —
 * `rebind` needs a `KeyboardEvent.code`, and the whole point of
 * `application/dom-surface.ts` having no `addEventListener` is that mx-ui cannot
 * take keys (DN-UI-4; the input service is mc-render's, plan.md §2.3-2). What a
 * settings renderer could draw today is a list of labels; what makes it a
 * settings screen is the half that belongs to another repository. Rendering the
 * labels and calling it done would put a screen in this repository whose central
 * behaviour is unreachable and untestable — which is the 「hook with nothing
 * behind it」 DN-UI-1a spent a paragraph rejecting.
 *
 * That argument survives the focus ring (DN-UI-13i), and it is worth saying why,
 * because the ring looks like a counter-example. Making a slot FOCUSABLE needs
 * `setAttribute` and nothing else; making a rebind field WORK needs a
 * `KeyboardEvent.code`, which needs a listener, which is not in the vocabulary.
 * "Focusable" and "operable" were never the same claim — the ring is the first,
 * a settings screen is the second.
 */
import { describe, expect, it } from 'vitest'
import { COLOR_VISION_FILTER_TARGET } from '../src/domain/accessibility'
import { captionLines, emptyCaptionQueue, receiveCaption, MAX_VISIBLE_CAPTIONS } from '../src/domain/caption'
import { emptyInventorySnapshot, inventoryViewModel } from '../src/domain/inventory-view-model'
import { applyColorVision, colorVisionCell, COLOR_VISION_ATTRIBUTE } from '../src/application/accessibility-dom'
import { createCaptionView } from '../src/application/caption-view'
import { createInventoryView } from '../src/application/inventory-view'
import { createHudView } from '../src/application/hud-view'
import { createSlotElement, updateSlotElement } from '../src/application/slot-element'
import type { SlotView } from '../src/domain/hud-view-model'
import { PALETTE_PROPERTY } from '../src/application/palette-css'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'

const enabled = { captionsEnabled: true, audioUnlocked: false }

const queueOf = (...texts: ReadonlyArray<string>) =>
  texts.reduce(
    (queue, text, index) =>
      receiveCaption(queue, { cueId: text, text, direction: 'left', atSecs: index }, enabled),
    emptyCaptionQueue,
  )

describe('captions are rendered as TEXT', () => {
  it('puts the caption in textContent, where a screen reader can reach it', () => {
    // plan.md §3.13 lists サウンド字幕 among the four assets, and TEXT is the word
    // that matters: a caption drawn on the canvas is invisible to assistive
    // technology, which is the population the feature exists for.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createCaptionView(factory, parent, 'full')
    view.render(captionLines(queueOf('Creeper hisses'), 0))

    const line = (view.root as FakeElement).find('data-mx-ui', 'caption-text')
    expect(line?.textContent).toBe('Creeper hisses')
    expect((view.root as FakeElement).find('data-mx-ui', 'caption-arrow')?.textContent).toBe('←')
    // A caption that appears silently is invisible to a screen reader even when
    // it is text.
    expect((view.root as FakeElement).attributes.get('aria-live')).toBe('polite')
  })

  it('allocates exactly MAX_VISIBLE_CAPTIONS lines and never more, however long the stream', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createCaptionView(factory, parent, 'full')
    const created = factory.created.length

    for (let index = 0; index < 40; index += 1) {
      view.render(captionLines(queueOf(`cue-${String(index)}`), index))
    }
    expect(factory.created.length).toBe(created)
    expect((view.root as FakeElement).findAll('data-mx-ui', 'caption-line')).toHaveLength(
      MAX_VISIBLE_CAPTIONS,
    )
  })

  it('REGRESSION: reduced motion suppresses the fade rather than shortening it', () => {
    // `domain/caption.ts` on `freshness`: 「the fade is a PRESENTATION property
    // and must be suppressed under reduced motion …the DOM layer is responsible
    // for asking」. A fading caption is least readable at the moment it is about
    // to vanish, which for a player reading instead of hearing is the wrong
    // trade twice.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createCaptionView(factory, parent, 'reduced')
    view.render(captionLines(queueOf('Zombie groans'), 2))

    const line = (view.root as FakeElement).find('data-mx-ui', 'caption-line')
    expect(line?.style.properties.get('opacity')).toBe('1')

    view.setMotion('full')
    expect(Number(line?.style.properties.get('opacity'))).toBeLessThan(1)
  })

  it('re-rendering the same lines mutates nothing', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createCaptionView(factory, parent, 'reduced')
    const lines = captionLines(queueOf('Arrow hits'), 0)

    view.render(lines)
    const before = factory.mark()
    view.render(lines)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('setting the motion preference it already has mutates nothing', () => {
    // The other half of the claim above, for the call the render loop does not
    // make: the settings screen writes the preference on every change, and a
    // `system` player whose OS reports the same answer twice gets
    // `setMotion('reduced')` twice.
    //
    // WHAT THIS DOES AND DOES NOT PIN, because a mutation run made the
    // difference visible and it is worth writing down rather than leaving as an
    // implication. Deleting `setMotion`'s `if (wanted === fades) return` leaves
    // this test — and the whole suite — GREEN. The property holds twice over:
    // the guard skips the projection, and `attributeCell` / `styleCell` skip
    // any write whose value has not changed, so the second projection produces
    // no mutation either way. What the guard buys is the LOOP, which is CPU and
    // is invisible to a fake DOM by construction.
    //
    // So this asserts the observable contract — an unchanged preference reaches
    // the document as nothing at all — and it is the cells that currently
    // uphold it. That is still the property worth having: it is the one a
    // reader depends on, and it would break if either mechanism were removed
    // WITHOUT the other, which is the realistic way to break it.
    //
    // Asserted through `writeNames` and not the raw mutations: `Mutation` holds
    // its target and the target holds the log, so deep-equalling the array on a
    // FAILURE — the only run that matters — walks a cycle and kills the runner.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createCaptionView(factory, parent, 'reduced')

    // A caption that has AGED, so that fading and not fading are different
    // opacities. A fresh line reads 1 either way, and against it this test would
    // pass with the early return deleted.
    view.render(captionLines(queueOf('Zombie groans'), 2))

    const before = factory.mark()
    view.setMotion('reduced')
    expect(writeNames(factory.since(before))).toStrictEqual([])

    // …and the change that does move the preference still lands, so what is
    // being asserted above is the guard and not a renderer that stopped working.
    view.setMotion('full')
    expect(writeNames(factory.since(before))).toContain('style:opacity')
  })
})

describe('the inventory renderer keeps `unknown` a different screen from `empty`', () => {
  it('REGRESSION: an unknown region draws NO slots — it draws the reason', () => {
    // `domain/inventory-view-model.ts`: 「An armour rack drawn as four empty
    // squares tells the player they are wearing nothing; mc-sim has not said
    // that, and has in fact said nothing at all」. This is the layer where that
    // distinction is easiest to lose, because an empty grid and an absent grid
    // look almost the same in code.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    view.render(inventoryViewModel(emptyInventorySnapshot))

    const root = view.root as FakeElement
    const armour = root.find('data-region', 'armour')
    expect(armour?.attributes.get('data-region-state')).toBe('unknown')
    expect(armour?.find('data-mx-ui', 'region-grid')?.attributes.get('hidden')).toBe('')
    expect(armour?.find('data-mx-ui', 'region-note')?.textContent).toContain('armour rack')

    const main = root.find('data-region', 'main')
    expect(main?.attributes.get('data-region-state')).toBe('slots')
    expect(main?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
  })

  it('REGRESSION: `no-match` and `unknown` crafting are different states, and neither draws an output', () => {
    // A frame may still carry `unknown` when no recipe answer is available. An
    // empty output square would mean 「no recipe」 in
    // one case and 「mc-sim has not answered」 in the other, and the player cannot
    // tell those apart by looking at nothing.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    view.render(inventoryViewModel(emptyInventorySnapshot))

    const root = view.root as FakeElement
    expect(root.find('data-mx-ui', 'crafting-outcome')?.attributes.get('data-crafting-state')).toBe(
      'unknown',
    )
    expect(root.find('data-mx-ui', 'crafting-output')?.attributes.get('hidden')).toBe('')
  })

  it('a carried stack is drawn, and putting it down hides the square again', () => {
    // `carried` is the stack on the cursor mid-drag. It is the one part of this
    // screen that appears and disappears WITHIN a session rather than between
    // builds, so both directions matter: a square left showing after the player
    // drops a stack is an item that looks like it is still in hand.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)

    view.render(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        carried: { item: 'stone', count: 12 },
      }),
    )

    const carried = (view.root as FakeElement).find('data-mx-ui', 'carried')
    expect(carried?.attributes.has('hidden')).toBe(false)
    expect(carried?.find('data-mx-ui', 'slot-item')?.textContent).toBe('stone')

    view.render(inventoryViewModel(emptyInventorySnapshot))
    expect(carried?.attributes.get('hidden')).toBe('')
  })

  it('a crafting MATCH is the one state that draws an output square', () => {
    // The positive half of the `no-match` / `unknown` regression above, which
    // asserts two states draw nothing and therefore passes against a renderer
    // that draws nothing ever. Pinning the positive case keeps those two
    // negative states from becoming an excuse to hide every output.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)

    view.render(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: { item: 'stick', count: 4 } },
        },
      }),
    )

    const root = view.root as FakeElement
    expect(root.find('data-mx-ui', 'crafting-outcome')?.attributes.get('data-crafting-state')).toBe(
      'match',
    )
    const output = root.find('data-mx-ui', 'crafting-output')
    expect(output?.attributes.has('hidden')).toBe(false)
    expect(output?.find('data-mx-ui', 'slot-item')?.textContent).toBe('stick')
  })

  it('projects host-owned inventory interaction as buttons with one roving tab stop', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    view.render(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: { item: 'stick', count: 4 } },
        },
      }),
    )
    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      carried: { item: 'stone', count: 12 },
      crafting: {
        gridWidth: 2,
        grid: [undefined, undefined, undefined, undefined],
        result: { _tag: 'NoMatch' },
      },
    })

    view.render(model, {
      focused: { kind: 'crafting-output' },
      status: 'No matching recipe',
    })

    const root = view.root as FakeElement
    const buttons = root.findAll('role', 'button')
    expect(buttons).toHaveLength(41)
    expect(buttons.every((button) => button.attributes.has('aria-label'))).toBe(true)
    expect(buttons.every((button) => button.attributes.has('aria-disabled'))).toBe(true)
    expect(root.findAll('tabindex', '0')).toHaveLength(1)

    const output = root.find('data-mx-ui', 'crafting-output')
    expect(output?.attributes.has('hidden')).toBe(false)
    expect(output?.attributes.get('aria-disabled')).toBe('true')
    expect(output?.attributes.get('tabindex')).toBe('0')
    expect(output?.find('data-mx-ui', 'slot-item')?.textContent).toBe('')

    const carried = root.find('data-mx-ui', 'carried')
    expect(carried?.attributes.get('role')).toBe('status')
    expect(carried?.attributes.get('aria-live')).toBe('polite')
    expect(carried?.attributes.get('aria-label')).toContain('stone')

    const status = root.find('data-mx-ui', 'inventory-status')
    expect(status?.attributes.get('role')).toBe('status')
    expect(status?.attributes.get('aria-live')).toBe('polite')
    expect(status?.textContent).toBe('No matching recipe')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('normalizes an unavailable focus target and restores the read-only DOM contract', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    const model = inventoryViewModel(emptyInventorySnapshot)

    view.render(model, {
      focused: { kind: 'crafting-output' },
      status: 'Inventory open',
    })

    const root = view.root as FakeElement
    expect(root.findAll('tabindex', '0')).toHaveLength(1)
    expect(root.findAll('role', 'button')).toHaveLength(36)

    view.render(model)
    expect(root.findAll('role', 'button')).toHaveLength(0)
    expect(root.findAll('tabindex', '0')).toHaveLength(0)
    expect(root.findAll('tabindex', '-1')).toHaveLength(0)
    expect(root.find('data-mx-ui', 'crafting-output')?.attributes.get('hidden')).toBe('')
    expect(root.find('data-mx-ui', 'inventory-status')?.textContent).toBe('')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('a region that SHRINKS hides its surplus squares rather than leaving stale items in them', () => {
    // `renderRegion` only ever GROWS `region.slots` — there is no `pop`, because
    // destroying and recreating elements is what makes a re-render cost more
    // than the change did. The consequence is that the element count is the
    // high-water mark of every model this view has seen, and a smaller model
    // has to hide the difference.
    //
    // Left undone, the squares beyond the new end keep the items the LARGER
    // model put in them: a crafting grid that shrinks from 3x3 to 2x2 would show
    // the four corner ingredients of the recipe before it, which the player
    // reads as ingredients they still have.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)

    const grid = (size: number) =>
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: size,
          grid: Array.from({ length: size * size }, () => ({ item: 'stone', count: 1 })),
          result: { _tag: 'NoMatch' },
        },
      })

    view.render(grid(3))
    const crafting = (view.root as FakeElement).find('data-region', 'crafting-grid')
    expect(crafting?.findAll('data-mx-ui', 'slot')).toHaveLength(9)

    view.render(grid(2))
    // Still nine ELEMENTS — they are reused, not rebuilt…
    const squares = crafting?.findAll('data-mx-ui', 'slot') ?? []
    expect(squares).toHaveLength(9)
    // …and the five past the end of the smaller grid are hidden.
    expect(squares.filter((square) => square.attributes.has('hidden'))).toHaveLength(5)
  })

  it('a region that DISAPPEARS between renders is hidden, not left on screen', () => {
    // The same claim one level up: `regions` is a cache keyed by id and nothing
    // deletes from it, so a model that stops naming a region has to be answered
    // by hiding the element rather than by forgetting about it.
    //
    // This is how the crafting screen and the inventory screen can be the same
    // renderer. A view model with no crafting region must not leave the last
    // one visible underneath the inventory.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)

    const withCrafting = inventoryViewModel({
      ...emptyInventorySnapshot,
      crafting: { gridWidth: 2, grid: [undefined, undefined, undefined, undefined], result: undefined },
    })

    view.render(withCrafting)
    const crafting = (view.root as FakeElement).find('data-region', 'crafting-grid')
    expect(crafting?.attributes.has('hidden')).toBe(false)

    view.render({ ...withCrafting, regions: withCrafting.regions.filter((region) => region.id !== 'crafting-grid') })
    expect(crafting?.attributes.get('hidden')).toBe('')
  })

  it('the merge highlight is a DOM capability that exists — nothing in mx-ui asks for it yet', () => {
    // The renderer takes `mergeable` as a third argument and every call site in
    // this repository passes `undefined`, for the reason the regression below
    // states: the absolute-to-region index mapping is mc-sim's and mx-ui must
    // not invent it. So the flag has never been written, and "the highlight is
    // never drawn" and "the highlight cannot be drawn" look identical from the
    // outside.
    //
    // They are not the same, and the difference is what the regression below is
    // asserting is a DECISION rather than a gap. This is the other end of that
    // claim: hand the renderer `true` directly and the attribute appears, so the
    // day `domain/inventory-view-model.ts` publishes the offset there is a
    // working highlight waiting for it and not a second thing to build.
    //
    // `mergeable === true` and not a truthiness test: `undefined` means MC-SIM
    // HAS NOT ANSWERED, and an unanswered question must not paint the same
    // square as a definite "no".
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view: SlotView = {
      index: 0,
      itemId: 'stone',
      countLabel: '12',
      empty: false,
      selected: false,
      durabilityPercent: undefined,
    }

    updateSlotElement(slot, view, true)
    expect((slot.root as FakeElement).attributes.get('data-mergeable')).toBe('')

    updateSlotElement(slot, view, false)
    expect((slot.root as FakeElement).attributes.has('data-mergeable')).toBe(false)

    // The unanswered case paints exactly what the definite "no" paints, which is
    // nothing — the screen says nothing rather than saying "it does not merge".
    updateSlotElement(slot, view, undefined)
    expect((slot.root as FakeElement).attributes.has('data-mergeable')).toBe(false)
  })

  it('REGRESSION: highlights no merge target, because the index mapping is not published', () => {
    // `MergeTargets` carries ABSOLUTE inventory indices; `SlotView.index` is
    // REGION-LOCAL (`projectRegion` passes `offset`, not `firstIndex + offset`)
    // and `SlotRegion` does not publish `firstIndex`. Deriving the mapping here
    // — hotbar 0–8, main 9–44 — is a second copy of a layout fact the view model
    // owns, in a highlight the player reads as a promise. DN-UI-7c is the record
    // of what a second copy costs.
    //
    // This pins the ABSENCE. When `domain/inventory-view-model.ts` publishes the
    // offset, this test is the one that has to change.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    view.render(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        mergeableSlotIndices: new Set([0, 1, 2]),
      }),
    )

    // Compared by LENGTH, not deep-equalled. `findAll` returns `FakeElement`s,
    // and a `FakeElement` holds the shared mutation log, which holds every
    // `Mutation`, each of which holds its target — so deep-equalling the array
    // is only safe while it is empty. On the day a `data-mergeable` element
    // appears, the reporter would walk that cycle and kill the runner rather
    // than name the element. `writeNames` in `./fake-dom` states the general
    // rule; here the count IS the claim, so there is nothing to project.
    const root = view.root as FakeElement
    expect(root.findAll('data-mergeable', '')).toHaveLength(0)
  })

  it('re-rendering the same snapshot mutates nothing', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    const model = inventoryViewModel(emptyInventorySnapshot)

    view.render(model)
    const before = factory.mark()
    view.render(model)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})

describe('the colour-vision switch is applied to the canvas and to nothing else', () => {
  it('sets the attribute on the target it is handed, and removes it for `off`', () => {
    // DN-UI-1a: 「このモジュールが決めるのは値、スコープを決めるのはスタイルシート」.
    // `colorVisionAttribute('off')` is `undefined`, so `off` REMOVES rather than
    // writing `"off"` — 「a DOM layer that removes the attribute and leaves a
    // filter behind — or the reverse — is the bug this shape prevents」.
    const factory = fakeDocument()
    const canvas = factory.createElement('canvas') as FakeElement
    const cell = colorVisionCell(canvas)

    applyColorVision(cell, 'deuteranopia')
    expect(canvas.attributes.get(COLOR_VISION_ATTRIBUTE)).toBe('deuteranopia')

    applyColorVision(cell, 'off')
    expect(canvas.attributes.has(COLOR_VISION_ATTRIBUTE)).toBe(false)

    const before = factory.mark()
    applyColorVision(cell, 'off')
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('REGRESSION: no mx-ui screen ever carries the attribute — the filter is canvas-only', () => {
    // plan.md §3.13: 「canvasのみに適用」. `domain/accessibility.ts` names the
    // failure: correcting the whole document also transforms UI chrome authored
    // to a contrast floor, producing 「a HUD that is harder to read than the one
    // you started with」.
    //
    // `application/palette-css.ts` depends on this staying true: the palette is
    // declared on mx-ui's own root precisely so the tokens and this attribute
    // never share a scope, so a rule keyed on the attribute cannot reach a token.
    expect(COLOR_VISION_FILTER_TARGET).toBe('canvas')

    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const hud = createHudView(factory, parent, 'full')
    const canvas = factory.createElement('canvas') as FakeElement
    applyColorVision(colorVisionCell(canvas), 'protanopia')

    for (const element of (hud.root as FakeElement).walk()) {
      expect(element.attributes.has(COLOR_VISION_ATTRIBUTE)).toBe(false)
    }
    // And the canvas carries no palette token, so no selector on the attribute
    // can reach one.
    expect(canvas.style.properties.has(PALETTE_PROPERTY.heart)).toBe(false)
  })
})
