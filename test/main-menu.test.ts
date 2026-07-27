/**
 * The main menu — five demoted rows that were waiting on a screen.
 *
 * ---------------------------------------------------------------------------
 * What was ported
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/e2e/smoke/boot.e2e.ts` 「main menu renders on boot」 and the
 * five demoted tests of `<reference-impl>/e2e/ui/main-menu.e2e.ts`:
 *
 *   - 「shows title, play buttons, and Options」 — including the ABSENCE it
 *     asserts, `#mm-quit` at count 0;
 *   - 「New World flow shows world name input and confirm button」;
 *   - 「New World cancel returns to main menu root」;
 *   - 「Load World back button returns to root」;
 *   - 「no fatal startup errors on menu display」.
 *
 * Every one of them drives a POINTER — `page.click('#mm-new-world')` — and the
 * pointer is not here, exactly as the E key is not in `test/modal-flows.test.ts`
 * and the number key is not in `test/screen-mount.test.ts`. mc-render owns input
 * (plan.md §2.3-2); mx-ui owns where the menu then is and what that looks like.
 * That is not a weaker claim about the same thing — it is the whole claim about
 * the half this repository owns.
 *
 * The last of the five is the one that changed most. 「no fatal startup errors」
 * is 「does not crash」, and `docs/e2e-triage.md` §3.5 has already ruled on that
 * form of words when it marked #16/#17 OBSOLETE: 「クラッシュしない」は主張ではない.
 * What it becomes here is a totality sweep — every reachable state renders, and
 * every one of them leaves EXACTLY ONE card up — which is a claim, and one a
 * console monitor could never have made.
 *
 * ---------------------------------------------------------------------------
 * What is NOT here
 * ---------------------------------------------------------------------------
 *
 * Editing the world name. Reading a value back out of a field needs `value` on
 * `application/dom-surface.ts` and knowing it changed needs a listener; both are
 * the settings screen's problem (`test/screen-views.test.ts`), and the draft is
 * therefore state that arrives rather than state this repository reads. What is
 * askable — and is asked below — is the derivation the reference buried inside
 * its confirm handler: what a world with an empty name would actually be called.
 *
 * Plain `it`, not `it.effect`, per DN-UI-2 and `docs/testing.md` §3.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_NAME,
  GAME_MODES,
  MENU_PANELS,
  ROOT_ENTRIES,
  backToRoot,
  cycleGameMode,
  cycleWorldMode,
  emptyNewWorldDraft,
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  worldNameLabel,
  type MainMenuState,
} from '../domain/main-menu'
import {
  GAME_MODE_LABEL,
  MAIN_MENU_TITLE,
  MENU_FIELD_LABEL,
  MENU_PANEL_LABEL,
  ROOT_ENTRY_LABEL,
  createMainMenuView,
} from '../application/main-menu-view'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../application/palette-css'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'

const mount = () => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement
  const view = createMainMenuView(factory, parent)
  return { factory, parent, view, root: view.root as FakeElement }
}

const show = (state: MainMenuState) => {
  const mounted = mount()
  mounted.view.render(mainMenuViewModel(state))
  return mounted
}

/** Which cards are up. The answer must always have exactly one member. */
const visiblePanels = (root: FakeElement): ReadonlyArray<string | undefined> =>
  root
    .findAll('data-mx-ui', 'menu-panel')
    .filter((panel) => !panel.attributes.has('hidden'))
    .map((panel) => panel.attributes.get('data-menu-panel'))

