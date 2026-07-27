/**
 * The WCAG gate the reference ran in a browser, run here without one.
 *
 * ---------------------------------------------------------------------------
 * What was ported, and from where
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/e2e/ui/accessibility.e2e.ts` is seven Playwright tests that
 * boot the game, reach a screen, and run one injected auditor over the live
 * document. Its header states the two audits and why each exists:
 *
 *   1. every visible interactive control has a programmatic accessible name
 *      (WCAG 4.1.2) — 「caught the unlabeled keyboard-rebind inputs」;
 *   2. every visible text node meets AA contrast — 「caught the settings "Done"
 *      button at 3.92:1」.
 *
 * Seven tests because there were seven SCREENS, and reaching each one needed a
 * boot, a QA hook and a `waitForSelector`. Here a screen is a function call, so
 * the seven collapse into one sweep over every screen this repository builds —
 * which is what `docs/e2e-triage.md` §3.6 predicted when it demoted them
 * (「7 本のうち 6 本が同一のヘルパーを画面違いで呼ぶだけなので、mx-ui では 1 本の
 * パラメタライズドテストになる」).
 *
 * ---------------------------------------------------------------------------
 * The two audits are NOT the reference's, and the difference matters
 * ---------------------------------------------------------------------------
 *
 * The reference measured PIXELS: `getComputedStyle(el).color` against a walked-up
 * effective background, both resolved by a real engine. There is no engine here —
 * `test/fake-dom.ts` does not resolve `var()`, has no layout and no
 * `offsetParent` — so a literal port would be a test that measured nothing.
 *
 * What replaces it measures the same guarantee one level up. Every colour a
 * renderer writes is a `var(--mx-ui-*)` reference (`application/palette-css.ts`),
 * and `surveyPalette()` already knows the worst-case reading of every token over
 * every world pixel. So the audit resolves each written colour back to its token
 * and asks whether that token clears ITS OWN floor. A renderer that reached for
 * an unguarded colour, or for a raw hex, fails — and those are the two ways the
 * reference's finding actually happens in this codebase, because a token that has
 * dropped below its floor is caught earlier and louder by
 * `test/view-model.test.ts`.
 *
 * What this therefore CANNOT catch, stated rather than glossed: a token that is
 * legible in isolation and illegible where it is actually placed, because
 * placement is layout and layout needs a browser. `docs/testing.md` §3 says the
 * same thing about the fake document generally — 「そしてブラウザは依然として必要で
 * ある」 — and it is why `docs/e2e-triage.md` keeps 22 tests in mc-compose.
 *
 * The naming audit has no such gap. An accessible name is an attribute, and an
 * attribute is exactly what a fake document records.
 */
import { describe, expect, it } from 'vitest'
import { emptyCaptionQueue, captionLines, receiveCaption } from '../domain/caption'
import { HOTBAR_SLOT_COUNT, hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../domain/inventory-view-model'
import { GUARDED_TOKENS, surveyPalette, type Rgb } from '../domain/palette'
import { saveStatus, saveStatusMessage } from '../domain/save-status'
import { createCaptionView } from '../application/caption-view'
import { createHudView } from '../application/hud-view'
import { createInventoryView } from '../application/inventory-view'
import { createSaveIndicator } from '../application/save-indicator'
import { ICON_ROW_LABEL } from '../application/icon-element'
import { PALETTE_SOURCE, PALETTE_VAR, type PaletteTokenName } from '../application/palette-css'
import { fakeDocument, type FakeElement } from './fake-dom'

/** `var(--mx-ui-ink)` back to `INK`'s three numbers. */
const TOKEN_BY_VAR: ReadonlyMap<string, PaletteTokenName> = new Map(
  (Object.keys(PALETTE_VAR) as ReadonlyArray<PaletteTokenName>).map((name) => [
    PALETTE_VAR[name],
    name,
  ]),
)

const sameColor = (left: Rgb, right: Rgb): boolean =>
  left[0] === right[0] && left[1] === right[1] && left[2] === right[2]

/**
 * Every screen this repository can build, mounted.
 *
 * Each entry is the analogue of one `test()` in the reference file: `main menu`,
 * `in-session HUD`, `inventory overlay`, `pause menu`, `how to play`,
 * `death screen`, and the three parameterised panels. Only the ones mx-ui HAS are
 * here — see this file's sibling report; a screen that does not exist cannot be
 * audited, and inventing one to audit it would be auditing the invention.
 */
const screens = (): ReadonlyArray<{ readonly name: string; readonly root: FakeElement }> => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement

  const hud = createHudView(factory, parent, 'full')
  // The death screen is a STATE of the HUD here rather than a screen of its own
  // (`hud-view.ts`: 「The HUD says 「dead」; it does not open a screen」), so the
  // audit sees it by rendering a dead player.
  hud.render(hudViewModel({ ...spawnSnapshot, healthPoints: 0 }))
  hud.render(hudViewModel(spawnSnapshot))
  hud.setKeyboardFocus(4)

  const inventory = createInventoryView(factory, parent)
  inventory.render(inventoryViewModel(emptyInventorySnapshot))

  const captions = createCaptionView(factory, parent, 'full')
  captions.render(
    captionLines(
      receiveCaption(
        emptyCaptionQueue,
        { cueId: 'creeper', text: 'Creeper hisses', direction: 'left', atSecs: 0 },
        { captionsEnabled: true, audioUnlocked: false },
      ),
      0,
    ),
  )

  const save = createSaveIndicator(factory, parent)
  save.render(saveStatusMessage(saveStatus('failed', 0), 1))

  return [
    { name: 'in-session HUD', root: hud.root as FakeElement },
    { name: 'inventory and crafting overlay', root: inventory.root as FakeElement },
    { name: 'captions', root: captions.root as FakeElement },
    { name: 'autosave indicator', root: save.root as FakeElement },
  ]
}

