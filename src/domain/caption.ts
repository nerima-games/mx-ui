/** Project owner caption events into UI-ready caption lines. */

import {
  CAPTION_DISPLAY_SECS,
  type CaptionEvent,
  visibleCaptions,
} from '@nerima-games/mc-audio'

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
export const captionLines = (
  events: ReadonlyArray<CaptionEvent>,
  nowSecs: Parameters<typeof visibleCaptions>[typeof VISIBLE_CAPTIONS_NOW_ARGUMENT_INDEX],
): ReadonlyArray<CaptionLineView> =>
  visibleCaptions(events, nowSecs).map((event) => ({
    arrow: captionArrow(event.pan),
    freshness: captionFreshness(nowSecs, event.atSecs),
    text: event.text,
  }))
