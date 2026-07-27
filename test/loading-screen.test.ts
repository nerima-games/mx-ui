/**
 * The loading screen — the one demoted row whose whole content was a stopwatch.
 *
 * ---------------------------------------------------------------------------
 * What was ported
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/e2e/ui/loading-screen.e2e.ts`, all of it: one Playwright test
 * with a 90-second timeout that boots a page, waits up to 60 seconds for a main
 * menu, clicks through New World, waits up to 30 seconds for an overlay to
 * appear, sleeps a second, and then asserts the overlay was up for at least
 * 1,800 ms — hedged down from the real floor of 2,500 ms 「for CI jitter」.
 *
 * `docs/e2e-triage.md` §3.6 demoted it with one sentence — 「最低表示時間はローディング
 * 画面の内部規約」 — and that is exactly what makes the port stronger than the
 * original. The floor is arithmetic on a timestamp the caller supplies
 * (DN-UI-10), so it is asserted EXACTLY rather than approximately, at both
 * sides of the boundary, in microseconds, with no jitter to hedge against.
 *
 * The half that did NOT come is the half that needed a browser: whether a real
 * session actually keeps a real clock. `docs/testing.md` §3 says the same thing
 * generally, and it is why `docs/e2e-triage.md` keeps 22 rows in mc-compose.
 *
 * Plain `it`, not `it.effect`, per DN-UI-2 and `docs/testing.md` §3 — nothing
 * here forks a fiber, and the rule is followed anyway because the first test
 * that does will be written by copying one of these.
 */
import { describe, expect, it } from 'vitest'
import {
  IDLE_LOADING_STATUS,
  LOADING_MINIMUM_VISIBLE_SECS,
  loadingScreenView,
  loadingStatus,
} from '../domain/loading-screen'
import {
  createLoadingView,
  LOADING_DETAIL,
  LOADING_KICKER,
  LOADING_LABEL,
  LOADING_STATES,
} from '../application/loading-view'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../application/palette-css'
import { fakeDocument, writeNames, type FakeElement } from './fake-dom'

const mount = () => {
  const factory = fakeDocument()
  const parent = factory.createElement('div') as FakeElement
  const view = createLoadingView(factory, parent)
  return { factory, parent, view, root: view.root as FakeElement }
}

const preparing = loadingStatus({ kind: 'preparing' }, 0)
const ready = loadingStatus({ kind: 'ready' }, 0)
const failed = (reason: string) => loadingStatus({ kind: 'failed', reason }, 0)

describe('the floor under how long the screen stays up', () => {
  it('REGRESSION: a world that is ready instantly still gets the whole minimum', () => {
    // THE ported row. The reference could only ask it with a stopwatch and had
    // to accept 1,800 ms of a 2,500 ms floor; here the boundary is exact.
    //
    // What it defends against: a fast machine turning the menu-to-world
    // transition into a jump cut. The player clicks Confirm, nothing
    // acknowledges the click, and the one person who sees it is the one whose
    // hardware made everything else feel fine.
    expect(loadingScreenView(ready, 0)).toStrictEqual({ kind: 'preparing', held: true })
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS - 0.001)).toStrictEqual({
      kind: 'preparing',
      held: true,
    })
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS)).toBeUndefined()
  })

  it('carries the reference’s own number rather than a new one', () => {
    // `<reference-impl>/packages/app/application/main/session-loading-gates-state.ts:1`
    // is `MIN_LOADING_SCREEN_DURATION_MS = 2500`. Choosing a different floor here
    // would make the reference's finding and this repository's rule two
    // unrelated facts that happen to be about the same screen.
    expect(LOADING_MINIMUM_VISIBLE_SECS).toBe(2.5)
  })

  it('REGRESSION: `preparing` is not timed at all — the floor is a minimum, not a budget', () => {
    // A load takes as long as it takes, and mx-ui does not own the load. A
    // screen that gave up after N seconds would tell the player the world was
    // ready when it was not, which is the class of lie DN-UI-6 refuses when it
    // declines to round a half heart away.
    expect(loadingScreenView(preparing, 0)).toStrictEqual({ kind: 'preparing', held: false })
    expect(loadingScreenView(preparing, 10_000)).toStrictEqual({ kind: 'preparing', held: false })
  })

  it('REGRESSION: `held` separates “still generating” from “waiting out a timer”', () => {
    // The reference could not tell these apart at all — both are 「the overlay is
    // visible」 to a `toBeVisible()`. They are different facts about the session
    // and a host debugging a slow transition needs the difference, so it is
    // published rather than left to be re-derived (DN-UI-7c).
    const stillWorking = loadingScreenView(preparing, 1)
    const onlyTheFloor = loadingScreenView(ready, 1)

    expect(stillWorking?.kind).toBe('preparing')
    expect(onlyTheFloor?.kind).toBe('preparing')
    expect(stillWorking).not.toStrictEqual(onlyTheFloor)
  })

  it('REGRESSION: a failure does not expire, and the floor cannot hide it', () => {
    // The asymmetry `domain/save-status.ts` argues: a confirmation is a receipt
    // and a failure is a warning. A player dropped back to a menu with no
    // explanation has to guess whether they lost a world.
    expect(loadingScreenView(failed('disk full'), 0)).toStrictEqual({
      kind: 'failed',
      reason: 'disk full',
    })
    expect(loadingScreenView(failed('disk full'), 10_000)).toStrictEqual({
      kind: 'failed',
      reason: 'disk full',
    })
  })

  it('REGRESSION: nothing here reads a clock — the time is an argument (DN-UI-10)', () => {
    // plan.md §4.3 bans wall-clock reads repository-wide and `pnpm check:deps`
    // enforces it. The observable consequence is this: the same status at two
    // different `nowSecs` gives two different answers, so a test can age a
    // two-and-a-half second floor in microseconds.
    expect(loadingScreenView(ready, 0)?.kind).toBe('preparing')
    expect(loadingScreenView(ready, 3)).toBeUndefined()
    // And the floor is injectable, which is how a host with a different
    // transition can state its own without editing this repository.
    expect(loadingScreenView(ready, 0.5, 0.25)).toBeUndefined()
  })

  it('a NaN or backwards clock keeps the screen UP rather than tearing it away', () => {
    // Same call as `saveStatusMessage`: choose the outcome that does not invent
    // a claim. Hiding is the claim here — 「the world is ready and you have had
    // time to see that it was not」 — and a mid-transition flicker is what the
    // floor exists to prevent in the first place.
    expect(loadingScreenView(ready, Number.NaN)?.kind).toBe('preparing')
    expect(loadingScreenView(loadingStatus({ kind: 'ready' }, 100), 0)?.kind).toBe('preparing')
  })

  it('REGRESSION: a non-finite start time elapses immediately rather than never', () => {
    // The opposite call from `saveStatus`, and the header says why: a NaN there
    // pins a receipt on screen forever, a NaN here would pin the player in front
    // of a loading screen with a finished world behind it. Both avoid the
    // outcome that traps somebody.
    expect(loadingStatus({ kind: 'ready' }, Number.NaN).startedAtSecs).toBe(0)
    expect(loadingScreenView(loadingStatus({ kind: 'ready' }, Number.NaN), 3)).toBeUndefined()
    expect(loadingScreenView(IDLE_LOADING_STATUS, 3)).toBeUndefined()
  })
})

