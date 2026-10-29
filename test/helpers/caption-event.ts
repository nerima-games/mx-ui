import { AudioCaptionText, AudioPan, SoundCueId, type CaptionEvent } from '@nerima-games/mc-audio'
import { MonotonicTimeSecs } from '@nerima-games/mc-kernel'

const TEST_CUE_ID = SoundCueId('blockBreak')

export const captionTime = (seconds: number): CaptionEvent['atSecs'] =>
  MonotonicTimeSecs(seconds)

export const captionEvent = (
  text: string,
  atSecs: number,
  pan: number | undefined,
  reason: CaptionEvent['reason'],
): CaptionEvent => ({
  cueId: TEST_CUE_ID,
  text: AudioCaptionText(text),
  atSecs: captionTime(atSecs),
  reason,
  ...(typeof pan === 'undefined' ? {} : { pan: AudioPan(pan) }),
})
