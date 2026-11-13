/** Project owner caption events into UI-ready caption lines. */

import {
  CAPTION_REASONS,
  CAPTION_DISPLAY_SECS,
  type CaptionEvent,
  visibleCaptions,
} from '@nerima-games/mc-audio'
import { Result } from 'effect'

export {
  CAPTION_DISPLAY_SECS,
  MAX_VISIBLE_CAPTIONS,
  CAPTION_DISPLAY_SECS as CAPTION_LIFETIME_SECS,
} from '@nerima-games/mc-audio'
export type { CaptionEvent } from '@nerima-games/mc-audio'

export type CaptionLineView = {
  readonly text: string
  readonly arrow: '←' | '→' | undefined
  readonly freshness: number
}

const ZERO = 0
const ONE = 1
const VISIBLE_CAPTIONS_NOW_ARGUMENT_INDEX = 1

type InvalidCaptionLinesInput = Readonly<{
  readonly _tag: 'InvalidCaptionLinesInput'
  readonly field: 'events' | 'events.pan' | 'nowSecs'
}>

const isCaptionEvent = (input: unknown): input is CaptionEvent => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const cueId = Reflect.get(input, 'cueId')
  const text = Reflect.get(input, 'text')
  const atSecs = Reflect.get(input, 'atSecs')
  const reason = Reflect.get(input, 'reason')
  const pan = Reflect.get(input, 'pan')
  return typeof cueId === 'string' &&
    typeof text === 'string' &&
    typeof atSecs === 'number' && Number.isFinite(atSecs) &&
    CAPTION_REASONS.some((candidate) => candidate === reason) &&
    (typeof pan === 'undefined' || (typeof pan === 'number' && Number.isFinite(pan)))
}

const invalidCaptionLinesInput = (field: InvalidCaptionLinesInput['field']) =>
  Result.fail({ _tag: 'InvalidCaptionLinesInput' as const, field })

const captionArrow = (pan: CaptionEvent['pan']): CaptionLineView['arrow'] => {
  if (typeof pan === 'undefined' || pan === ZERO) {
    return
  }
  if (pan < ZERO) {
    return '←'
  }
  return '→'
}

const captionFreshness = (nowSecs: number, atSecs: number): number =>
  Math.max(ZERO, Math.min(ONE, ONE - (nowSecs - atSecs) / CAPTION_DISPLAY_SECS))

/** Filter with mc-audio's caption policy, then project each line for rendering. */
export function captionLines(
  events: ReadonlyArray<CaptionEvent>,
  nowSecs: Parameters<typeof visibleCaptions>[typeof VISIBLE_CAPTIONS_NOW_ARGUMENT_INDEX],
): ReadonlyArray<CaptionLineView>
export function captionLines(
  events: unknown,
  nowSecs: Parameters<typeof visibleCaptions>[typeof VISIBLE_CAPTIONS_NOW_ARGUMENT_INDEX],
): Result.Result<ReadonlyArray<CaptionLineView>, InvalidCaptionLinesInput>
export function captionLines(
  input: unknown,
  nowSecs: Parameters<typeof visibleCaptions>[typeof VISIBLE_CAPTIONS_NOW_ARGUMENT_INDEX],
): ReadonlyArray<CaptionLineView> | Result.Result<ReadonlyArray<CaptionLineView>, InvalidCaptionLinesInput> {
  if (typeof nowSecs !== 'number' || !Number.isFinite(nowSecs)) {
    return invalidCaptionLinesInput('nowSecs')
  }
  if (!Array.isArray(input)) {
    return invalidCaptionLinesInput('events')
  }
  const events: Array<CaptionEvent> = []
  for (const event of input) {
    if (!isCaptionEvent(event)) {
      return invalidCaptionLinesInput('events.pan')
    }
    events.push(event)
  }
  return visibleCaptions(events, nowSecs).map((event) => ({
    arrow: captionArrow(event.pan),
    freshness: captionFreshness(nowSecs, event.atSecs),
    text: event.text,
  }))
}