describe('the loading screen puts the palette on a screen', () => {
  it('declares the tokens on its own root and references both state colours at MOUNT', () => {
    // Both, not whichever happened to render. `test/palette-css.test.ts` exists
    // because a token whose colour reaches no element is a guarantee about
    // numbers, and a one-element renderer would make 「did STATUS_ALERT reach the
    // screen?」 depend on whether anything failed during the test that asked.
    const { root } = mount()

    expect(root.style.properties.get(PALETTE_PROPERTY.statusAlert)).toBeDefined()
    const colourOf = (kind: string): string | undefined =>
      root.find('data-loading-state', kind)?.find('data-mx-ui', 'loading-kicker')?.style.properties.get('color')

    expect(colourOf('preparing')).toBe(PALETTE_VAR.statusBusy)
    expect(colourOf('failed')).toBe(PALETTE_VAR.statusAlert)
  })

  it('shows one state at a time, and nothing at all when there is nothing to say', () => {
    const { root, view } = mount()
    const hiddenOf = (kind: string): boolean =>
      root.find('data-loading-state', kind)?.attributes.has('hidden') ?? false

    view.render({ kind: 'preparing', held: false })
    expect(root.attributes.has('hidden')).toBe(false)
    expect(hiddenOf('preparing')).toBe(false)
    expect(hiddenOf('failed')).toBe(true)
    expect(root.attributes.get('aria-busy')).toBe('true')

    view.render({ kind: 'failed', reason: 'chunk stream ended' })
    expect(hiddenOf('preparing')).toBe(true)
    expect(hiddenOf('failed')).toBe(false)
    // `aria-busy` false, not a role swap. The reference turns the overlay into
    // `role="alertdialog"` on failure, which is a live region becoming a dialog
    // under an assistive technology that has already announced it.
    expect(root.attributes.get('aria-busy')).toBe('false')

    view.render(undefined)
    expect(root.attributes.has('hidden')).toBe(true)
    expect(LOADING_STATES.every((kind) => hiddenOf(kind))).toBe(true)
  })

  it('REGRESSION: the reason lives INSIDE the failure, so it cannot outlive it', () => {
    // A reason element beside the state rather than under it is a sentence about
    // one failure sitting under a screen describing a different one — or, worse,
    // under a `preparing` screen that has nothing to explain.
    const { root, view } = mount()
    view.render({ kind: 'failed', reason: 'chunk stream ended' })

    const failure = root.find('data-loading-state', 'failed')
    expect(failure?.find('data-mx-ui', 'loading-reason')?.textContent).toBe('chunk stream ended')
    expect(root.find('data-mx-ui', 'loading-reason')?.textContent).toBe('chunk stream ended')

    view.render({ kind: 'preparing', held: true })
    expect(root.find('data-mx-ui', 'loading-reason')?.textContent).toBe('')
  })

  it('REGRESSION: `held` reaches the document, so the floor is observable from outside', () => {
    // The state the reference needed a stopwatch and a 700 ms margin to see.
    const { root, view } = mount()

    view.render({ kind: 'preparing', held: false })
    expect(root.attributes.has('data-loading-held')).toBe(false)

    view.render({ kind: 'preparing', held: true })
    expect(root.attributes.get('data-loading-held')).toBe('')
  })

  it('REGRESSION: a re-render with an unchanged view mutates nothing at all', () => {
    // The property `application/dom-write.ts` exists for. Stated as writes on a
    // fake document rather than as milliseconds, because a fake document can
    // report that nothing happened and a stopwatch cannot.
    const { factory, view } = mount()
    view.render({ kind: 'preparing', held: true })

    const before = factory.mark()
    view.render({ kind: 'preparing', held: true })
    // Projected to strings: a `Mutation` holds its target, a `FakeElement` holds
    // the shared log, and the log holds every `Mutation`, so a FAILING
    // `toStrictEqual([])` on the raw array walks that cycle and kills the runner
    // instead of naming the write (`test/fake-dom.ts`).
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('writes no colour and no text on a state change — the words are permanent', () => {
    // `textContent = x` destroys and recreates a text node even when `x` is
    // unchanged (`application/dom-write.ts`), and the words are the strongest
    // non-colour channel there is, so they are worth having permanently rather
    // than rebuilt per transition. Only the reason moves, because only the
    // reason is not known in advance.
    const { factory, view } = mount()
    view.render({ kind: 'preparing', held: false })

    const before = factory.mark()
    view.render({ kind: 'failed', reason: 'out of memory' })
    const written = writeNames(factory.since(before))

    expect(written.filter((name) => name.startsWith('style:'))).toStrictEqual([])
    expect(written.filter((name) => name === 'text:textContent')).toStrictEqual([
      'text:textContent',
    ])
  })

  it('REGRESSION: attaches no event listener anywhere in its tree (DN-UI-4)', () => {
    // Not 「none today」: `application/dom-surface.ts` does not contain the verb.
    // `test/fake-dom.ts` is deliberately MORE capable than the surface so that
    // this is an observation about the renderer rather than about the fake.
    const { root, view } = mount()
    view.render({ kind: 'failed', reason: 'anything' })
    expect(root.listenersInTree()).toStrictEqual([])
  })
})

describe('REGRESSION: there is no progress bar, and that is the finding', () => {
  it('draws no track, no fill and no percentage — words only', () => {
    // `<reference-impl>/packages/presentation/loading/loading-screen.ts:67` draws
    // `.loading-track` with an animated `.loading-track-fill`, `aria-hidden`
    // because it carries no information. Then `:123` handles reduced motion by
    // removing the animation and parking the fill at `left:29%;width:42%`.
    //
    // For every player who asked their OS not to animate things, an
    // indeterminate shimmer becomes a STATIC bar that reads as determinate
    // progress a third of the way along, and never moves again — so a slow load
    // looks like a hung one. `domain/accessibility.ts` says the setting is for
    // people who get motion sick rather than for people who are impatient; a
    // frozen indeterminate bar serves neither and invents a number for the
    // population least able to dismiss it.
    const { root, view } = mount()
    view.render({ kind: 'preparing', held: false })

    for (const element of root.walk()) {
      expect(element.style.properties.has('width')).toBe(false)
      expect(element.style.properties.has('animation')).toBe(false)
      expect(element.style.properties.has('transition')).toBe(false)
    }
    // And every line the screen shows is a line somebody wrote, not a number
    // somebody inferred.
    expect(root.find('data-loading-state', 'preparing')?.find('data-mx-ui', 'loading-title')?.textContent).toBe(
      LOADING_LABEL.preparing,
    )
    expect(root.find('data-loading-state', 'preparing')?.find('data-mx-ui', 'loading-kicker')?.textContent).toBe(
      LOADING_KICKER.preparing,
    )
    expect(root.find('data-loading-state', 'failed')?.find('data-mx-ui', 'loading-detail')?.textContent).toBe(
      LOADING_DETAIL.failed,
    )
  })

  it('takes no MotionPreference, because it has nothing to suppress', () => {
    // `createHudView` and `createCaptionView` take one because they animate. A
    // `setMotion` here would be a switch with nothing behind it, which is the
    // shape DN-UI-1a spent a paragraph rejecting.
    expect(createLoadingView.length).toBe(2)
    expect('setMotion' in mount().view).toBe(false)
  })

  it('names both states, so a screen reader is not handed three unattributed paragraphs', () => {
    // The vitals defect in prose form. `ICON_ROW_LABEL` records what happens to a
    // group of glyphs nobody named; three sibling paragraphs with no subject is
    // the same failure with words instead of hearts.
    const { root } = mount()
    for (const kind of LOADING_STATES) {
      const state = root.find('data-loading-state', kind)
      expect(state?.attributes.get('role')).toBe('group')
      expect(state?.attributes.get('aria-label')).toBe(LOADING_LABEL[kind])
    }
    expect(root.attributes.get('aria-live')).toBe('polite')
  })
})
