/**
 * What a screen looks like the instant it exists, before anything has happened.
 *
 * ---------------------------------------------------------------------------
 * What was ported
 * ---------------------------------------------------------------------------
 *
 * Three claims from the reference's boot and gameplay suites, all of them about
 * the state a screen is in before the player has done anything:
 *
 *   - `e2e/smoke/boot.e2e.ts` 「dynamic DOM elements are injected after game
 *     initialization」 — the HUD is BUILT, not markup;
 *   - `e2e/gameplay/inventory-management.e2e.ts` 「fresh survival inventory shows
 *     an empty hotbar and visible crafting section」;
 *   - `e2e/gameplay/player-controls.e2e.ts` 「hotbar slot 1 through 3 / 4 through
 *     9 can be selected by number keys」, which are the same claim twice and
 *     become one parameterised test here.
 *
 * The number KEY is mc-render's, exactly as the E key is in
 * `test/modal-flows.test.ts`. What mx-ui owns is what a told selection LOOKS
 * like, and the reference had to read `borderTopColor === 'rgb(255, 255, 255)'`
 * off a computed style to find out — a literal that agrees with `SLOT_SELECTED`
 * by coincidence and would have kept passing if the token moved.
 */
import { describe, expect, it } from 'vitest'
import {
  HOTBAR_SLOT_COUNT,
  hudViewModel,
  spawnSnapshot,
} from '../domain/hud-view-model'
import {
  emptyInventorySnapshot,
  INVENTORY_MAIN_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  inventoryViewModel,
} from '../domain/inventory-view-model'
import { createHudView } from '../application/hud-view'
import { createInventoryView } from '../application/inventory-view'
import { createCaptionView } from '../application/caption-view'
import { createSaveIndicator } from '../application/save-indicator'
import { PALETTE_VAR } from '../application/palette-css'
import { fakeDocument, type FakeElement } from './fake-dom'

/** What a host has had mounted into it, by name and in order. */
const mounted = (parent: FakeElement): ReadonlyArray<string | undefined> =>
  parent.children.map((child) => child.attributes.get('data-mx-ui'))

describe('a screen is built into the parent it was handed', () => {
  it('REGRESSION: every view appends its root to the host, and finds it nowhere else', () => {
    // `boot.e2e.ts` asserted `#crosshair` and `#settings-overlay` were ATTACHED
    // after initialisation, with the comment 「injected by JS after Effect layer
    // composition — NOT in index.html」. The claim is that the game builds its
    // own surfaces rather than inheriting them from a page.
    //
    // Here it is sharper, because `docs/public-api.md` §4-1 requires the parent
    // to be an ARGUMENT: `application/dom-surface.ts` has no `document.body` in
    // it, so a view cannot go looking. That is what lets a preview page stand up
    // two mx-ui instances at once, and a view that reached for a global would
    // make the second one overwrite the first.
    const factory = fakeDocument()
    const first = factory.createElement('div') as FakeElement
    const second = factory.createElement('div') as FakeElement

    createHudView(factory, first, 'full')
    createInventoryView(factory, second)
    createCaptionView(factory, second, 'full')
    createSaveIndicator(factory, first)

    // Compared as names rather than as elements. A `FakeElement` reaches the
    // whole mutation log through its children, so a failing deep comparison
    // serialises the entire document and dies — the test would stop reporting at
    // exactly the moment it had something to report.
    expect(mounted(first)).toStrictEqual(['hud', 'save-indicator'])
    expect(mounted(second)).toStrictEqual(['inventory', 'captions'])
  })

  it('two instances of the same screen share no element', () => {
    // The reason the parent is an argument, stated as the property it buys.
    // `apps/preview-screens` mounts more than one; so does any host that wants a
    // second HUD for a split screen.
    const factory = fakeDocument()
    const left = factory.createElement('div') as FakeElement
    const right = factory.createElement('div') as FakeElement

    const one = createHudView(factory, left, 'full')
    const other = createHudView(factory, right, 'full')
    one.render(hudViewModel({ ...spawnSnapshot, healthPoints: 4 }))
    other.render(hudViewModel(spawnSnapshot))

    const stateOf = (view: { readonly root: unknown }): ReadonlyArray<string | undefined> =>
      (view.root as FakeElement)
        .findAll('data-icon', 'heart')
        .map((icon) => icon.attributes.get('data-icon-state'))

    expect(stateOf(one)[0]).toBe('full')
    expect(stateOf(one)[3]).toBe('empty')
    expect(stateOf(other)[3]).toBe('full')
  })
})

