/**
 * The browser harness — mx-ui's screens in a REAL document, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * Why this exists when `apps/preview-screens/` already does
 * ---------------------------------------------------------------------------
 *
 * `apps/preview-screens/main.ts` argues at length why the FIRST preview was a
 * terminal renderer, and every one of its four reasons still holds. It also
 * names what a terminal cannot see — 「レイアウト崩れ、重なり、フォーカスリング、
 * スクリーンリーダーの読み上げ」 — and says that when the first screen was written
 * the browser preview goes 「これの代わりではなく隣に」. The screens are written.
 * This is the one that goes beside it.
 *
 * `docs/testing.md` §4 states exactly two things this repository has not proved,
 * and both are here:
 *
 *   1. GEOMETRY. Nothing asserts a width, a height, a position, a `z-index` or
 *      how a host's stylesheet interacts with any of them. The guarantee assumes
 *      guarded content stays ON the scrim; containment is structural but 「an
 *      element inside a scrim-backed element」 and 「a pixel on top of the scrim」
 *      are different sentences.
 *   2. `var()` IS UNRESOLVED. `test/fake-dom.ts` records the reference string and
 *      runs no cascade. The property names agree by construction because both
 *      sides come from the same constant, but nobody has watched a browser paint
 *      the colour.
 *
 * ---------------------------------------------------------------------------
 * THE ONE LINE THAT MATTERS
 * ---------------------------------------------------------------------------
 *
 *     const factory: DomElementFactory = document
 *
 * No cast. `application/dom-surface.ts` claims a real `Document` satisfies its
 * structural surface, `test/fixtures/dom-surface.ts` proves that claim against
 * `lib.dom.d.ts`, and `test/dom-surface.test.ts` asserts the proof compiles
 * clean. This is the same claim COLLECTED: the renderers were written against
 * the surface and are handed the real thing, so if the surface had drifted the
 * failure arrives here as a compile error or a `TypeError` rather than as a
 * browser consumer reaching for `as unknown as`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE HARNESS MAY STYLE, AND WHAT IT MUST NOT
 * ---------------------------------------------------------------------------
 *
 * The harness is the HOST. `docs/public-api.md` §4-1 makes the root an argument
 * precisely because mx-ui does not own the page, so a harness supplying a page
 * is supplying the thing a host supplies and nothing is being smuggled.
 *
 * The line is drawn in `index.html`: every rule there is scoped to
 * `[data-harness-host]` or above it, and NOT ONE reaches inside an mx-ui root.
 * That is what keeps the measurements honest. A harness stylesheet that sized a
 * hotbar slot would turn 「is the slot big enough to press」 into 「did the
 * harness say 48px」, which is the failure mode `docs/e2e-triage.md` names when
 * it refuses to assert `48` against a number a fake produced:
 * 「測っていないものを測ったことにはしない」.
 *
 * ---------------------------------------------------------------------------
 * NO LISTENER, HERE EITHER — and the harness is where that would be easiest
 * ---------------------------------------------------------------------------
 *
 * A browser harness is the obvious place to slip in `addEventListener`: it has a
 * real document, real events, and no test watching. It does not have one.
 * DN-UI-4's guarantee is that a renderer written against
 * `application/dom-surface.ts` CANNOT attach a handler because the verb is not
 * in the vocabulary, and the harness demonstrating the ban rather than
 * demonstrating an exception to it is worth more than any interactivity it would
 * buy. State comes from the query string; there is nothing to click.
 *
 * If a future check genuinely needs an event, it attaches OUTSIDE any mx-ui root
 * — on the page shell — and says so at the call site.
 */
import type { MotionPreference } from '../../domain/accessibility'
import type { DomElementFactory } from '../../application/dom-surface'
import { mountScreens, SCREEN_NAMES, type ScreenName } from './screens'

/**
 * Set on `<html>` once every screen is mounted.
 *
 * An attribute rather than a `window.__NERIMA_GAMES_QA__` global, which is what
 * `docs/e2e-triage.md` §0 records as the convention for mc-compose. The
 * convention is right there and wrong here: a QA global exists so a test can ask
 * a RUNNING GAME about state it cannot see in the DOM (frame counters, camera
 * vectors). This harness has no state that is not the DOM — every question the
 * browser checks ask is a question about elements — so a global would be an API
 * surface carrying nothing.
 */
const READY_ATTRIBUTE = 'data-harness-ready'

const isScreenName = (value: string): value is ScreenName =>
  (SCREEN_NAMES as ReadonlyArray<string>).includes(value)

/**
 * Which screen to leave visible, or `undefined` for all of them.
 *
 * Selection HIDES the other hosts rather than declining to mount them. Mounting
 * is the thing under test: a `?screen=hud` run that never built the inventory
 * would also never notice the inventory failing to build.
 */
const selectedScreen = (search: string): ScreenName | undefined => {
  const requested = new URLSearchParams(search).get('screen')
  return requested !== null && isScreenName(requested) ? requested : undefined
}