describe('the menu is built into the parent it was handed', () => {
  it('REGRESSION: mounts into the host and opens on its root card', () => {
    // `boot.e2e.ts` 「main menu renders on boot」 asserted `#mm-new-world` was
    // visible after initialisation, with the point being that the game builds
    // its own surfaces rather than inheriting them from a page. Sharper here:
    // `docs/public-api.md` §4-1 makes the parent an ARGUMENT, so a view cannot
    // go looking — which is what lets a preview stand up two at once.
    const { parent, root } = show(initialMainMenuState)

    expect(parent.children.map((child) => child.attributes.get('data-mx-ui'))).toStrictEqual([
      'main-menu',
    ])
    expect(root.attributes.get('data-menu-showing')).toBe('root')
    expect(visiblePanels(root)).toStrictEqual(['root'])
  })

  it('two instances share no element', () => {
    // The reason the parent is an argument, stated as the property it buys.
    const factory = fakeDocument()
    const left = factory.createElement('div') as FakeElement
    const right = factory.createElement('div') as FakeElement

    const one = createMainMenuView(factory, left)
    const other = createMainMenuView(factory, right)
    one.render(mainMenuViewModel(openPanel(initialMainMenuState, 'load-world')))
    other.render(mainMenuViewModel(initialMainMenuState))

    expect(visiblePanels(one.root as FakeElement)).toStrictEqual(['load-world'])
    expect(visiblePanels(other.root as FakeElement)).toStrictEqual(['root'])
  })
})

describe('the root card shows a title, the play entries and Options', () => {
  it('shows exactly the three entries the reference asserts, in order', () => {
    // `main-menu.e2e.ts:17-19` locates `#mm-new-world`, `#mm-load-world` and
    // `#mm-settings`. What it could not check without a screen reader — that
    // each of them announces as something — is checked here, because a menu of
    // three unnamed lines is a menu nobody can navigate by voice.
    const { root } = show(initialMainMenuState)

    const entries = root.findAll('data-mx-ui', 'menu-entry')
    expect(entries.map((entry) => entry.attributes.get('data-menu-entry'))).toStrictEqual([
      'new-world',
      'load-world',
      'settings',
    ])
    expect(entries.map((entry) => entry.textContent)).toStrictEqual(
      ROOT_ENTRIES.map((entry) => ROOT_ENTRY_LABEL[entry]),
    )
    expect(root.find('data-mx-ui', 'menu-title')?.textContent).toBe(MAIN_MENU_TITLE)
  })

  it('REGRESSION: there is no Quit entry, and the reference’s own test demands its absence', () => {
    // `main-menu.e2e.ts:22`: `await expect(page.locator('#mm-quit')).toHaveCount(0)`.
    // A browser tab cannot close itself, so a Quit entry either does nothing or
    // opens a dialog the player then has to dismiss. Pinned as an absence rather
    // than left to be re-added by somebody porting a desktop menu from memory.
    const { root } = show(initialMainMenuState)

    expect(ROOT_ENTRIES).not.toContain('quit')
    expect(root.findAll('data-menu-entry', 'quit')).toHaveLength(0)
  })

  it('REGRESSION: Options is an ENTRY, and mx-ui still renders no settings screen', () => {
    // Not a contradiction with `test/screen-views.test.ts`, which argues at
    // length that a settings screen is the half belonging to another repository.
    // An entry names a destination; `ScreenId` in `domain/modal-stack.ts` has
    // carried `'settings'` with no renderer behind it since the first cut. The
    // row that actually follows the link — 「Options opens settings before
    // starting a world and returns to main menu」 — is the one
    // `docs/e2e-triage.md` §3.6 kept in mc-compose, because it crosses a session
    // boundary.
    const { root } = show(initialMainMenuState)

    expect(root.find('data-menu-entry', 'settings')?.textContent).toBe(
      ROOT_ENTRY_LABEL.settings,
    )
    expect(MENU_PANELS).not.toContain('settings')
  })

  it('every panel is a named group, so no card announces as an anonymous region', () => {
    const { root } = show(initialMainMenuState)
    for (const panel of MENU_PANELS) {
      const element = root.find('data-menu-panel', panel)
      expect(element?.attributes.get('role')).toBe('group')
      expect(element?.attributes.get('aria-label')).toBe(MENU_PANEL_LABEL[panel])
    }
  })
})

