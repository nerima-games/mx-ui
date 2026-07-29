/**
 * The main menu's navigation, as a value.
 *
 * ---------------------------------------------------------------------------
 * Which half of a menu this repository can own
 * ---------------------------------------------------------------------------
 *
 * A menu looks like the one screen mx-ui cannot have, because a menu is made of
 * buttons and `application/dom-surface.ts` has no `addEventListener`. That
 * reading confuses two things the reference itself kept in separate files. The
 * CLICK is input; WHERE THE MENU THEN IS is a state machine, and
 * `<reference-impl>/e2e/ui/main-menu.e2e.ts` spends three of its five demoted
 * tests on the second — 「New World cancel returns to main menu root」,
 * 「Load World back button returns to root」, and the panel visibility half of
 * 「New World flow shows world name input and confirm button」. None of those is
 * about a pointer. They are about which card is up after a transition, and that
 * is a pure function.
 *
 * This is the same split `domain/modal-stack.ts` already makes and
 * `test/modal-flows.test.ts` already states: 「these tests say "opening the
 * inventory" where the reference said "pressing E" …it is the whole claim about
 * the half mx-ui owns」. A settings screen is genuinely different and
 * `test/screen-views.test.ts` says why — a rebind field's entire behaviour IS
 * the keystroke, so nothing is left over once the keystroke is removed. Remove
 * the click from a menu and a navigable state machine is left over.
 *
 * ---------------------------------------------------------------------------
 * The reference put a SECOND Escape owner here, which is DN-UI-4's failure
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/packages/presentation/menu/main-menu-handlers.ts` ends with
 * an `onEsc` that calls `preventDefault()` and drops the menu back to its root —
 * a key handler owned by the menu, in a codebase that already has one in
 * `session-runtime-overlays.ts` and records its own trouble with it (「paths
 * (Escape, M key, Save & Quit) with no shared open/close stream」). DN-UI-4 is
 * the decision that there is ONE Escape owner at frame level.
 *
 * So `backToRoot` is a function and not a listener. The frame-level handler that
 * owns Escape calls it, exactly as it calls `escapePressed`, and there is no
 * second place for the two to disagree about what one press meant.
 */

/**
 * The cards the menu can be showing, one at a time.
 *
 * The reference has three more (`multiplayer`, `how-to-play`, `continue-world`)
 * and they are left out rather than stubbed. Each of them needs an answer this
 * repository cannot obtain — a transport, a controls document, a save list — and
 * a panel that renders an empty promise is the 「hook with nothing behind it」
 * DN-UI-1a rejected. `MenuPanel` grows when the answer arrives.
 */
export type MenuPanel = 'root' | 'new-world' | 'load-world'

/** Every panel, for the sweeps that must not miss one. */
export const MENU_PANELS: ReadonlyArray<MenuPanel> = ['root', 'new-world', 'load-world']

/**
 * What the root card offers.
 *
 * `settings` is here even though `test/screen-views.test.ts` argues at length
 * that mx-ui has no settings SCREEN. That is not a contradiction: an entry names
 * a destination, and `ScreenId` in `domain/modal-stack.ts` has carried
 * `'settings'` with no renderer behind it since the first cut. The row that
 * actually follows the link — 「Options opens settings before starting a world
 * and returns to main menu」 — is the one `docs/e2e-triage.md` §3.6 kept in
 * mc-compose, because it crosses a session boundary.
 *
 * **There is no `quit`, and the reference's own test demands its absence**
 * (`main-menu.e2e.ts:22` asserts `#mm-quit` has count 0). A browser tab cannot
 * close itself, so a Quit entry is a control that either does nothing or opens a
 * dialog the player then has to dismiss. Pinned as an absence rather than left
 * to be re-added by somebody porting a desktop menu from memory.
 */
export type RootEntry = 'new-world' | 'load-world' | 'settings'

export const ROOT_ENTRIES: ReadonlyArray<RootEntry> = ['new-world', 'load-world', 'settings']

/**
 * The two modes a new world can start in.
 *
 * `<reference-impl>/packages/presentation/menu/main-menu-dom.ts:102` renders the
 * mode as a BUTTON whose label is the current value, and
 * `main-menu-handlers.ts:271` cycles it on click. A cycling control is a closed
 * union with a successor function, which is all of it that is not a click.
 */
export type GameMode = 'survival' | 'creative'

export const GAME_MODES: ReadonlyArray<GameMode> = ['survival', 'creative']

