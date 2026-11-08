import {
  COLOR_VISION_FILTER_COLOR_SPACE,
  COLOR_VISION_MODES,
  type ColorVisionCorrectionMode,
  type ColorVisionMode,
  colorVisionCorrectionMatrixValues,
  decodeColorVisionMode,
} from '../domain/accessibility.js'
import { Result, Schema } from 'effect'

const ZERO = 0
const ONE = 1
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg' as const
const COLOR_VISION_FILTER_ID_PREFIX = 'mx-ui-color-vision'

let nextFilterInstance = ZERO

export type ColorVisionFilterFailure =
  | Schema.SchemaError
  | { readonly _tag: 'ColorVisionFilterControllerDisposed' }

export type ColorVisionFilterController = {
  readonly apply: (mode: unknown) => Result.Result<ColorVisionMode, ColorVisionFilterFailure>
  readonly dispose: () => void
}

type FilterMode = ColorVisionCorrectionMode
type ColorVisionFilterIds = Readonly<Record<FilterMode, string>>

const isFilterMode = (mode: ColorVisionMode): mode is FilterMode => mode !== 'off'
const FILTER_MODES = COLOR_VISION_MODES.filter(isFilterMode)

const filterIdsForInstance = (instanceId: number): Record<FilterMode, string> => ({
  deuteranopia: `${COLOR_VISION_FILTER_ID_PREFIX}-${String(instanceId)}-deuteranopia`,
  protanopia: `${COLOR_VISION_FILTER_ID_PREFIX}-${String(instanceId)}-protanopia`,
  tritanopia: `${COLOR_VISION_FILTER_ID_PREFIX}-${String(instanceId)}-tritanopia`,
})

const hasFilterIdConflict = (document: Document, ids: ColorVisionFilterIds): boolean =>
  Object.values(ids).some((id) => document.getElementById(id) !== null)

const nextFilterIds = (): ColorVisionFilterIds => {
  nextFilterInstance += ONE
  return filterIdsForInstance(nextFilterInstance)
}

const allocateFilterIds = (document: Document): ColorVisionFilterIds => {
  let ids = nextFilterIds()
  while (hasFilterIdConflict(document, ids)) {
    ids = nextFilterIds()
  }
  return ids
}

const createFilterDefinition = (
  document: Document,
  mode: FilterMode,
  id: string,
): SVGFilterElement => {
  const filter = document.createElementNS(SVG_NAMESPACE, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('color-interpolation-filters', COLOR_VISION_FILTER_COLOR_SPACE)

  const matrix = document.createElementNS(SVG_NAMESPACE, 'feColorMatrix')
  matrix.setAttribute('type', 'matrix')
  matrix.setAttribute('values', colorVisionCorrectionMatrixValues(mode))
  filter.appendChild(matrix)
  return filter
}

const appendFilterDefinitions = (
  document: Document,
  definitions: SVGDefsElement,
  ids: ColorVisionFilterIds,
): void => {
  for (const mode of FILTER_MODES) {
    definitions.appendChild(createFilterDefinition(document, mode, ids[mode]))
  }
}

const createFilterDefinitions = (document: Document, ids: ColorVisionFilterIds): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-mx-ui', 'color-vision-filters')

  const definitions = document.createElementNS(SVG_NAMESPACE, 'defs')
  appendFilterDefinitions(document, definitions, ids)
  svg.appendChild(definitions)
  return svg
}

const restoreInlineFilter = (
  target: HTMLElement,
  originalValue: string,
  originalPriority: string,
): void => {
  if (originalValue.length === ZERO) {
    target.style.removeProperty('filter')
    return
  }
  target.style.setProperty('filter', originalValue, originalPriority)
}

type OriginalTargetState = {
  readonly filter: string
  readonly filterPriority: string
  readonly hadColorVisionAttribute: boolean
  readonly colorVisionAttribute: string | null
}

const captureOriginalTargetState = (target: HTMLElement): OriginalTargetState => ({
  colorVisionAttribute: target.getAttribute('data-color-vision'),
  filter: target.style.getPropertyValue('filter'),
  filterPriority: target.style.getPropertyPriority('filter'),
  hadColorVisionAttribute: target.hasAttribute('data-color-vision'),
})

const restoreOriginalAttribute = (
  target: HTMLElement,
  hadAttribute: boolean,
  originalAttribute: string | null,
): void => {
  if (hadAttribute && originalAttribute !== null) {
    target.setAttribute('data-color-vision', originalAttribute)
    return
  }
  target.removeAttribute('data-color-vision')
}

const restoreTargetState = (target: HTMLElement, original: OriginalTargetState): void => {
  restoreInlineFilter(target, original.filter, original.filterPriority)
  restoreOriginalAttribute(target, original.hadColorVisionAttribute, original.colorVisionAttribute)
}

type ColorVisionFilterState = {
  disposed: boolean
  readonly ids: ColorVisionFilterIds
  readonly original: OriginalTargetState
  readonly svg: SVGSVGElement
  readonly target: HTMLElement
}

const cssFilterValue = (id: string, original: string): string => {
  const baseFilter = original.trim()
  if (baseFilter.length === ZERO || baseFilter === 'none') {
    return `url(#${id})`
  }
  return `url(#${id}) ${baseFilter}`
}

const applyColorVisionCorrection = (state: ColorVisionFilterState, mode: FilterMode): void => {
  state.target.style.setProperty(
    'filter',
    cssFilterValue(state.ids[mode], state.original.filter),
    state.original.filterPriority,
  )
  state.target.setAttribute('data-color-vision', mode)
}

const validateColorVisionMode = (
  state: ColorVisionFilterState,
  input: unknown,
): Result.Result<ColorVisionMode, ColorVisionFilterFailure> => {
  const decoded = decodeColorVisionMode(input)
  if (Result.isFailure(decoded)) {
    return decoded
  }
  if (state.disposed) {
    return Result.fail({ _tag: 'ColorVisionFilterControllerDisposed' })
  }
  return decoded
}

const applyColorVisionMode = (
  state: ColorVisionFilterState,
  input: unknown,
): Result.Result<ColorVisionMode, ColorVisionFilterFailure> => {
  const result = validateColorVisionMode(state, input)
  if (Result.isFailure(result)) {
    return result
  }

  const mode = result.success
  if (mode === 'off') {
    restoreTargetState(state.target, state.original)
    return Result.succeed(mode)
  }

  applyColorVisionCorrection(state, mode)
  return Result.succeed(mode)
}

const disposeColorVisionController = (state: ColorVisionFilterState): void => {
  if (state.disposed) {
    return
  }
  state.disposed = true
  restoreTargetState(state.target, state.original)
  state.svg.remove()
}

const appendFilterTree = (root: HTMLElement): { readonly ids: ColorVisionFilterIds; readonly svg: SVGSVGElement } => {
  const ids = allocateFilterIds(root.ownerDocument)
  const svg = createFilterDefinitions(root.ownerDocument, ids)
  root.appendChild(svg)
  return { ids, svg }
}

/**
 * Build per-instance SVG filters and apply them only to the supplied canvas.
 * The caller owns both elements and should dispose the controller with its UI.
 */
export const createColorVisionFilterController = (
  root: HTMLElement,
  target: HTMLElement,
): ColorVisionFilterController => {
  const filterTree = appendFilterTree(root)
  const state: ColorVisionFilterState = {
    disposed: false,
    ids: filterTree.ids,
    original: captureOriginalTargetState(target),
    svg: filterTree.svg,
    target,
  }
  return {
    apply: (input) => applyColorVisionMode(state, input),
    dispose: () => disposeColorVisionController(state),
  }
}
