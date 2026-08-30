/**
 * The loading screen, as elements.
 *
 * ---------------------------------------------------------------------------
 * Two permanent states, as `application/save-indicator.ts` has three
 * ---------------------------------------------------------------------------
 *
 * Preparing and failed are sibling elements built once and toggled, rather than
 * one element whose words and colour are rewritten. The argument is the save
 * indicator's and it holds twice over here: every token both states use reaches
 * an element at MOUNT, so 「did `STATUS_ALERT` reach the screen?」 is not a
 * question whose answer depends on whether anything happened to fail during the
 * test that asked.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO PROGRESS BAR, AND THAT IS THE FINDING
 * ---------------------------------------------------------------------------
 *
 * The reference draws one: `<reference-impl>/packages/presentation/loading/loading-screen.ts:67`
 * builds `.loading-track` with a `.loading-track-fill` animated across it, marked
 * `aria-hidden="true"` because it carries no information — it is indeterminate,
 * a shimmer that says 「something is happening」 and nothing else.
 *
 * Then `:123` handles reduced motion:
 *
 *     @media (prefers-reduced-motion:reduce){ … .loading-track-fill{left:29%;width:42%;opacity:.8} }
 *
 * **The animation is removed and the bar is left parked at 29% of its track.**
 * For every player who asked their operating system not to animate things, an
 * indeterminate shimmer becomes a static bar that reads as determinate progress
 * roughly a third of the way along — and it never moves again, so a load that is
 * genuinely slow looks like a load that has hung. `domain/accessibility.ts`
 * argues that reduced motion 「exists for people who get motion sick rather than
 * for people who are impatient」; a frozen indeterminate bar answers neither, and
 * invents a number for the population least able to dismiss it.
 *
 * So this screen draws words. There is nothing here to suppress under reduced
 * motion, which is why — unlike `createHudView` and `createCaptionView` — this
 * view takes no `MotionPreference`: it has no decorative animation, so a
 * `setMotion` on it would be a switch with nothing behind it (DN-UI-1a).
 *
 * ---------------------------------------------------------------------------
 * `SURFACE`, not `SCRIM`
 * ---------------------------------------------------------------------------
 *
 * The scrim exists so that HUD content over an arbitrary world pixel has a
 * contrast floor (`domain/palette.ts`). During loading there is no world pixel:
 * that is the definition of the state. An opaque panel is therefore both honest
 * and the easier case, and it is the same call `application/inventory-view.ts`
 * makes for a modal.
 */
import {
  type AttributeCell,
  type TextCell,
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
} from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import type { LoadingScreenView } from '../domain/loading-screen.js'

/** Render order, and the order the tests sweep. */
export const LOADING_STATES: ReadonlyArray<LoadingScreenView['kind']> = ['preparing', 'failed']

/**
 * The words.
 *
 * mx-ui's own strings, as `SAVE_STATUS_LABEL` is. The kicker is the reference's
 * (`loading-screen.ts:59`, 'WORLD GENERATION'); the titles are its `:60` and
 * `:97`.
 */
export const LOADING_LABEL: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: 'We could not build this world',
  preparing: 'Preparing your world',
}

export const LOADING_KICKER: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: 'WORLD INTERRUPTED',
  preparing: 'WORLD GENERATION',
}

/**
 * The line under the title.
 *
 * The failure's is the reference's `:79` verbatim, because the advice is the
 * advice whichever repository gives it.
 */
export const LOADING_DETAIL: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: 'Check your connection or refresh the page to try again.',
  preparing: 'Shaping terrain, placing blocks, and lighting the horizon.',
}

/**
 * One token per state.
 *
 * `STATUS_BUSY` and `STATUS_ALERT` are two rungs of the luminance ladder
 * `domain/palette.ts` built out of the reference's collapsed pair, so a player
 * who cannot separate them by hue separates them by lightness — and, as the save
 * indicator does, by the words themselves.
 */
const LOADING_TOKEN: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: PALETTE_VAR.statusAlert,
  preparing: PALETTE_VAR.statusBusy,
}

type LoadingStateElement = {
  readonly kind: LoadingScreenView['kind']
  readonly root: DomElement
  readonly hidden: AttributeCell
}

export type LoadingView = {
  /** The element the host appended us to a parent as. Exposed for tests and previews. */
  readonly root: DomElement
  /**
   * Project one state, or `undefined` for nothing.
   *
   * Takes `loadingScreenView`'s result rather than a status and a time, so that
   * 「is the floor still holding it up?」 is answered in `domain/` where it is
   * arithmetic and this file stays a dumb projection.
   */
  readonly render: (view: LoadingScreenView | undefined) => void
}

const buildStateRoot = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: LoadingScreenView['kind'],
): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'loading-state')
  root.setAttribute('data-loading-state', kind)
  root.setAttribute('hidden', '')
  // A named group, because the three lines below are one message. An unnamed
  // Container of three paragraphs is three announcements with no subject —
  // The failure `ICON_ROW_LABEL` records for the vitals rows, arriving as prose
  // Instead of as punctuation.
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', LOADING_LABEL[kind])
  parent.appendChild(root)
  return root
}

const appendStateKicker = (
  factory: DomElementFactory,
  root: DomElement,
  kind: LoadingScreenView['kind'],
): void => {
  const kicker = factory.createElement('p')
  kicker.setAttribute('data-mx-ui', 'loading-kicker')
  // THE colour, written once, on the element that owns this state.
  kicker.style.setProperty('color', LOADING_TOKEN[kind])
  kicker.textContent = LOADING_KICKER[kind]
  root.appendChild(kicker)
}

