/** Project owner caption events into UI-ready caption lines. */

import {
  CAPTION_DISPLAY_SECS,
  visibleCaptions,
  type CaptionEvent,
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

const captionArrow = (pan: CaptionEvent['pan']): CaptionLineView['arrow'] => {
  if (typeof pan === 'undefined' || pan === 0) {
    return
  }
  return pan < 0 ? '←' : '→'
}

const captionFreshness = (nowSecs: number, atSecs: number): number =>
  Math.max(0, Math.min(1, 1 - (nowSecs - atSecs) / CAPTION_DISPLAY_SECS))

/** Filter with mc-audio's caption policy, then project each line for rendering. */
export const captionLines = (
  events: ReadonlyArray<CaptionEvent>,
  nowSecs: Parameters<typeof visibleCaptions>[1],
): ReadonlyArray<CaptionLineView> =>
  visibleCaptions(events, nowSecs).map((event) => ({
    arrow: captionArrow(event.pan),
    freshness: captionFreshness(nowSecs, event.atSecs),
    text: event.text,
  }))