describe('the New World card', () => {
  it('shows a world name, a mode that is one of two, and both actions', () => {
    // `main-menu.e2e.ts:42-53`, which reads `#mm-nw-name`, `#mm-nw-cancel`,
    // `#mm-nw-confirm` and asserts `#mm-nw-mode`'s text is 'Survival' or
    // 'Creative'. The mode assertion is the interesting one: the reference had
    // to check membership of a two-element list because it was reading a string
    // off a button. Here the union is closed, so the check is that the map
    // covers it.
    const { root } = show(openPanel(initialMainMenuState, 'new-world'))

    expect(visiblePanels(root)).toStrictEqual(['new-world'])
    const valueOf = (field: string): string | undefined =>
      root.find('data-menu-field', field)?.find('data-mx-ui', 'menu-field-value')?.textContent

    expect(valueOf('world-name')).toBe(DEFAULT_WORLD_NAME)
    expect(['Survival', 'Creative']).toContain(valueOf('game-mode'))
    expect(GAME_MODES.map((mode) => GAME_MODE_LABEL[mode])).toStrictEqual([
      'Survival',
      'Creative',
    ])

    // Scoped to the card. The Load World card has a Back action of its own, and
    // a query that reached across both would pass whichever card was up.
    expect(
      root
        .find('data-menu-panel', 'new-world')
        ?.findAll('data-mx-ui', 'menu-action')
        .map((action) => action.attributes.get('data-menu-action')),
    ).toStrictEqual(['cancel', 'confirm'])
  })

  it('REGRESSION: an empty name is shown as what a confirm would actually create', () => {
    // `<reference-impl>/packages/presentation/menu/main-menu-handlers.ts:282`:
    // `const displayName = trimmed.length > 0 ? trimmed : 'New World'`. The
    // substitution happens INSIDE the confirm handler, so the reference's card
    // can show an empty field while the world it is about to make is called
    // 「New World」 — the player is told one thing and gets another, and no test
    // could see it because the substitution happened after the last thing a test
    // could read.
    expect(worldNameLabel(emptyNewWorldDraft)).toBe(DEFAULT_WORLD_NAME)
    expect(worldNameLabel({ name: '   ', mode: 'survival' })).toBe(DEFAULT_WORLD_NAME)
    expect(worldNameLabel({ name: '  Ravine  ', mode: 'survival' })).toBe('Ravine')

    const { root } = show(nameWorld(openPanel(initialMainMenuState, 'new-world'), '  Ravine  '))
    expect(
      root.find('data-menu-field', 'world-name')?.find('data-mx-ui', 'menu-field-value')
        ?.textContent,
    ).toBe('Ravine')
  })

  it('each field is named once, on the group rather than twice over', () => {
    // The visible caption is `aria-hidden` and the GROUP carries the name — the
    // same call `application/save-indicator.ts` makes for its glyph. Announcing
    // 「World name, World name, Ravine」 spends two thirds of the utterance on
    // redundancy; announcing 「Ravine」 alone spends none of it saying what
    // 「Ravine」 is.
    const { root } = show(openPanel(initialMainMenuState, 'new-world'))

    for (const field of ['world-name', 'game-mode'] as const) {
      const group = root.find('data-menu-field', field)
      expect(group?.attributes.get('role')).toBe('group')
      expect(group?.attributes.get('aria-label')).toBe(MENU_FIELD_LABEL[field])
      expect(
        group?.find('data-mx-ui', 'menu-field-caption')?.attributes.get('aria-hidden'),
      ).toBe('true')
    }
  })

  it('the mode cycles through every mode and returns to where it started', () => {
    // `main-menu-handlers.ts:271` cycles on click. A cycling control is a closed
    // union with a successor, which is all of it that is not a click — and a
    // successor that skipped a member would leave a mode the player could never
    // reach.
    const seen = new Set<string>()
    let state = openPanel(initialMainMenuState, 'new-world')
    for (let step = 0; step < GAME_MODES.length; step += 1) {
      seen.add(state.draft.mode)
      state = cycleWorldMode(state)
    }

    expect([...seen].sort()).toStrictEqual([...GAME_MODES].sort())
    expect(state.draft.mode).toBe(initialMainMenuState.draft.mode)
    expect(cycleGameMode(cycleGameMode('survival'))).toBe('survival')
  })
})

