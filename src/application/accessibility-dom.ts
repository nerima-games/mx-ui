import {
  type ColorVisionMode,
  type MotionPreference,
  type MotionSetting,
  colorVisionAttribute,
  decodeMotionSetting,
  resolveMotionPreference,
} from '../domain/accessibility.js'
import { Result, Schema } from 'effect'
import type { DomAttributeTarget } from './dom-surface.js'

/**
 * DOM projections for accessibility preferences.
 *
 * ---------------------------------------------------------------------------
 * The half that was missing
 * ---------------------------------------------------------------------------
 *
 * `domain/accessibility.ts` decides the colour-vision values and motion
 * preference. `color-vision-filters.ts` builds the SVG definitions and applies
 * them to a supplied canvas. The small attribute projection below remains
 * available to hosts that key their own CSS off the setting.
 *
 * The scope is the whole point. plan.md §3.13 says 「canvasのみに適用」 and
 * `domain/accessibility.ts` explains the failure it avoids: applying the
 * correction to the whole document also transforms UI chrome that was authored
 * with deliberate, already-accessible contrast, producing 「a HUD that is harder
 * to read than the one you started with, and text whose contrast ratio no longer
 * meets the standard it was designed to」.
 *
 * So `applyColorVision` takes a `DomAttributeTarget`, not a `DomElement`. That
 * attribute-only helper cannot build into, style or append to what it is given.
 * The filter controller has the narrower style write it needs and receives the
 * target explicitly; it never finds a canvas or applies a filter to UI chrome.
 *
 * ---------------------------------------------------------------------------
 * How the attribute helper relates to the filter
 * ---------------------------------------------------------------------------
 *
 * `color-vision-filters.ts` builds the `<filter><feColorMatrix values="…"/></filter>`
 * definitions from domain constants and appends them under the supplied mx-ui
 * root. This helper only projects the legacy data attribute; it does not create
 * or scope SVG filters itself.
 */

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

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)' as const

/** The change-listener surface shared by `MediaQueryList` and small test fakes. */
export type MotionMediaQuery = {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export type MotionPreferenceControllerFailure =
  | Schema.SchemaError
  | { readonly _tag: 'MotionPreferenceControllerDisposed' }

export type MotionPreferenceController = {
  readonly update: (setting: unknown) => Result.Result<MotionSetting, MotionPreferenceControllerFailure>
  readonly dispose: () => void
}

type MotionPreferenceState = {
  disposed: boolean
  setting: MotionSetting
}

type MotionPreferenceProjection = {
  readonly onChange: (preference: MotionPreference) => void
  readonly query: MotionMediaQuery
  readonly state: MotionPreferenceState
}

const projectMotionPreference = (
  projection: MotionPreferenceProjection,
): void => {
  projection.onChange(resolveMotionPreference(projection.state.setting, projection.query.matches))
}

const updateMotionSetting = (
  projection: MotionPreferenceProjection,
  input: unknown,
): Result.Result<MotionSetting, MotionPreferenceControllerFailure> => {
  const decoded = decodeMotionSetting(input)
  if (Result.isFailure(decoded)) {
    return decoded
  }
  if (projection.state.disposed) {
    return Result.fail({ _tag: 'MotionPreferenceControllerDisposed' })
  }

  projection.state.setting = decoded.success
  projectMotionPreference(projection)
  return decoded
}

const disposeMotionPreference = (
  projection: MotionPreferenceProjection,
  onSystemChange: () => void,
): void => {
  if (projection.state.disposed) {
    return
  }
  projection.state.disposed = true
  projection.query.removeEventListener('change', onSystemChange)
}

const makeMotionPreferenceController = (
  query: MotionMediaQuery,
  initialSetting: MotionSetting,
  onChange: (preference: MotionPreference) => void,
): MotionPreferenceController => {
  const projection: MotionPreferenceProjection = {
    onChange,
    query,
    state: { disposed: false, setting: initialSetting },
  }
  const onSystemChange = (): void => {
    if (!projection.state.disposed && projection.state.setting === 'system') {
      projectMotionPreference(projection)
    }
  }
  const update = (input: unknown): Result.Result<MotionSetting, MotionPreferenceControllerFailure> =>
    updateMotionSetting(projection, input)
  const dispose = (): void => disposeMotionPreference(projection, onSystemChange)

  projectMotionPreference(projection)
  query.addEventListener('change', onSystemChange)
  return { dispose, update }
}

/**
 * Project a setting immediately and follow system changes while it is selected.
 * The owner creates the `MediaQueryList` and disposes this controller with its UI.
 */
export const createMotionPreferenceController = (
  query: MotionMediaQuery,
  initialSetting: unknown,
  onChange: (preference: MotionPreference) => void,
): Result.Result<MotionPreferenceController, Schema.SchemaError> => {
  const initial = decodeMotionSetting(initialSetting)
  if (Result.isFailure(initial)) {
    return Result.fail(initial.failure)
  }
  return Result.succeed(makeMotionPreferenceController(query, initial.success, onChange))
}
