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
 * Stage and progress are host facts
 * ---------------------------------------------------------------------------
 *
 * The domain validates the host's stage and fraction before this projection.
 * This view exposes the stage as localized text and the fraction through both
 * a native accessibility role and a visible meter. It does not estimate work
 * from elapsed time. Older view-model callers that have no stage data are
 * projected as generation at zero until they move to the determinate API.
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
import { DEFAULT_UI_LANGUAGE, type UiMessageKey, translateUiMessage } from '../domain/ui-language.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { type LoadingProgressValue, type LoadingScreenView } from '../domain/loading-screen.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import { setLocalizedAttribute, setLocalizedText, writeLocalizedAttribute, writeLocalizedText } from './ui-localization.js'
import { LoadingProgressValueSchema } from '../domain/ui3-brand-schemas.js'
import { Schema } from 'effect'

/** Render order, and the order the tests sweep. */
export const LOADING_STATES: ReadonlyArray<LoadingScreenView['kind']> = ['preparing', 'failed']

type LegacyLoadingScreenView = { readonly kind: 'preparing'; readonly held: boolean }
type LoadingViewProjection = LoadingScreenView | LegacyLoadingScreenView

/**
 * The words.
 *
 * mx-ui's own strings, as `SAVE_STATUS_LABEL` is. The kicker is the reference's
 * (`loading-screen.ts:59`, 'WORLD GENERATION'); the titles are its `:60` and
 * `:97`.
 */
export const LOADING_LABEL: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.error-title'),
  preparing: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.preparing-title'),
}

const LOADING_TITLE_KEY: Readonly<Record<LoadingScreenView['kind'], UiMessageKey>> = {
  failed: 'loading.error-title',
  preparing: 'loading.preparing-title',
}

export const LOADING_KICKER: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.error-eyebrow'),
  preparing: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.preparing-eyebrow'),
}

const LOADING_KICKER_KEY: Readonly<Record<LoadingScreenView['kind'], UiMessageKey>> = {
  failed: 'loading.error-eyebrow',
  preparing: 'loading.preparing-eyebrow',
}

/**
 * The line under the title.
 *
 * The failure's is the reference's `:79` verbatim, because the advice is the
 * advice whichever repository gives it.
 */
export const LOADING_DETAIL: Readonly<Record<LoadingScreenView['kind'], string>> = {
  failed: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.error-advice'),
  preparing: translateUiMessage(DEFAULT_UI_LANGUAGE, 'loading.preparing-description'),
}

const LOADING_DETAIL_KEY: Readonly<Record<LoadingScreenView['kind'], UiMessageKey>> = {
  failed: 'loading.error-advice',
  preparing: 'loading.preparing-description',
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

type LoadingStateBase = {
  readonly root: DomElement
  readonly hidden: AttributeCell
}

type LoadingProgressElements = {
  readonly stageText: TextCell
  readonly progressText: TextCell
  readonly progressLabel: AttributeCell
  readonly progressNow: AttributeCell
  readonly progressWidth: { readonly style: DomElement['style']; previous: number }
}

type PreparingLoadingState = LoadingStateBase & LoadingProgressElements & { readonly kind: 'preparing' }
type FailedLoadingState = LoadingStateBase & { readonly kind: 'failed' }

const PROGRESS_PERCENT_MAX = 100
const ZERO_PROGRESS = 0
const INITIAL_PROGRESS: LoadingProgressValue = Schema.decodeUnknownSync(LoadingProgressValueSchema)(ZERO_PROGRESS)

const LOADING_STAGE_KEY = {
  generation: 'loading.stage.generation',
  reading: 'loading.stage.reading',
  'render-preparation': 'loading.stage.render-preparation',
} as const

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
  readonly render: (view: LoadingViewProjection | undefined) => void
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
  setLocalizedAttribute(root, 'aria-label', LOADING_TITLE_KEY[kind])
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
  setLocalizedText(kicker, LOADING_KICKER_KEY[kind])
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
  setLocalizedText(title, LOADING_TITLE_KEY[kind])
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
  setLocalizedText(detail, LOADING_DETAIL_KEY[kind])
  root.appendChild(detail)
}

const createStageText = (factory: DomElementFactory, root: DomElement): TextCell => {
  const stage = factory.createElement('p')
  stage.setAttribute('data-mx-ui', 'loading-stage')
  setLocalizedText(stage, 'loading.stage.generation')
  root.appendChild(stage)
  return textCell(stage)
}

const createProgressMeterRoot = (factory: DomElementFactory): DomElement => {
  const progress = factory.createElement('div')
  progress.setAttribute('data-mx-ui', 'loading-progress')
  progress.setAttribute('role', 'progressbar')
  progress.setAttribute('aria-valuemin', String(INITIAL_PROGRESS))
  progress.setAttribute('aria-valuemax', String(PROGRESS_PERCENT_MAX))
  progress.style.setProperty('width', 'min(80vw, 28rem)')
  progress.style.setProperty('height', '0.75rem')
  progress.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  return progress
}

const createProgressMeterFill = (factory: DomElementFactory): DomElement => {
  const fill = factory.createElement('div')
  fill.setAttribute('data-mx-ui', 'loading-progress-fill')
  fill.style.setProperty('width', `${String(INITIAL_PROGRESS)}%`)
  fill.style.setProperty('height', '100%')
  fill.style.setProperty('background-color', LOADING_TOKEN.preparing)
  return fill
}