describe('a fresh survival inventory', () => {
  it('draws nine empty hotbar squares and a crafting section', () => {
    // `inventory-management.e2e.ts`, and `docs/e2e-triage.md` §3.6 is blunt
    // about what it is worth: the file is named for inventory MANAGEMENT and
    // 「アイテムの追加も削除も移動も 1 つも主張していない」. So this port carries
    // exactly what the original carried and no more — the shape of the screen a
    // player sees the first time they open it — and the mining-to-hotbar claim
    // it does NOT make stays where the triage put it, in mc-compose's #32.
    //
    // What it defends against: a fresh player opening their inventory to a
    // hotbar row that is missing, short, or already showing items nobody gave
    // them.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createInventoryView(factory, parent)
    view.render(inventoryViewModel(emptyInventorySnapshot))

    const root = view.root as FakeElement
    const hotbar = root.find('data-region', 'hotbar')
    const slots = hotbar?.findAll('data-mx-ui', 'slot') ?? []

    expect(hotbar?.attributes.get('data-region-state')).toBe('slots')
    expect(slots).toHaveLength(HOTBAR_SLOT_COUNT)
    // Empty, and empty by the derivation's own flag rather than by an absent
    // label — DN-UI-7c is the record of what happens when those two are allowed
    // to disagree.
    expect(slots.every((slot) => slot.attributes.get('data-empty') === '')).toBe(true)
    expect(slots.every((slot) => slot.find('data-mx-ui', 'slot-item')?.textContent === '')).toBe(
      true,
    )

    // The reference checked `overlay.textContent?.includes('Crafting')`. The
    // section is a structural element here, so the port asks for the section
    // rather than for the word.
    const crafting = root.find('data-mx-ui', 'crafting-outcome')
    expect(crafting).toBeDefined()
    expect(crafting?.attributes.has('hidden')).toBe(false)

    // And the main grid, so "the hotbar is nine" is not satisfied by a screen
    // that lost the other twenty-seven.
    //
    // The literal is deliberate. Asserting `INVENTORY_MAIN_SLOT_COUNT` here
    // reads better and proves nothing — it is derived from the same constant the
    // renderer counts with, so shrinking the grid to two rows keeps the test
    // green. 27 is vanilla's number and the reference's
    // (`inventory-overlay.e2e.ts:48`: 「27 main inventory + 9 hotbar = 36」), and
    // a player whose bottom row of storage disappeared is what this is about.
    expect(root.find('data-region', 'main')?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
    expect(INVENTORY_MAIN_SLOT_COUNT).toBe(27)
    expect(HOTBAR_SLOT_COUNT + INVENTORY_MAIN_SLOT_COUNT).toBe(INVENTORY_SLOT_COUNT)
  })
})

describe('the hotbar shows the slot it was told is selected', () => {
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
    it(`slot ${String(index + 1)} is the only one drawn as selected`, () => {
      // `player-controls.e2e.ts` needed two tests, an inventory open, an
      // inventory close and a 700 ms sleep per digit to ask this, and asked it
      // by comparing a computed border colour against the literal
      // `rgb(255, 255, 255)`.
      //
      // ONLY-ness is the part worth keeping. A HUD showing two selected slots is
      // a player who cannot tell what they are about to place, and it is the
      // failure a per-slot assertion misses entirely: check slot 3 and slot 3 is
      // fine.
      const factory = fakeDocument()
      const parent = factory.createElement('div') as FakeElement
      const view = createHudView(factory, parent, 'full')
      view.render(hudViewModel({ ...spawnSnapshot, selectedHotbarIndex: index }))

      const slots = (view.root as FakeElement).findAll('data-mx-ui', 'slot')
      expect(slots).toHaveLength(HOTBAR_SLOT_COUNT)

      const selected = slots
        .map((slot, at) => ({ at, marked: slot.attributes.has('data-selected') }))
        .filter((entry) => entry.marked)
        .map((entry) => entry.at)
      expect(selected).toStrictEqual([index])

      // The colour, through the token rather than through the reference's
      // literal. `SLOT_SELECTED` is `[255, 255, 255]` today; if it moves, this
      // follows it and the reference's assertion would not have.
      expect(slots[index]?.style.properties.get('border-color')).toBe(PALETTE_VAR.slotSelected)
      for (const other of slots.filter((_, at) => at !== index)) {
        expect(other.style.properties.get('border-color')).toBe(PALETTE_VAR.slotBorder)
      }
    })
  }

  it('REGRESSION: the selection is the GAME’s answer and the ring is the KEYBOARD’s', () => {
    // The reference read one border colour and could not have told these apart.
    // `domain/palette.ts` keeps `SLOT_SELECTED` and `FOCUS_RING` distinct
    // precisely because 「a player who is navigating by keyboard is asking both
    // at once」, and a number key must move the first without disturbing the
    // second.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createHudView(factory, parent, 'full')

    view.setKeyboardFocus(6)
    view.render(hudViewModel({ ...spawnSnapshot, selectedHotbarIndex: 2 }))

    const slots = (view.root as FakeElement).findAll('data-mx-ui', 'slot')
    const ringVisible = (at: number): boolean =>
      slots[at]?.find('data-mx-ui', 'slot-focus-ring')?.attributes.has('hidden') === false

    expect(slots[2]?.attributes.has('data-selected')).toBe(true)
    expect(ringVisible(2)).toBe(false)
    expect(slots[6]?.attributes.has('data-selected')).toBe(false)
    expect(ringVisible(6)).toBe(true)
  })
})