describe('navigating back to the root card', () => {
  it('REGRESSION: New World cancel returns to exactly the state it started from', () => {
    // `main-menu.e2e.ts:67-75` clicked into New World, clicked Cancel and
    // asserted `#mm-new-world` was visible again — 「the root card is up」, which
    // a menu that had quietly kept a second card open underneath would also
    // satisfy. Here the residue is assertable directly, exactly as
    // `test/modal-flows.test.ts` does for the inventory toggle: the state after
    // a round trip must BE the state before it.
    const start = initialMainMenuState
    const opened = openPanel(start, 'new-world')

    expect(opened.panel).toBe('new-world')
    expect(backToRoot(opened)).toStrictEqual(start)

    const { root } = show(backToRoot(opened))
    expect(visiblePanels(root)).toStrictEqual(['root'])
  })

  it('REGRESSION: Load World back returns to root, by the same one route', () => {
    // `main-menu.e2e.ts:77-85`. Two cards, one way back: the reference reached
    // root from three different handlers plus an `onEsc`, which is how they
    // drift.
    //
    // Started from a state that is NOT the initial one, deliberately. From
    // `initialMainMenuState` a `backToRoot` that secretly returns the initial
    // state is indistinguishable from one that navigates, and that is precisely
    // the implementation somebody reaches for.
    const start = nameWorld(initialMainMenuState, 'Ravine')
    const browsing = openPanel(start, 'load-world')

    expect(browsing.panel).toBe('load-world')
    expect(backToRoot(browsing)).toStrictEqual(start)
    expect(backToRoot(browsing)).toStrictEqual(openPanel(browsing, 'root'))

    const { root } = show(backToRoot(browsing))
    expect(visiblePanels(root)).toStrictEqual(['root'])
  })

  it('REGRESSION: cancelling does not wipe the name the player typed', () => {
    // The reference preserves it by accident — `setSubState('root')` only sets
    // `display:none`, so the `<input>` keeps its value. Accident or not it is
    // the right behaviour, and the obvious implementation of a state machine
    // (return to the initial state) silently changes it. A cancel that also
    // erases a name somebody spent time on is the kind of loss nobody reports;
    // they just stop using the field.
    const drafted = nameWorld(openPanel(initialMainMenuState, 'new-world'), 'Ravine')
    const cancelled = backToRoot(drafted)

    expect(cancelled.panel).toBe('root')
    expect(cancelled.draft.name).toBe('Ravine')
    expect(openPanel(cancelled, 'new-world')).toStrictEqual(drafted)
  })

  it('REGRESSION: `backToRoot` is a function, because the reference made it a second Escape owner', () => {
    // `<reference-impl>/packages/presentation/menu/main-menu-handlers.ts` ends
    // with an `onEsc` that calls `preventDefault()` and drops the menu to its
    // root — a key handler owned by the menu, in a codebase that already has one
    // at session level and records its own trouble with it
    // (`session-runtime-overlays.ts:151`: 「paths (Escape, M key, Save & Quit)
    // with no shared open/close stream」). DN-UI-4 is the decision that Escape
    // has ONE owner at frame level.
    //
    // So the observable claim is the absence: the renderer takes no key, and the
    // transition the frame-level handler needs is available to it as a value.
    const { root, view } = show(openPanel(initialMainMenuState, 'new-world'))
    view.render(mainMenuViewModel(backToRoot(openPanel(initialMainMenuState, 'new-world'))))

    expect(root.listenersInTree()).toStrictEqual([])
    expect(visiblePanels(root)).toStrictEqual(['root'])
  })
})

