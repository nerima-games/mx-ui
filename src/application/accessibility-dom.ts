/**
 * The colour-vision switch, applied — to the canvas and to nothing else.
 *
 * ---------------------------------------------------------------------------
 * The half that was missing
 * ---------------------------------------------------------------------------
 *
 * DN-UI-1a splits the daltonisation asset in two: `domain/accessibility.ts`
 * decides the VALUES (the attribute string, and the twenty numbers behind it),
 * and a DOM layer decides the SCOPE. There was no DOM layer, so
 * `COLOR_VISION_FILTER_TARGET = 'canvas'` was a constant nobody consumed. This
 * file consumes it.
 *
 * The scope is the whole point. plan.md §3.13 says 「canvasのみに適用」 and
 * `domain/accessibility.ts` explains the failure it avoids: applying the
 * correction to the whole document also transforms UI chrome that was authored
 * with deliberate, already-accessible contrast, producing 「a HUD that is harder
 * to read than the one you started with, and text whose contrast ratio no longer
 * meets the standard it was designed to」.
 *
 * So `applyColorVision` takes a `DomAttributeTarget`, not a `DomElement`. It can
 * set an attribute and it cannot build into, style or append to what it is
 * given, because mc-render owns that element (plan.md §3.9). And it is the only
 * function in `application/` that touches an element mx-ui did not create.
 *
 * ---------------------------------------------------------------------------
 * What is NOT here: the filter itself
 * ---------------------------------------------------------------------------
 *
 * The `<filter><feColorMatrix values="…"/></filter>` is not built by this file,
 * and that is the same split the reference made
 * (`packages/presentation/hud/color-vision.ts:1-3`: 「the actual filters …live in
 * index.html; this just flips the body data attribute the CSS rules key on」).
 * `colorVisionMatrixValues(mode)` produces the twenty numbers, and
 * `COLOR_VISION_FILTER_COLOR_SPACE` produces the one word that separates a
 * correction from a washed-out scene. Both are exported from `domain/`; the host
 * page installs them. Building SVG here would need `createElementNS` in
 * `application/dom-surface.ts` and would put mx-ui in charge of a defs block
 * inside a document it does not own.
 */
import { type ColorVisionMode, colorVisionAttribute } from '../domain/accessibility.js'
import type { DomAttributeTarget } from './dom-surface.js'

/**
 * The attribute name, matching the reference's
 * (`packages/presentation/hud/color-vision.ts`).
 *
 * On the CANVAS here rather than on `<body>`, which is a deliberate narrowing of
 * the reference's arrangement rather than a copy of it. The reference put the
 * hook on `<body>` and relied on a CSS selector to keep the filter off the HUD;
 * that works, and it also means the correct scope is one selector away from
 * being widened by somebody who does not know why it is narrow. Putting the hook
 * on the element the filter applies to makes the scope structural.
 *
 * `application/palette-css.ts` depends on this choice: the palette's custom
 * properties are declared on mx-ui's own root precisely so that this attribute
 * and those tokens never share a scope.
 */
export const COLOR_VISION_ATTRIBUTE = 'data-color-vision'

/**
 * A canvas plus the last mode written to it.
 *
 * Same diffing discipline as `application/dom-write.ts`, for a different reason:
 * this is not on the frame path, but flipping an attribute that drives an SVG
 * filter forces the compositor to re-run it, so writing the mode it already has
 * is a whole-canvas repaint for nothing.
 */
export type ColorVisionCell = {
  readonly target: DomAttributeTarget
  previous?: string
  applied: boolean
}

export const colorVisionCell = (target: DomAttributeTarget): ColorVisionCell => ({
  applied: false,
  target,
})

/**
 * Set or remove the attribute.
 *
 * `off` REMOVES it rather than writing `"off"`, because that is what
 * `colorVisionAttribute` returns and the two agreeing by construction is the
 * point of that function's shape: 「a DOM layer that removes the attribute and
 * leaves a filter behind — or the reverse — is the bug this shape prevents」.
 *
 * `applied` distinguishes "never written" from "written as absent", so the first
 * call with `off` on a fresh canvas does not issue a pointless `removeAttribute`
 * and every later call is a comparison.
 */
export const applyColorVision = (cell: ColorVisionCell, mode: ColorVisionMode): void => {
  const value = colorVisionAttribute(mode)
  if (cell.applied && cell.previous === value) {
    return
  }
  cell.applied = true
  if (typeof value === 'undefined') {
    delete cell.previous
    cell.target.removeAttribute(COLOR_VISION_ATTRIBUTE)
    return
  }
  cell.previous = value
  cell.target.setAttribute(COLOR_VISION_ATTRIBUTE, value)
}