const appendStateTitle = (
  factory: DomElementFactory,
  root: DomElement,
  kind: LoadingScreenView['kind'],
): void => {
  const title = factory.createElement('h1')
  title.setAttribute('data-mx-ui', 'loading-title')
  title.style.setProperty('color', PALETTE_VAR.ink)
  title.textContent = LOADING_LABEL[kind]
  root.appendChild(title)
}

const appendStateDetail = (
  factory: DomElementFactory,
  root: DomElement,
  kind: LoadingScreenView['kind'],
): void => {
  const detail = factory.createElement('p')
  detail.setAttribute('data-mx-ui', 'loading-detail')
  detail.style.setProperty('color', PALETTE_VAR.inkMuted)
  detail.textContent = LOADING_DETAIL[kind]
  root.appendChild(detail)
}

const createStateElement = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: LoadingScreenView['kind'],
): LoadingStateElement => {
  const root = buildStateRoot(factory, parent, kind)
  appendStateKicker(factory, root, kind)
  appendStateTitle(factory, root, kind)
  appendStateDetail(factory, root, kind)

  const element: LoadingStateElement = { hidden: attributeCell(root, 'hidden'), kind, root }
  // Set directly above so the first frame does not flash both states at once;
  // Tell the cell what the element already says.
  element.hidden.previous = ''
  return element
}

const buildLoadingRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'loading')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  // A live region, as the captions and the save indicator are. `polite` rather
  // Than `assertive` for the reason `application/save-indicator.ts` gives about
  // Its own failure: neither of these states expires, so a queued announcement
  // Still finds the message on screen when the player reaches it, and nothing
  // Here is worth cutting off a sentence they are already listening to.
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('hidden', '')
  parent.appendChild(root)
  return root
}

/**
 * The one line on either state that is not written in advance.
 *
 * It is built INSIDE the failure rather than beside it, so it is hidden by the
 * same toggle. A reason element that outlives the state it belongs to is a
 * sentence about a failure sitting under a screen that is describing a
 * different one.
 *
 * INK rather than INK_MUTED: this is the only sentence carrying information
 * the player did not already have, so demoting it would make the new thing the
 * faintest thing on the screen.
 */
const buildFailureReason = (
  factory: DomElementFactory,
  states: ReadonlyArray<LoadingStateElement>,
): TextCell => {
  const reason = factory.createElement('p')
  reason.setAttribute('data-mx-ui', 'loading-reason')
  reason.style.setProperty('color', PALETTE_VAR.ink)
  for (const state of states) {
    if (state.kind === 'failed') {
      state.root.appendChild(reason)
    }
  }
  return textCell(reason)
}

const busyAttributeValue = (view: LoadingScreenView | undefined): string | undefined => {
  if (typeof view === 'undefined') {
    return
  }
  return String(view.kind === 'preparing')
}

const HELD_ATTRIBUTE_VALUE = ''

const heldAttributeValue = (view: LoadingScreenView | undefined): string | undefined => {
  if (view?.kind === 'preparing' && view.held) {
    return HELD_ATTRIBUTE_VALUE
  }
  return
}

const EMPTY_REASON_TEXT = ''

const reasonTextValue = (view: LoadingScreenView | undefined): string => {
  if (view?.kind === 'failed') {
    return view.reason
  }
  return EMPTY_REASON_TEXT
}

/**
 * Build the loading screen under `parent`.
 *
 * `parent` is passed in, never looked up (`docs/public-api.md` §4-1).
 */
export const createLoadingView = (
  factory: DomElementFactory,
  parent: DomElement,
): LoadingView => {
  const root = buildLoadingRoot(factory, parent)

  const rootHidden = attributeCell(root, 'hidden')
  rootHidden.previous = ''
  const stateFlag = attributeCell(root, 'data-loading')
  // `aria-busy` distinguishes 「still working」 from 「stopped, and it went wrong」
  // For a screen reader that cannot see that the words changed colour. It is an
  // Attribute rather than a role swap: the reference switches the overlay to
  // `role="alertdialog"` on failure, which is a live region turning into a
  // Dialog under an assistive technology that has already announced it.
  const busyFlag = attributeCell(root, 'aria-busy')
  /**
   * The floor, visible in the document.
   *
   * `held` means the world is ready and this screen is up only because
   * `LOADING_MINIMUM_VISIBLE_SECS` has not elapsed. Published as an attribute so
   * the state the reference could only observe with a stopwatch is observable
   * from the outside, and so a host debugging a long transition can tell
   * 「still generating」 from 「waiting out a timer」 without re-deriving it.
   */
  const heldFlag = attributeCell(root, 'data-loading-held')

  const states = LOADING_STATES.map((kind) => createStateElement(factory, root, kind))
  const reasonText = buildFailureReason(factory, states)

  return {
    render: (view: LoadingScreenView | undefined): void => {
      writeHidden(rootHidden, typeof view === 'undefined')
      writeAttribute(stateFlag, view?.kind)
      writeAttribute(busyFlag, busyAttributeValue(view))
      writeAttribute(heldFlag, heldAttributeValue(view))
      for (const state of states) {
        writeHidden(state.hidden, state.kind !== view?.kind)
      }
      writeText(reasonText, reasonTextValue(view))
    },
    root,
  }
}
