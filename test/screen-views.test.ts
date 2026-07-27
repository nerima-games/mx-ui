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
import { COLOR_VISION_FILTER_TARGET } from '../domain/accessibility'
import { captionLines, emptyCaptionQueue, receiveCaption, MAX_VISIBLE_CAPTIONS } from '../domain/caption'
import { emptyInventorySnapshot, inventoryViewModel } from '../domain/inventory-view-model'
import { applyColorVision, colorVisionCell, COLOR_VISION_ATTRIBUTE } from '../application/accessibility-dom'
import { createCaptionView } from '../application/caption-view'
import { createInventoryView } from '../application/inventory-view'
import { createHudView } from '../application/hud-view'
import { PALETTE_PROPERTY } from '../application/palette-css'
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
    // mc-sim has no recipe model (`api-lock.md` has no `Recipe`), so the real
    // value today is `unknown`. An empty output square would mean 「no recipe」 in
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