/**
 * The accessible name of an element, by the same precedence the reference's
 * injected auditor used: own `aria-label` first, then a labelling ancestor.
 *
 * The ancestor step is not decoration. The hotbar is a roving-`tabindex` group:
 * the tab stop is a SLOT and the name is on the GROUP, which is the correct
 * ARIA shape and would look like a missing name to an auditor that only read
 * the focused element.
 */
const accessibleName = (
  element: FakeElement,
  parents: ReadonlyMap<FakeElement, FakeElement>,
): string | undefined => {
  let node: FakeElement | undefined = element
  while (node !== undefined) {
    const label = node.attributes.get('aria-label')
    if (label !== undefined && label.trim() !== '') {
      return label.trim()
    }
    node = parents.get(node)
  }
  return undefined
}

const parentMap = (root: FakeElement): ReadonlyMap<FakeElement, FakeElement> => {
  const parents = new Map<FakeElement, FakeElement>()
  for (const element of root.walk()) {
    for (const child of element.children) {
      parents.set(child, element)
    }
  }
  return parents
}

/** A tab stop, which is what "interactive" reduces to in a document with no events. */
const isTabStop = (element: FakeElement): boolean => {
  const tabindex = element.attributes.get('tabindex')
  return tabindex !== undefined && tabindex !== '-1'
}