/**
 * The successor.
 *
 * Written as an exhaustive two-way swap rather than as an index into
 * `GAME_MODES`, so that adding a third mode is a type error here rather than a
 * silent wrap that skips it.
 */
export const cycleGameMode = (mode: GameMode): GameMode =>
  mode === 'survival' ? 'creative' : 'survival'

/**
 * What an unnamed world is called.
 *
 * `<reference-impl>/packages/presentation/menu/main-menu-handlers.ts:282`:
 * `const displayName = trimmed.length > 0 ? trimmed : 'New World'`. The
 * substitution is the interesting part and it is why this is a derivation rather
 * than a placeholder attribute on an input: a world whose display name is the
 * empty string is a row in a save list that cannot be clicked on, and the player
 * who left the field alone is exactly the player who will not understand why.
 */
export const DEFAULT_WORLD_NAME = 'New World'

/** What the player has entered on the New World card, before confirming. */
export type NewWorldDraft = {
  readonly name: string
  readonly mode: GameMode
}

export const emptyNewWorldDraft: NewWorldDraft = { name: '', mode: 'survival' }

/**
 * The name this world would actually be created under.
 *
 * The trim and the default in ONE place, so that what the card shows and what a
 * confirm would create are the same string. The reference computes it inside the
 * confirm handler, so its card can show an empty field while the world it is
 * about to make is called 「New World」 — the player is told one thing and gets
 * another, and no test could see it because the substitution happened after the
 * last thing the test could read.
 */
export const worldNameLabel = (draft: NewWorldDraft): string => {
  const trimmed = draft.name.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_WORLD_NAME
}

export type MainMenuState = {
  readonly panel: MenuPanel
  readonly draft: NewWorldDraft
}

/** A saved session supplied by the host. mx-ui never opens storage itself. */
export type SavedWorld = {
  readonly sessionId: string
  readonly name: string
}

/** The normalized request emitted when the player confirms a new world. */
export type CreateWorldRequest = {
  readonly name: string
  readonly mode: GameMode
}

export const initialMainMenuState: MainMenuState = {
  panel: 'root',
  draft: emptyNewWorldDraft,
}

export const openPanel = (state: MainMenuState, panel: MenuPanel): MainMenuState =>
  state.panel === panel ? state : { ...state, panel }

/**
 * Leave whichever card is up, KEEPING the draft.
 *
 * The reference preserves it by accident: `setSubState('root')` only sets
 * `display:none` on the card, so the `<input>` still holds what was typed
 * (`main-menu-dom.ts:60-107` builds all cards once). Accident or not, it is the
 * right behaviour and it is worth being explicit about, because the obvious
 * implementation of a state machine — return to the initial state — silently
 * changes it. A cancel that also wipes a name the player spent time on is the
 * kind of loss nobody reports as a bug; they just stop using the field.
 *
 * There is exactly one way back, and `openPanel(state, 'root')` is it. Two
 * spellings of 「go back」 is how the reference ended up with an Escape handler in
 * the menu and another one at session level.
 */
export const backToRoot = (state: MainMenuState): MainMenuState => openPanel(state, 'root')

export const nameWorld = (state: MainMenuState, name: string): MainMenuState => ({
  ...state,
  draft: { ...state.draft, name },
})

export const cycleWorldMode = (state: MainMenuState): MainMenuState => ({
  ...state,
  draft: { ...state.draft, mode: cycleGameMode(state.draft.mode) },
})

/**
 * The projection the DOM layer draws.
 *
 * Only what VARIES is here. The title, the entry labels and the words on the
 * actions are mx-ui's own strings and live with the elements, exactly as
 * `SAVE_STATUS_LABEL` does — `domain/caption.ts` takes its text from the event
 * because mc-audio owns that vocabulary, and nobody owns this one but us.
 */
export type MainMenuViewModel = {
  readonly panel: MenuPanel
  /** The input value, preserved exactly while the player edits it. */
  readonly worldNameInput: string
  /** Already trimmed and defaulted, used when confirming. */
  readonly worldName: string
  readonly mode: GameMode
  readonly savedWorlds: ReadonlyArray<SavedWorld>
}

export const mainMenuViewModel = (
  state: MainMenuState,
  savedWorlds: ReadonlyArray<SavedWorld> = [],
): MainMenuViewModel => ({
  panel: state.panel,
  worldNameInput: state.draft.name,
  worldName: worldNameLabel(state.draft),
  mode: state.draft.mode,
  savedWorlds,
})