const selectedMotion = (search: string): MotionPreference =>
  new URLSearchParams(search).get('motion') === 'reduced' ? 'reduced' : 'full'

const selectedBreakProgress = (search: string): number | undefined => {
  const requested = new URLSearchParams(search).get('breakProgress')
  if (requested === null) {
    return undefined
  }
  const progress = Number(requested)
  return Number.isFinite(progress) && progress >= 0 && progress <= 1 ? progress : undefined
}

/**
 * The emulated safe-area inset, in CSS pixels.
 *
 * `env(safe-area-inset-*)` is zero in a headless Chromium with no notch, so a
 * check written against it would pass on an empty premise — the same shape of
 * defect `surveyPalette` was given an argument to escape (`docs/testing.md`
 * §5-3: 「発火するところを誰も見たことがないガードは、繋がっているかどうか誰も
 * 知らないガードである」). `?safe=44` gives the host a real inset so the check
 * has something to be wrong about. The default is the real `env()`, so the page
 * still behaves correctly on a device that has one.
 */
const selectedSafeInset = (search: string): string | undefined => {
  const requested = new URLSearchParams(search).get('safe')
  if (requested === null) {
    return undefined
  }
  const pixels = Number(requested)
  return Number.isFinite(pixels) && pixels >= 0 ? `${String(pixels)}px` : undefined
}

const start = (): void => {
  /**
   * THE ASSIGNMENT. A real `Document`, to the structural factory, with no cast.
   *
   * `DomElementFactory` names one method. `Document` has several hundred
   * members and one of them is `createElement`, whose `(tagName: string):
   * HTMLElement` overload is assignable to it. That is the whole subset claim,
   * and it is being made against the real declarations rather than against
   * `test/fake-dom.ts`.
   */
  const factory: DomElementFactory = document

  /**
   * The mount root, and it is deliberately left as `HTMLDivElement`.
   *
   * THIS LINE WAS WRITTEN `const page: DomElement = document.createElement('div')`
   * FIRST AND DID NOT COMPILE, which is the most useful thing the harness found
   * on its first run:
   *
   *     apps/browser-harness/main.ts: error TS2345: Argument of type
   *     'DomElement' is not assignable to parameter of type 'Node'.
   *       Type 'DomElement' is missing the following properties from type
   *       'Node': baseURI, childNodes, firstChild, isConnected, and 43 more.
   *
   * on the `document.body.appendChild(page)` below. It is NOT a defect in
   * `application/dom-surface.ts` — it is COST 1 and COST 2 in that file's header
   * observed from the direction the fixture does not exercise, and it is worth
   * naming because it constrains how a HOST must be written.
   *
   * The surface is a subset of the real DOM in ONE direction. `HTMLElement` is
   * assignable to `DomElement` (`test/fixtures/dom-surface.ts:58`), so a real
   * element can be handed IN. The reverse is blocked, and by a stronger thing
   * than the variance the header discusses: `Node.appendChild` is generic
   * (`<T extends Node>(node: T): T`), so bivariance never gets a chance — a
   * structural supertype simply does not satisfy `extends Node`.
   *
   * Nothing in mx-ui needs the reverse, and the shape of `docs/public-api.md`
   * §4-1's intended mount面 already says so: `mount: (root: HTMLElement) =>
   * Effect<void, never, Scope>` takes a REAL element. A host creates its roots
   * with the real DOM, appends them with the real DOM, and only then hands them
   * to mx-ui — after which mx-ui does all its own appending through the
   * structural surface and never gives an element back. The harness is written
   * that way here because that is how a host is written, not to dodge an error.
   *
   * What it would have cost to "fix" it in the surface is worth recording too:
   * nothing structural is both a supertype of `Node` (so a real element
   * satisfies `DomElement`) and a subtype of it (so a built element satisfies
   * `appendChild`), which is COST 2's argument. The only way through is a cast,
   * and a cast in a harness is the exact thing `application/dom-surface.ts`
   * says would be worse than a jsdom: 「the cast is where the type safety would
   * actually be lost」.
   */
  const page = document.createElement('div')
  page.setAttribute('data-harness-page', '')
  document.body.appendChild(page)

  const inset = selectedSafeInset(window.location.search)
  if (inset !== undefined) {
    // On the PAGE, never on an mx-ui root. `index.html` reads this property.
    page.style.setProperty('--harness-safe-inset', inset)
  }

  const screens = mountScreens(
    factory,
    page,
    selectedMotion(window.location.search),
    selectedBreakProgress(window.location.search),
  )

  const only = selectedScreen(window.location.search)
  if (only !== undefined) {
    for (const screen of screens) {
      if (screen.name !== only) {
        screen.host.setAttribute('hidden', '')
      }
    }
  }

  document.documentElement.setAttribute(READY_ATTRIBUTE, String(screens.length))
}

start()