describe('WCAG 4.1.2: every tab stop on every screen announces something', () => {
  it('no focusable element on any screen is anonymous', () => {
    // The reference's finding was 「the unlabeled keyboard-rebind inputs」 — a
    // control a sighted player reaches by Tab and a screen-reader player reaches
    // by Tab and hears "edit text". The failure is silent in both directions:
    // nothing looks wrong and nothing throws.
    const anonymous = screens().flatMap(({ name, root }) => {
      const parents = parentMap(root)
      return [...root.walk()]
        .filter(isTabStop)
        .filter((element) => accessibleName(element, parents) === undefined)
        .map((element) => `${name}: ${element.attributes.get('data-mx-ui') ?? element.tagName}`)
    })

    expect(anonymous).toStrictEqual([])
  })

  it('REGRESSION: and the hotbar is the ONLY thing in this repository that takes focus', () => {
    // Without this the sweep above is four assertions over three empty sets: a
    // screen with no tab stops passes it for free, and the day somebody adds a
    // pressable inventory slot the sweep is the test that was supposed to
    // notice.
    //
    // The census is also the claim itself. `application/slot-element.ts`:
    // 「Pressing is still not here. A slot has no activation, no `role="button"`
    // and no click」 — because pressing needs a key or a pointer event, and
    // `application/dom-surface.ts` has neither verb. So a focusable inventory
    // slot would be a control the player can reach and cannot use, which is
    // worse than one they cannot reach.
    const census = screens().map(({ name, root }) => ({
      name,
      focusable: [...root.walk()].filter((element) => element.attributes.has('tabindex')).length,
      tabStops: [...root.walk()].filter(isTabStop).length,
    }))

    expect(census).toStrictEqual([
      // Nine slots are programmatically focusable; exactly ONE of them is in the
      // document's tab order. That is the roving tabindex, and the difference
      // between the two numbers is the whole pattern: Tab reaches the hotbar
      // once rather than nine times, and whoever owns input can still move focus
      // inside it.
      { name: 'in-session HUD', focusable: HOTBAR_SLOT_COUNT, tabStops: 1 },
      { name: 'inventory and crafting overlay', focusable: 0, tabStops: 0 },
      { name: 'captions', focusable: 0, tabStops: 0 },
      { name: 'autosave indicator', focusable: 0, tabStops: 0 },
    ])
  })

  it('REGRESSION: the vitals rows are named, so hearts are not announced as punctuation', () => {
    // `<reference-impl>/e2e/ui/hud.e2e.ts:65-66` reaches the two displays by
    // `getByLabel('Health')` / `getByLabel('Hunger')`. Ported, this was the one
    // demoted assertion mx-ui answered NO to: the rows are ten `♡` and ten `○`
    // with no name anywhere, so a screen reader announces "white heart suit"
    // twenty times and the player cannot tell starving from dying.
    //
    // Neither row is a tab stop, so the sweep above cannot see this. That is why
    // it is stated separately rather than folded in.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createHudView(factory, parent, 'full')
    const root = view.root as FakeElement

    const labelOf = (kind: 'heart' | 'shank'): string | undefined =>
      root.find('data-mx-ui', `${kind}-row`)?.attributes.get('aria-label')

    expect(labelOf('heart')).toBe(ICON_ROW_LABEL.heart)
    expect(labelOf('shank')).toBe(ICON_ROW_LABEL.shank)
    // `group` and not `img`: the row's members change independently and a player
    // navigating by group should be able to enter it.
    expect(root.find('data-mx-ui', 'heart-row')?.attributes.get('role')).toBe('group')
  })

  it('REGRESSION: naming the rows did not put them on the frame path', () => {
    // A name written per frame is a name written twenty times a second, and
    // plan.md §5.2 is the reason `ui:hud-sync` is allowed to run every frame at
    // all. The labels are static, so a steady frame still mutates nothing.
    const factory = fakeDocument()
    const parent = factory.createElement('div') as FakeElement
    const view = createHudView(factory, parent, 'full')

    view.render(hudViewModel(spawnSnapshot))
    const before = factory.mark()
    view.render(hudViewModel(spawnSnapshot))

    // Projected to strings rather than compared as `Mutation` objects. A
    // `Mutation` holds its `target`, a `FakeElement` holds the shared log, and
    // the log holds every `Mutation` — so a FAILING `toStrictEqual([])` on the
    // raw array sends the reporter round that cycle and exhausts the heap
    // instead of naming the write. A test that kills the runner when it goes red
    // reports nothing at all.
    expect(factory.since(before).map((mutation) => `${mutation.kind}:${mutation.name}`)).toStrictEqual(
      [],
    )
  })
})

describe('WCAG AA: every colour a screen writes is one the palette has measured', () => {
  const survey = surveyPalette()

  for (const { name, root } of screens()) {
    it(`${name}: every text colour resolves to a guarded token that clears its floor`, () => {
      // The reference's finding was 「the settings "Done" button at 3.92:1」 — a
      // control that looked fine to whoever wrote it and was unreadable to a
      // player with low vision over the wrong background. The equivalent mistake
      // here is reaching past `PALETTE_VAR` for a colour nobody has measured:
      // the screen looks right on the developer's monitor and has no guarantee
      // behind it at all.
      const findings: Array<string> = []

      for (const element of root.walk()) {
        const written = element.style.properties.get('color')
        if (written === undefined) {
          continue
        }
        const where = element.attributes.get('data-mx-ui') ?? element.tagName

        const token = TOKEN_BY_VAR.get(written)
        if (token === undefined) {
          findings.push(`${where}: colour "${written}" is not a palette token`)
          continue
        }

        const color = PALETTE_SOURCE[token]
        const guarded = GUARDED_TOKENS.find((candidate) => sameColor(candidate.color, color))
        if (guarded === undefined) {
          // A colour can be a token and still be unguarded — `METER_TRACK` and
          // `SURFACE` are, deliberately, because they are backdrops. Using one
          // for TEXT puts a foreground where no floor was ever measured.
          findings.push(`${where}: token ${token} carries text but is not guarded`)
          continue
        }

        const reading = survey.tokens.find((candidate) => candidate.name === guarded.name)
        if (reading === undefined || !reading.meetsFloor) {
          findings.push(`${where}: ${guarded.name} is below its ${String(guarded.role)} floor`)
        }
      }

      expect(findings).toStrictEqual([])
    })
  }

  it('REGRESSION: the audit above can actually see a colour — the sweep is not vacuous', () => {
    // A sweep over an empty set passes. This pins that each screen really does
    // write colours the loop reaches, so deleting `declarePalette` or renaming
    // `data-mx-ui` turns the gate red rather than silently empty.
    const written = screens().map(({ name, root }) => ({
      name,
      colours: [...root.walk()].filter((element) => element.style.properties.has('color')).length,
    }))

    for (const screen of written) {
      expect(screen.colours).toBeGreaterThan(0)
    }
  })
})
