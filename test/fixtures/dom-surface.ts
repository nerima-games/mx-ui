/**
 * NOT A TEST — a fixture that is COMPILED by one.
 *
 * `test/dom-surface.test.ts` builds a TypeScript program over this file against
 * the real `lib.dom.d.ts` and asserts it produces zero diagnostics. That is what
 * proves the claim `application/dom-surface.ts` makes: a real `Document`,
 * `HTMLElement`, `HTMLCanvasElement` and `SVGElement` satisfy the renderer's
 * structural types WITHOUT A CAST.
 *
 * The claim is not obvious and it is not stable under a careless edit. Three of
 * the four shapes were written the natural way first and the natural way does
 * not compile:
 *
 *   - `appendChild` as a readonly function-typed PROPERTY (which is how
 *     mc-render writes `addEventListener`) makes `HTMLElement` unassignable:
 *     `strictFunctionTypes` compares its parameter contravariantly, so
 *     `DomNode` would have to be a SUBTYPE of `Node`, and a structural subset is
 *     by construction a supertype. Method syntax is bivariant and is the escape.
 *   - `appendChild(child: DomElement)` fails for a second reason: bivariance
 *     needs ONE direction to hold, and `DomElement` and `Node` are assignable in
 *     neither, because `Node` has no `setAttribute`. Hence `DomNode`.
 *   - `textContent: string` happens to compile against TypeScript 5.9's
 *     `lib.dom.d.ts`, which splits the accessor (`get(): string`,
 *     `set(value: string | null)`), and did NOT compile against older vintages
 *     that declared `textContent: string | null`. The union satisfies both.
 *
 * Nothing in an ordinary `pnpm typecheck` would notice a regression in the first
 * two: it would compile fine, and the first person to notice would be a browser
 * consumer, whose fix would be `as unknown as` — which is where the type safety
 * would actually be lost.
 *
 * Unlike mc-render's fixture, this one is ALSO included in `tsconfig.json` and
 * `tsconfig.test.json`, and that difference is not an oversight. mc-render must
 * exclude its copy because its projects have no `lib.DOM` and the file names DOM
 * types they cannot see. Every project here has `lib.DOM`
 * (`tsconfig.base.json`), so the file compiles in-project too — two gates
 * instead of one, at no cost. The test is still the authority, because it is the
 * gate that survives somebody deciding to narrow the lib.
 */
import {
  type DomAttributeTarget,
  type DomElement,
  type DomElementFactory,
  type DomNode,
  type DomStyle,
} from '../../application/dom-surface'

declare const browserDocument: Document
declare const browserElement: HTMLElement
declare const browserDiv: HTMLDivElement
declare const browserCanvas: HTMLCanvasElement
declare const browserSvg: SVGElement

/** `createElement` is the only thing a view needs from a document. */
export const documentMakesElements: DomElementFactory = browserDocument

/** The return of `createElement`, and the host-supplied mount root. */
export const elementIsWritable: DomElement = browserElement
export const divIsWritable: DomElement = browserDiv

/**
 * The canvas, for the colour-vision attribute — and it must satisfy the NARROW
 * target, not `DomElement`. `applyColorVision` is handed an element mx-ui does
 * not own.
 */
export const canvasCarriesAnAttribute: DomAttributeTarget = browserCanvas

/**
 * SVG too. mc-render owns the canvas and mx-ui does not get to assume what it
 * turns out to be; `SVGElement` carries `style` through `ElementCSSInlineStyle`
 * exactly as `HTMLElement` does.
 */
export const svgIsWritable: DomElement = browserSvg

/** The parent/child edge — COST 1 and COST 2 in `application/dom-surface.ts`. */
export const elementIsANode: DomNode = browserElement
export const styleIsWritable: DomStyle = browserElement.style

/**
 * The direction that actually bites: an element THIS repository built has to be
 * acceptable to a REAL `appendChild`, and a real element has to be acceptable to
 * the surface's.
 */
export const appendsBothWays = (built: DomElement): void => {
  browserDiv.appendChild(browserElement)
  built.appendChild(browserElement)
  browserElement.textContent = 'captions are text'
  built.style.setProperty('--mx-ui-heart', '#e02828')
  built.style.removeProperty('transition')
  built.setAttribute('data-color-vision', 'deuteranopia')
  built.removeAttribute('hidden')
}

/** A real element is a legal mount root for a real view. */
export const realElementIsAMountRoot = (): DomElement => {
  const root: DomElement = browserDocument.createElement('div')
  return root
}