describe('the Load World card says “unknown”, not “you have no worlds”', () => {
  it('REGRESSION: draws no save list at all, and says why', () => {
    // The same distinction `application/inventory-view.ts` makes for an armour
    // rack: 「An armour rack drawn as four empty squares tells the player they
    // are wearing nothing; mc-sim has not said that, and has in fact said
    // nothing at all」. An empty save list is a CLAIM, and the one player it is
    // wrong for is the player whose worlds are all still there.
    //
    // This pins the ABSENCE. When mc-save is published, this test is the one
    // that has to change.
    const { root } = show(openPanel(initialMainMenuState, 'load-world'))

    const list = root.find('data-mx-ui', 'menu-saved-worlds')
    expect(list?.attributes.get('data-region-state')).toBe('unknown')
    expect(list?.find('data-mx-ui', 'menu-note')?.textContent).toContain('unknown')
    // Compared by LENGTH, not deep-equalled — `findAll` returns `FakeElement`s
    // and those are cyclic (`test/fake-dom.ts`).
    expect(root.findAll('data-mx-ui', 'menu-world-row')).toHaveLength(0)
  })
})

describe('the menu is a screen you look at, not one you can operate', () => {
  it('REGRESSION: nothing on it is a `role="button"` and nothing takes focus', () => {
    // `docs/e2e-triage.md` §3.6, ruling on the reference's inventory-slot
    // assertion: 「押せない control に `role="button"` を付けるのは、届くのに使えない
    // control を作ることである」. `application/slot-element.ts` says the same about a
    // slot. A line that announces itself as a button, takes a tab stop and does
    // nothing when activated is strictly worse for a screen-reader player than a
    // line of text — text at least does not promise.
    //
    // `test/accessibility-gate.test.ts` keeps the repository-wide census; this
    // is the same claim from the screen's own side, so that deleting the menu
    // from that sweep does not quietly delete the claim with it.
    for (const panel of MENU_PANELS) {
      const { root } = show(openPanel(initialMainMenuState, panel))
      for (const element of root.walk()) {
        expect(element.attributes.get('role')).not.toBe('button')
        expect(element.attributes.has('tabindex')).toBe(false)
      }
      expect(root.listenersInTree()).toStrictEqual([])
    }
  })

  it('REGRESSION: every reachable state renders and leaves EXACTLY ONE card up', () => {
    // The port of 「no fatal startup errors on menu display」. 「Does not crash」 is
    // not a claim — `docs/e2e-triage.md` §3.5 already said so when it marked
    // #16/#17 OBSOLETE — and a console monitor could not have made this one:
    // two cards up at once, or none, is a menu that still throws no errors.
    for (const panel of MENU_PANELS) {
      for (const mode of GAME_MODES) {
        for (const name of ['', '  ', 'Ravine']) {
          const state = nameWorld(
            { panel, draft: { name: emptyNewWorldDraft.name, mode } },
            name,
          )
          const { root } = show(state)
          expect(visiblePanels(root)).toStrictEqual([panel])
        }
      }
    }
  })

  it('REGRESSION: a re-render with an unchanged model mutates nothing at all', () => {
    const { factory, view } = mount()
    const model = mainMenuViewModel(nameWorld(initialMainMenuState, 'Ravine'))

    view.render(model)
    const before = factory.mark()
    view.render(model)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('writes no colour when the card changes — only the two `hidden`s and the flag', () => {
    // Colours are `var(--mx-ui-*)` references installed at mount
    // (`application/palette-css.ts`), and a card change swaps nothing: each
    // colour belongs to an element that was built once.
    const { factory, view } = mount()
    view.render(mainMenuViewModel(initialMainMenuState))

    const before = factory.mark()
    view.render(mainMenuViewModel(openPanel(initialMainMenuState, 'load-world')))

    expect(writeNames(factory.since(before))).toStrictEqual([
      'attribute:data-menu-showing',
      'attribute:hidden',
      'removeAttribute:hidden',
    ])
  })

  it('declares the palette on its own root, so it does not inherit from a HUD', () => {
    // `application/palette-css.ts`: the tokens are declared on mx-ui's own root
    // precisely so that the set of elements that can SEE a token and the set the
    // guarantee COVERS are the same set. A menu is up when no HUD is mounted, so
    // inheriting would leave every colour on this screen undefined.
    const { root } = show(initialMainMenuState)

    expect(root.style.properties.get(PALETTE_PROPERTY.ink)).toBeDefined()
    expect(root.style.properties.get('background-color')).toBe(PALETTE_VAR.surface)
  })
})