const createProgressMeter = (
  factory: DomElementFactory,
  root: DomElement,
): Pick<LoadingProgressElements, 'progressLabel' | 'progressNow' | 'progressWidth'> => {
  const progress = createProgressMeterRoot(factory)
  const progressLabel = attributeCell(progress, 'aria-label')
  writeLocalizedAttribute(progressLabel, 'loading.progress', { percent: String(INITIAL_PROGRESS) })
  const progressNow = attributeCell(progress, 'aria-valuenow')
  writeAttribute(progressNow, String(INITIAL_PROGRESS))
  const fill = createProgressMeterFill(factory)
  progress.appendChild(fill)
  root.appendChild(progress)
  return {
    progressLabel,
    progressNow,
    progressWidth: { previous: INITIAL_PROGRESS, style: fill.style },
  }
}

const createProgressText = (factory: DomElementFactory, root: DomElement): TextCell => {
  const text = factory.createElement('p')
  text.setAttribute('data-mx-ui', 'loading-progress-text')
  root.appendChild(text)
  const progressText = textCell(text)
  writeLocalizedText(progressText, 'loading.progress', { percent: String(INITIAL_PROGRESS) })
  return progressText
}

const createLoadingProgressElements = (factory: DomElementFactory, root: DomElement): LoadingProgressElements => {
  const stageText = createStageText(factory, root)
  const meter = createProgressMeter(factory, root)
  const progressText = createProgressText(factory, root)
  return { ...meter, progressText, stageText }
}

const createStateShell = (
  factory: DomElementFactory,
  parent: DomElement,
  kind: LoadingScreenView['kind'],
): LoadingStateBase => {
  const root = buildStateRoot(factory, parent, kind)
  appendStateKicker(factory, root, kind)
  appendStateTitle(factory, root, kind)
  appendStateDetail(factory, root, kind)
  const hidden = attributeCell(root, 'hidden')
  // Set directly above so the first frame does not flash both states at once;
  // Tell the cell what the element already says.
  hidden.previous = ''
  return { hidden, root }
}

const createPreparingStateElement = (
  factory: DomElementFactory,
  parent: DomElement,
): PreparingLoadingState => {
  const shell = createStateShell(factory, parent, 'preparing')
  return { ...shell, ...createLoadingProgressElements(factory, shell.root), kind: 'preparing' }
}

const createFailedStateElement = (
  factory: DomElementFactory,
  parent: DomElement,
): FailedLoadingState => ({
  ...createStateShell(factory, parent, 'failed'),
  kind: 'failed',
})

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
  failed: FailedLoadingState,
): TextCell => {
  const reason = factory.createElement('p')
  reason.setAttribute('data-mx-ui', 'loading-reason')
  reason.style.setProperty('color', PALETTE_VAR.ink)
  failed.root.appendChild(reason)
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

const writeProgressWidth = (state: PreparingLoadingState, progress: number): void => {
  const width = state.progressWidth
  const percent = progress * PROGRESS_PERCENT_MAX
  if (width.previous === percent) {
    return
  }
  width.previous = percent
  width.style.setProperty('width', `${String(percent)}%`)
}

const normalizeLoadingView = (input: LoadingViewProjection | undefined): LoadingScreenView | undefined => {
  if (input?.kind === 'preparing' && !('stage' in input)) {
    return { ...input, progress: INITIAL_PROGRESS, stage: 'generation' }
  }
  return input
}

const renderPreparingDetails = (preparing: PreparingLoadingState, view: Extract<LoadingScreenView, { kind: 'preparing' }>): void => {
  writeLocalizedText(preparing.stageText, LOADING_STAGE_KEY[view.stage])
  const percent = String(Math.round(view.progress * PROGRESS_PERCENT_MAX))
  writeLocalizedAttribute(preparing.progressLabel, 'loading.progress', { percent })
  writeAttribute(preparing.progressNow, String(view.progress * PROGRESS_PERCENT_MAX))
  writeLocalizedText(preparing.progressText, 'loading.progress', { percent })
  writeProgressWidth(preparing, view.progress)
}

type LoadingRenderElements = {
  readonly busyFlag: AttributeCell
  readonly failed: FailedLoadingState
  readonly heldFlag: AttributeCell
  readonly preparing: PreparingLoadingState
  readonly reasonText: TextCell
  readonly root: DomElement
  readonly rootHidden: AttributeCell
  readonly stateFlag: AttributeCell
}

const renderLoadingRootState = (elements: LoadingRenderElements, view: LoadingScreenView | undefined): void => {
  writeHidden(elements.rootHidden, typeof view === 'undefined')
  writeAttribute(elements.stateFlag, view?.kind)
  writeAttribute(elements.busyFlag, busyAttributeValue(view))
  writeAttribute(elements.heldFlag, heldAttributeValue(view))
}

const renderLoadingElements = (elements: LoadingRenderElements, input: LoadingViewProjection | undefined): void => {
  const view = normalizeLoadingView(input)
  renderLoadingRootState(elements, view)
  writeHidden(elements.preparing.hidden, view?.kind !== 'preparing')
  writeHidden(elements.failed.hidden, view?.kind !== 'failed')
  if (view?.kind === 'preparing') {
    renderPreparingDetails(elements.preparing, view)
  }
  writeText(elements.reasonText, reasonTextValue(view))
}

const createLoadingElements = (
  factory: DomElementFactory,
  parent: DomElement,
): LoadingRenderElements => {
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

  const preparing = createPreparingStateElement(factory, root)
  const failed = createFailedStateElement(factory, root)
  const reasonText = buildFailureReason(factory, failed)

  return { busyFlag, failed, heldFlag, preparing, reasonText, root, rootHidden, stateFlag }
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
  const elements = createLoadingElements(factory, parent)
  return {
    render: (input: LoadingViewProjection | undefined): void => renderLoadingElements(elements, input),
    root: elements.root,
  }
}
