/**
 * The main menu, as elements.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS A `role="button"`, AND THAT IS THE WHOLE ARGUMENT
 * ---------------------------------------------------------------------------
 *
 * The reference builds every entry as a real `<button type="button">`
 * (`<reference-impl>/packages/presentation/menu/main-menu-dom.ts:74-79`) with a
 * click handler beside it. This file cannot: pressing needs a pointer or key
 * event and `application/dom-surface.ts` has neither verb, for the reason its
 * header gives (DN-UI-4 — Escape has one owner and a renderer that attaches a
 * handler makes it two).
 *
 * The tempting half-measure is to keep the ARIA and lose the behaviour: mark the
 * entries `role="button"`, give them a `tabindex`, and let whoever owns input
 * wire the activation later. `docs/e2e-triage.md` §3.6 has already ruled on
 * exactly that, against the reference's own inventory-slot assertion:
 * 「押せない control に `role="button"` を付けるのは、届くのに使えない control を作る
 * ことである」. `application/slot-element.ts` says the same about a slot. A control
 * that announces itself as a button, takes a tab stop, and does nothing when
 * activated is strictly worse for a screen-reader player than a line of text —
 * text at least does not promise.
 *
 * So an entry is a NAMED LINE. `test/accessibility-gate.test.ts` keeps a census
 * of everything in this repository that takes focus, and this screen is required
 * to add nothing to it; the day the entries become operable, that census is the
 * test that has to be updated, which is the moment somebody looks.
 *
 * ---------------------------------------------------------------------------
 * The save list is `unknown`, not empty
 * ---------------------------------------------------------------------------
 *
 * The reference's Load World card fills `#mm-lw-list` from storage. mc-save is
 * not published and this repository has no way to ask, so the panel renders the
 * same distinction `application/inventory-view.ts` makes for an armour rack:
 * 「An armour rack drawn as four empty squares tells the player they are wearing
 * nothing; mc-sim has not said that, and has in fact said nothing at all」. An
 * empty save list says 「you have no worlds」, which is a claim, and the one player
 * it is wrong for is the player whose worlds are all still there.
 *
 * ---------------------------------------------------------------------------
 * `SURFACE`, not `SCRIM`
 * ---------------------------------------------------------------------------
 *
 * The menu is up when no world is being rendered, so there is no world pixel for
 * a scrim to defend against — the same call `application/loading-view.ts` makes,
 * and the same one `application/inventory-view.ts` makes for a modal panel.
 */
import {
  MENU_PANELS,
  ROOT_ENTRIES,
  type GameMode,
  type MainMenuViewModel,
  type MenuPanel,
  type RootEntry,
} from '../domain/main-menu'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
  type AttributeCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'

/**
 * The words on the title.
 *
 * mx-ui's own string, as `'You died'` in `application/hud-view.ts` is. The
 * reference's is 「TS·Minecraft」 (`main-menu-dom.ts:67`), which names a different
 * project; carrying the ORGANISATION's name over would have been the carry that
 * is wrong.
 */
export const MAIN_MENU_TITLE = 'nerima-games'

/** What each root entry is called. `main-menu-dom.ts:74-79`, verbatim. */
export const ROOT_ENTRY_LABEL: Readonly<Record<RootEntry, string>> = {
  'new-world': 'Create New World',
  'load-world': 'Select World',
  settings: 'Options...',
}

/** The label the mode control shows, which is also what the reference's test reads. */
export const GAME_MODE_LABEL: Readonly<Record<GameMode, string>> = {
  survival: 'Survival',
  creative: 'Creative',
}

/** What each panel announces itself as. Every panel is a named group. */
export const MENU_PANEL_LABEL: Readonly<Record<MenuPanel, string>> = {
  root: 'Main menu',
  'new-world': 'Create new world',
  'load-world': 'Select world',
}

/**
 * The two fields on the New World card, and what each announces as.
 *
 * A field is a visible caption beside a value. The caption is `aria-hidden`
 * and the GROUP carries the name, which is the same call
 * `application/save-indicator.ts` makes for its glyph: announcing 「World name,
 * World name, My World」 spends two thirds of the utterance on redundancy.
 */
export const MENU_FIELD_LABEL = {
  'world-name': 'World name',
  'game-mode': 'Game mode',
} as const

export type MenuField = keyof typeof MENU_FIELD_LABEL

/**
 * The actions each panel offers, as words.
 *
 * Drawn, not wired — see the header. They are here because a card that shows a
 * world name and no way to confirm it does not tell the player what the card is
 * for, and because `docs/e2e-triage.md` demoted a row that asks for them by
 * name.
 */
export const MENU_ACTION_LABEL = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  back: 'Back',
} as const

export type MenuAction = keyof typeof MENU_ACTION_LABEL

/** Why the Load World card cannot list anything, in the words the panel shows. */
export const NO_SAVE_LIST_NOTE =
  'mc-save has not been asked. This list is unknown, which is not the same as empty.'

type PanelElement = {
  readonly panel: MenuPanel
  readonly root: DomElement
  readonly hidden: AttributeCell
}

export type MainMenuView = {
  /** The element the host appended us to a parent as. Exposed for tests and previews. */
  readonly root: DomElement
  /** Project a model. Idempotent: the same model twice mutates nothing the second time. */
  readonly render: (model: MainMenuViewModel) => void
}

/** A line of text that is not a control, styled from one token. */
const appendLine = (
  factory: DomElementFactory,
  parent: DomElement,
  role: string,
  color: string,
  text: string,
): void => {
  const element = factory.createElement('p')
  element.setAttribute('data-mx-ui', role)
  element.style.setProperty('color', color)
  element.textContent = text
  parent.appendChild(element)
}

