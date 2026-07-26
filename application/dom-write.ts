/**
 * The only four ways this repository mutates a document — each of them a diff.
 *
 * ---------------------------------------------------------------------------
 * Why every write goes through a cell
 * ---------------------------------------------------------------------------
 *
 * plan.md §5.2 spends its whole section on per-frame allocation. `ui:hud-sync`
 * runs every frame; the HUD's inputs change on a handful of them. A renderer
 * that rebuilds its element tree, or that reassigns `textContent` to the string
 * it already holds, spends the frame path on work with no observable effect —
 * and `textContent = x` is not free even when `x` is unchanged: it destroys and
 * recreates a text node, which invalidates layout.
 *
 * So a "cell" is an element member plus THE VALUE LAST WRITTEN TO IT. Writing is
 * a comparison first. The consequence the tests pin is stronger than "cheap":
 * **a re-render with an unchanged view model performs zero mutations**, which is
 * an assertion a fake document can make exactly, rather than a claim about
 * milliseconds that would depend on the machine.
 *
 * The previous value is kept HERE rather than read back from the element, for
 * three reasons: reading forces layout in a real browser, `getAttribute` and
 * `getPropertyValue` would have to enter `application/dom-surface.ts` (widening
 * the surface for no other purpose), and a value written by mx-ui and a value
 * read back after the browser normalised it are not the same string.
 *
 * ---------------------------------------------------------------------------
 * Allocation
 * ---------------------------------------------------------------------------
 *
 * Cells are created at mount and never again. Nothing below allocates: no
 * closure, no array, no template literal, no object. The one place a string is
 * built per render is a percentage (`${n}%`), which is why `writePercent` takes
 * the NUMBER and compares numbers — the string is built only on the frames where
 * the number actually moved.
 */
import type { DomElement, DomStyle } from './dom-surface'

/**
 * A text sink.
 *
 * `previous` starts as the empty string because a freshly created element's
 * `textContent` is the empty string, so the first `writeText(cell, '')` is
 * correctly a no-op rather than a redundant write.
 */
export type TextCell = {
  readonly element: DomElement
  previous: string
}

export const textCell = (element: DomElement): TextCell => ({ element, previous: '' })

export const writeText = (cell: TextCell, text: string): void => {
  if (cell.previous === text) {
    return
  }
  cell.previous = text
  cell.element.textContent = text
}

/**
 * One CSS property on one element.
 *
 * `previous` starts as the empty string, which is also what
 * `getPropertyValue` returns for a property that was never set — so writing the
 * empty string is a no-op and `removeProperty` is reached only by `clearStyle`.
 */
export type StyleCell = {
  readonly style: DomStyle
  readonly property: string
  previous: string
}

export const styleCell = (element: DomElement, property: string): StyleCell => ({
  style: element.style,
  property,
  previous: '',
})

export const writeStyle = (cell: StyleCell, value: string): void => {
  if (cell.previous === value) {
    return
  }
  cell.previous = value
  cell.style.setProperty(cell.property, value)
}

/**
 * Delete a property rather than blank it.
 *
 * This is what reduced motion needs. `animationDurationMs(400, 'reduced')` is
 * `0`, and the honest DOM expression of zero is NO `transition` declaration at
 * all: `transition: width 0ms` still installs a transition, still fires
 * `transitionend`, and still reads as an animation to anything inspecting the
 * computed style. `domain/accessibility.ts` says the setting exists for people
 * who get motion sick rather than for people who are impatient; a 0 ms
 * animation honours the second reading of that sentence and not the first.
 */
export const clearStyle = (cell: StyleCell): void => {
  if (cell.previous === '') {
    return
  }
  cell.previous = ''
  cell.style.removeProperty(cell.property)
}

/**
 * A percentage-valued property.
 *
 * Compares the NUMBER, so the `${n}%` string is allocated only on a frame where
 * the number moved. The HUD's XP bar and every durability bar go through here,
 * and on a typical frame none of them move.
 */
export type PercentCell = {
  readonly style: StyleCell
  previous: number
}

export const percentCell = (element: DomElement, property: string): PercentCell => ({
  style: styleCell(element, property),
  previous: Number.NaN,
})

export const writePercent = (cell: PercentCell, percent: number): void => {
  if (cell.previous === percent) {
    return
  }
  cell.previous = percent
  writeStyle(cell.style, `${String(percent)}%`)
}

/**
 * One attribute, present or absent.
 *
 * `undefined` means "remove it", which is the shape `colorVisionAttribute`
 * already returns for `off` — the two agree by construction, and a DOM layer
 * that leaves `data-color-vision="off"` behind is the bug that shape prevents.
 */
export type AttributeCell = {
  readonly element: DomElement
  readonly name: string
  previous: string | undefined
}

export const attributeCell = (element: DomElement, name: string): AttributeCell => ({
  element,
  name,
  previous: undefined,
})

export const writeAttribute = (cell: AttributeCell, value: string | undefined): void => {
  if (cell.previous === value) {
    return
  }
  cell.previous = value
  if (value === undefined) {
    cell.element.removeAttribute(cell.name)
    return
  }
  cell.element.setAttribute(cell.name, value)
}

/** `hidden` is an empty-valued boolean attribute; this is the only spelling used. */
export const writeHidden = (cell: AttributeCell, hidden: boolean): void => {
  writeAttribute(cell, hidden ? '' : undefined)
}
