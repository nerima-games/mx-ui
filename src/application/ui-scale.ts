import type { DomStyle } from './dom-surface.js'
import { Result } from 'effect'
import { decodeUiScale } from '../domain/accessibility.js'

export const UI_SCALE_PROPERTY = 'zoom' as const

/** Applies a validated UI scale to an mx-ui-owned style declaration. */
export const applyUiScale = (
  style: DomStyle,
  input: unknown,
): ReturnType<typeof decodeUiScale> => {
  const decoded = decodeUiScale(input)
  if (Result.isFailure(decoded)) {
    return decoded
  }

  style.setProperty(UI_SCALE_PROPERTY, String(decoded.success))
  return decoded
}
