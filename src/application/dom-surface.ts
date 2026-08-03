/**
 * THE ENTIRE DOM SURFACE THIS REPOSITORY WRITES THROUGH, IN ONE FILE.
 *
 * ---------------------------------------------------------------------------
 * Why a structural surface, in the one repository that HAS `lib.DOM`
 * ---------------------------------------------------------------------------
 *
 * mc-render needs `application/dom-surface.ts` because its build project has no
 * DOM at all: the structural types are the only way its adapter can name
 * `window`. **That is not the reason here, and saying it was would be false.**
 * `tsconfig.base.json` declares `"lib": ["ES2024", "DOM"]` for every project in
 * this repository and has since the first cut — mx-ui is the one repository of
 * the sixteen that does. `Document` and `HTMLElement` are nameable in
 * `domain/`, `application/`, `test/` and `apps/` alike.
 *
 * The reason is the OTHER half of mc-render's argument, and it survives intact:
 *
 *   1. **`vitest.config.ts` runs `environment: 'node'`.** That is a decision, not
 *      a default — `docs/testing.md` §2 argues it at length, and the whole suite
 *      is milliseconds because of it. A renderer typed against `HTMLElement`
 *      cannot be tested there without a jsdom, or without a fake carrying
 *      `as unknown as HTMLElement`. The second is worse than the first: the cast
 *      is where the type safety would actually be lost, and it would be in the
 *      test rather than in the code, so nothing would ever catch a fake that had
 *      drifted from the real thing.
 *
 *   2. **`domain/` must stay unable to reach a document.** Nothing enforces that
 *      today except discipline and `docs/testing.md`. Concentrating every DOM
 *      member this repository writes through into one file makes the question
 *      "what does mx-ui do to a document?" answerable by reading ~40 lines,
 *      and makes growing that answer a diff in a file whose header says so.
 *
 * ---------------------------------------------------------------------------
 * The property that makes this safe, and how it is proved
 * ---------------------------------------------------------------------------
 *
 * A hand-written structural type is only useful if a REAL `Document` and a real
 * `HTMLElement` satisfy it WITHOUT A CAST. `test/fixtures/dom-surface.ts` is
 * compiled by `test/dom-surface.test.ts` against the real `lib.dom.d.ts` and
 * asserted to produce zero diagnostics, exactly as mc-render does. That test is
 * not decoration: three of the four shapes below were written the obvious way
 * first and the obvious way does not compile.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COSTS — and it is a DIFFERENT cost from mc-render's
 * ---------------------------------------------------------------------------
 *
 * mc-render pays "every event field is optional", because the values it names
 * are ones the browser hands IT: an `Event` in a listener parameter, which
 * forces `DomInputEvent` to be a SUPERTYPE of `Event`.
 *
 * Element construction inverts the direction, and the price lands somewhere
 * else. An element is a value the browser hands us (`createElement`'s RETURN,
 * so `DomElement` must be a supertype of `HTMLElement` — the same rule) but it
 * is ALSO a value we hand back (`appendChild`'s PARAMETER, where contravariance
 * demands the opposite: a SUBTYPE of `Node`). Nothing structural is both. So:
 *
 *   COST 1 — `appendChild` MUST be written with method syntax, not as a
 *   readonly function-typed property. Method parameters are compared
 *   bivariantly even under `strictFunctionTypes`; a property is not. Written the
 *   way `DomEventTarget` writes `addEventListener`, TypeScript says
 *   "Type 'DomNode' is missing the following properties from type 'Node':
 *   baseURI, childNodes, firstChild, isConnected, and 45 more", and there is no
 *   way to satisfy it — a structural subset is by construction a supertype.
 *   Bivariance is a real hole and it is named here rather than hidden: it is
 *   what lets a fake element be passed to a real `appendChild`, which is the
 *   whole point, and it is also what would let an unrelated object be passed.
 *
 *   COST 2 — the parent/child edge needs a SECOND, nearly empty type
 *   (`DomNode`). It cannot be `DomElement`: bivariance needs one direction to
 *   hold, and `DomElement` is assignable to `Node` in neither (it has
 *   `setAttribute`, which `Node` lacks). It cannot be `{}` either — that accepts
 *   anything. `nodeType` is the one member every `Node` has that this
 *   repository can name without dragging in the node hierarchy, so `DomNode` is
 *   that member and nothing else. mx-ui never reads it.
 *
 *   COST 3 — `textContent` is `string | null` even though nothing here ever
 *   writes null and nothing ever reads it. This is the direct analogue of
 *   mc-render's optional event fields: lib.dom has changed the declaration
 *   (older vintages: `textContent: string | null`; TypeScript 5.9:
 *   `get textContent(): string; set textContent(value: string | null)`), and the
 *   union is the shape both satisfy. Same call as mc-render's `unknown` return
 *   on `requestPointerLock`: this file does not pick a browser vintage.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------------------------------------------------------
 *
 * **Generic elements cannot register events or receive focus.**
 *
 * plan.md §3.13 and DN-UI-4: 「モーダルの Escape は stopPropagation、閉じる責務は
 * フレーム側単一ハンドラ(mc-render の入力設計と対)」. `domain/modal-stack.ts` is that
 * single decision, and a renderer that attaches its own key handler makes it two.
 * `test/hud-view.test.ts` asserts at runtime that no listener is registered. The
 * menu uses native buttons and inputs, so only those factory overloads expose
 * click/input registration and focus. No keyboard event is exposed: browser
 * button semantics turn Enter and Space into click without a second key handler.
 *
 * Also absent: `removeChild`, `remove`, `innerHTML`, `classList`, `querySelector`
 * and `document.body`. Removal is done by toggling `hidden`, so the element tree
 * built at mount is the element tree that exists forever after (see
 * `application/hud-view.ts` on why that matters for §5.2). `document.body` is
 * absent because the host hands us a root: `docs/public-api.md` §4-1 requires it,
 * so that a preview page can stand up two mx-ui instances at once.
 */