const createPanel = (
  factory: DomElementFactory,
  parent: DomElement,
  panel: MenuPanel,
): PanelElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'menu-panel')
  root.setAttribute('data-menu-panel', panel)
  root.setAttribute('hidden', '')
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', MENU_PANEL_LABEL[panel])
  parent.appendChild(root)

  const element: PanelElement = { panel, root, hidden: attributeCell(root, 'hidden') }
  // Hidden directly above so no frame ever shows two cards at once; tell the
  // cell what the element already says.
  element.hidden.previous = ''
  return element
}

/**
 * A caption and a value, named once on the group.
 *
 * Returns the value's cell, because the value is the only part of a field that
 * ever changes.
 */
const createField = (
  factory: DomElementFactory,
  parent: DomElement,
  field: MenuField,
): TextCell => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'menu-field')
  root.setAttribute('data-menu-field', field)
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', MENU_FIELD_LABEL[field])
  parent.appendChild(root)

  const caption = factory.createElement('span')
  caption.setAttribute('data-mx-ui', 'menu-field-caption')
  // Redundant with the group's name, so it is for the eyes only.
  caption.setAttribute('aria-hidden', 'true')
  caption.style.setProperty('color', PALETTE_VAR.inkMuted)
  caption.textContent = MENU_FIELD_LABEL[field]
  root.appendChild(caption)

  const value = factory.createElement('span')
  value.setAttribute('data-mx-ui', 'menu-field-value')
  value.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(value)

  return textCell(value)
}

const appendAction = (
  factory: DomElementFactory,
  parent: DomElement,
  action: MenuAction,
): void => {
  const element = factory.createElement('span')
  element.setAttribute('data-mx-ui', 'menu-action')
  element.setAttribute('data-menu-action', action)
  // No `role`, no `tabindex`, no listener — see the header. The label is the
  // whole of what this repository can honestly say about it.
  element.style.setProperty('color', PALETTE_VAR.ink)
  element.textContent = MENU_ACTION_LABEL[action]
  parent.appendChild(element)
}

/**
 * Build the menu under `parent`.
 *
 * `parent` is passed in, never looked up (`docs/public-api.md` §4-1): a preview
 * page has to be able to stand up more than one instance.
 */
export const createMainMenuView = (
  factory: DomElementFactory,
  parent: DomElement,
): MainMenuView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'main-menu')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)

  const title = factory.createElement('h1')
  title.setAttribute('data-mx-ui', 'menu-title')
  title.style.setProperty('color', PALETTE_VAR.ink)
  title.textContent = MAIN_MENU_TITLE
  root.appendChild(title)

  const panels = MENU_PANELS.map((panel) => createPanel(factory, root, panel))
  const panelOf = (panel: MenuPanel): DomElement => {
    const found = panels.find((candidate) => candidate.panel === panel)
    // `MENU_PANELS` is the source of both loops, so this cannot miss. Returning
    // the menu root rather than throwing keeps the failure mode 「the card is in
    // the wrong place」 instead of 「the menu did not mount」.
    return found?.root ?? root
  }

  const rootPanel = panelOf('root')
  for (const entry of ROOT_ENTRIES) {
    const element = factory.createElement('span')
    element.setAttribute('data-mx-ui', 'menu-entry')
    element.setAttribute('data-menu-entry', entry)
    element.style.setProperty('color', PALETTE_VAR.ink)
    element.textContent = ROOT_ENTRY_LABEL[entry]
    rootPanel.appendChild(element)
  }

  const newWorldPanel = panelOf('new-world')
  const worldName = createField(factory, newWorldPanel, 'world-name')
  const worldMode = createField(factory, newWorldPanel, 'game-mode')
  appendAction(factory, newWorldPanel, 'cancel')
  appendAction(factory, newWorldPanel, 'confirm')

  const loadWorldPanel = panelOf('load-world')
  const savedWorlds = factory.createElement('div')
  savedWorlds.setAttribute('data-mx-ui', 'menu-saved-worlds')
  // The same vocabulary `application/inventory-view.ts` uses for a region mc-sim
  // has not answered about, so 「unknown」 and 「empty」 are told apart by an
  // attribute rather than by looking at nothing.
  savedWorlds.setAttribute('data-region-state', 'unknown')
  loadWorldPanel.appendChild(savedWorlds)
  // INK_FAINT, as the inventory's region note is: the sentence is for whoever is
  // building this, not for the player, and it is still a guarded text token so
  // 「for the developer」 does not mean 「unreadable」.
  appendLine(factory, savedWorlds, 'menu-note', PALETTE_VAR.inkFaint, NO_SAVE_LIST_NOTE)
  appendAction(factory, loadWorldPanel, 'back')

  const cells: {
    readonly panelFlag: AttributeCell
    readonly worldName: TextCell
    readonly worldMode: TextCell
  } = {
    // `data-menu-showing`, NOT `data-menu-panel`. Each card carries the second
    // to say which card it IS, and reusing the name here would make a query for
    // 「the root card」 also match the menu root whenever the root card was up —
    // a selector that is right by coincidence and silently wrong the moment the
    // player navigates.
    panelFlag: attributeCell(root, 'data-menu-showing'),
    worldName,
    worldMode,
  }

  return {
    root,
    render: (model: MainMenuViewModel): void => {
      writeAttribute(cells.panelFlag, model.panel)
      for (const panel of panels) {
        writeHidden(panel.hidden, panel.panel !== model.panel)
      }
      writeText(cells.worldName, model.worldName)
      writeText(cells.worldMode, GAME_MODE_LABEL[model.mode])
    },
  }
}
