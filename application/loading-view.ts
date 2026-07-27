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
import type { LoadingScreenView } from '../domain/loading-screen'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeText,
  type AttributeCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'

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
  preparing: 'Preparing your world',
  failed: 'We could not build this world',
}

export const LOADING_KICKER: Readonly<Record<LoadingScreenView['kind'], string>> = {
  preparing: 'WORLD GENERATION',
  failed: 'WORLD INTERRUPTED',
}

/**
 * The line under the title.
 *
 * The failure's is the reference's `:79` verbatim, because the advice is the
 * advice whichever repository gives it.
 */
export const LOADING_DETAIL: Readonly<Record<LoadingScreenView['kind'], string>> = {
  preparing: 'Shaping terrain, placing blocks, and lighting the horizon.',
  failed: 'Check your connection or refresh the page to try again.',
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
  preparing: PALETTE_VAR.statusBusy,
  failed: PALETTE_VAR.statusAlert,
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

const createStateElement = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: LoadingScreenView['kind'],
): LoadingStateElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'loading-state')
  root.setAttribute('data-loading-state', kind)
  root.setAttribute('hidden', '')
  // A named group, because the three lines below are one message. An unnamed
  // container of three paragraphs is three announcements with no subject —
  // the failure `ICON_ROW_LABEL` records for the vitals rows, arriving as prose
  // instead of as punctuation.
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', LOADING_LABEL[kind])
  parent.appendChild(root)

  const kicker = factory.createElement('p')
  kicker.setAttribute('data-mx-ui', 'loading-kicker')
  // THE colour, written once, on the element that owns this state.
  kicker.style.setProperty('color', LOADING_TOKEN[kind])
  kicker.textContent = LOADING_KICKER[kind]
  root.appendChild(kicker)

  const title = factory.createElement('h1')
  title.setAttribute('data-mx-ui', 'loading-title')
  title.style.setProperty('color', PALETTE_VAR.ink)
  title.textContent = LOADING_LABEL[kind]
  root.appendChild(title)

  const detail = factory.createElement('p')
  detail.setAttribute('data-mx-ui', 'loading-detail')
  detail.style.setProperty('color', PALETTE_VAR.inkMuted)
  detail.textContent = LOADING_DETAIL[kind]
  root.appendChild(detail)

  const element: LoadingStateElement = { kind, root, hidden: attributeCell(root, 'hidden') }
  // Set directly above so the first frame does not flash both states at once;
  // tell the cell what the element already says.
  element.hidden.previous = ''
  return element
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
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'loading')
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  // A live region, as the captions and the save indicator are. `polite` rather
  // than `assertive` for the reason `application/save-indicator.ts` gives about
  // its own failure: neither of these states expires, so a queued announcement
  // still finds the message on screen when the player reaches it, and nothing
  // here is worth cutting off a sentence they are already listening to.
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('hidden', '')
  parent.appendChild(root)

  const rootHidden = attributeCell(root, 'hidden')
  rootHidden.previous = ''
  const stateFlag = attributeCell(root, 'data-loading')
  // `aria-busy` distinguishes 「still working」 from 「stopped, and it went wrong」
  // for a screen reader that cannot see that the words changed colour. It is an
  // attribute rather than a role swap: the reference switches the overlay to
  // `role="alertdialog"` on failure, which is a live region turning into a
  // dialog under an assistive technology that has already announced it.
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
  const reason = factory.createElement('p')
  reason.setAttribute('data-mx-ui', 'loading-reason')
  reason.style.setProperty('color', PALETTE_VAR.ink)
  for (const state of states) {
    if (state.kind === 'failed') {
      state.root.appendChild(reason)
    }
  }
  const reasonText = textCell(reason)

  return {
    root,
    render: (view: LoadingScreenView | undefined): void => {
      writeHidden(rootHidden, view === undefined)
      writeAttribute(stateFlag, view?.kind)
      writeAttribute(busyFlag, view === undefined ? undefined : String(view.kind === 'preparing'))
      writeAttribute(heldFlag, view?.kind === 'preparing' && view.held ? '' : undefined)
      for (const state of states) {
        writeHidden(state.hidden, state.kind !== view?.kind)
      }
      writeText(reasonText, view?.kind === 'failed' ? view.reason : '')
    },
  }
}