/**
 * A node, reduced to the one member every `Node` has that we can safely name.
 *
 * Exists only so that `appendChild` has a parameter type — see COST 2 above.
 * Nothing in this repository ever reads `nodeType`.
 */
export type DomNode = {
  readonly nodeType: number
}

/**
 * An inline style declaration, reduced to the two methods a token write needs.
 *
 * `setProperty` is what applies a custom property; `removeProperty` is how
 * reduced motion DELETES a transition rather than setting it to `0ms` (see
 * `animationDurationMs` in `domain/accessibility.ts`: zero, not "shorter").
 *
 * `CSSStyleDeclaration.removeProperty` returns the old value; this returns
 * `void`, which a `string`-returning function satisfies. `setProperty`'s real
 * signature takes `(property: string, value: string | null, priority?: string)`,
 * and a two-parameter target is satisfied by it.
 */
export type DomStyle = {
  setProperty(property: string, value: string): void
  removeProperty(property: string): void
}

/**
 * An element, reduced to the five members this repository writes through.
 *
 * `HTMLElement`, `HTMLDivElement`, `HTMLCanvasElement` and even `SVGElement`
 * satisfy it — the fixture checks all of them, because the colour-vision
 * attribute goes on whatever mc-render's canvas turns out to be.
 */
export type DomElement = DomNode & {
  /** `string | null` for a version-portability reason, not a design one — COST 3. */
  textContent: string | null
  readonly style: DomStyle
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  /** Method syntax is load-bearing — COST 1. Returns `unknown`: the real one returns the child. */
  appendChild(child: DomNode): unknown
}

/** The event and focus verbs available only on native interactive controls. */
export type DomInteractiveElement = DomElement & {
  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void
  focus(): void
}

/** The extra writable state exposed by a native text input. */
export type DomInputElement = DomInteractiveElement & {
  value: string
}

/**
 * `document`, reduced to the one method that makes an element.
 *
 * NOT `Document`: nothing here needs `body`, `head`, `querySelector` or
 * `createElementNS`. The last is the interesting omission — the `feColorMatrix`
 * daltonisation filter is SVG, and it is NOT built here. DN-UI-1a splits the
 * asset in two: `domain/accessibility.ts` decides the VALUES
 * (`colorVisionMatrixValues`) and the host page decides the SCOPE. mx-ui emits
 * the switch (`application/accessibility-dom.ts`); the filter definition is
 * markup belonging to whoever owns the canvas, which is mc-render (plan.md §3.9).
 */
export type DomElementFactory = {
  createElement(tagName: 'input'): DomInputElement
  createElement(tagName: 'button'): DomInteractiveElement
  createElement(tagName: string): DomElement
}

/**
 * Something that can carry a `data-` attribute and nothing else.
 *
 * The colour-vision attribute's target. Narrower than `DomElement` on purpose:
 * `applyColorVision` is handed mc-render's canvas, an element mx-ui does not
 * own and must not build into, style or append to. Giving that function a
 * `DomElement` would let it do all three.
 */
export type DomAttributeTarget = {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}
