/**
 * The caption display.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * Why this screen is worth having in a terminal
 * ---------------------------------------------------------------------------
 *
 * Everything a caption does is a function of TIME, and the module was written so
 * that time is a parameter (`domain/caption.ts`). So the preview owns the
 * clock and can step it: a caption's 2.5-second life can be walked through in
 * quarter-second increments, and the freshness value that becomes an opacity in
 * the browser is printed as a number here.
 *
 * A browser preview would show the fade and hide the number. This one shows the
 * number and cannot show the fade. For an event list whose visible projection
 * depends on "which entries exist, and how old is each", the number is the part under test.
 *
 * ---------------------------------------------------------------------------
 * Reduced motion is applied HERE, and that is the point
 * ---------------------------------------------------------------------------
 *
 * `captionLines` returns `freshness` and says plainly that fading is a
 * PRESENTATION property which must be suppressed under reduced motion —
 * 「the DOM layer is responsible for asking」 (`domain/caption.ts:131-137`). This
 * renderer is a DOM layer for the purposes of that sentence, so it asks
 * `shouldAnimate` before letting freshness affect anything, and shows both
 * values so you can see the ask happening.
 */
import { animationDurationMs, shouldAnimate, type MotionPreference } from '../../src/domain/accessibility'
import {
  captionLines,
  CAPTION_LIFETIME_SECS,
  MAX_VISIBLE_CAPTIONS,
  type CaptionEvent,
} from '../../src/domain/caption'
import { captionAtTime, type PreviewCaptionSettings } from './state'
import { mix, padEnd, type Style } from './ansi'
import { FAINT, GOOD, INK, MUTED, WARN } from './palette'

/** The base duration a caption's fade would use, for `animationDurationMs`. */
export const CAPTION_FADE_MS = 240

export const renderCaptions = (
  style: Style,
  events: ReadonlyArray<CaptionEvent>,
  settings: PreviewCaptionSettings,
  nowSecs: number,
  motion: MotionPreference,
): ReadonlyArray<string> => {
  const lines = captionLines(events, captionAtTime(nowSecs))
  const animate = shouldAnimate(motion)
  const fadeMs = animationDurationMs(CAPTION_FADE_MS, motion)

  const body =
    lines.length === 0
      ? [style.dim('  (no captions on screen)')]
      : lines.map((line) => {
          // Freshness becomes an opacity in the browser. Here it becomes a
          // colour ramp — and ONLY when motion is full, because a fade is a fade
          // whichever property carries it.
          const color = animate ? mix(FAINT, INK, line.freshness) : INK
          const arrow = line.arrow ?? ' '
          return `  ${style.paint(arrow, MUTED)} ${style.paint(padEnd(line.text, 28), color)}${style.dim(
            `freshness ${line.freshness.toFixed(2)}${animate ? '' : '  (fade suppressed)'}`,
          )}`
        })

  return [
    style.bold('captions'),
    '',
    ...body,
    '',
    style.dim(`  ${String(lines.length)}/${String(MAX_VISIBLE_CAPTIONS)} visible, lifetime ${String(CAPTION_LIFETIME_SECS)}s, t = ${nowSecs.toFixed(2)}s`),
    style.dim(`  fade duration under ${motion} motion: ${String(fadeMs)}ms  (base ${String(CAPTION_FADE_MS)}ms)`),
    '',
    `  ${style.paint('captionsEnabled', MUTED)} ${style.paint(String(settings.captionsEnabled), settings.captionsEnabled ? GOOD : WARN)}   ${style.dim('the player’s choice — this one gates')}`,
    `  ${style.paint('audioUnlocked  ', MUTED)} ${style.paint(String(settings.audioUnlocked), INK)}   ${style.dim('deliberately not read when events are appended')}`,
    '',
    style.dim('  plan.md §3.6: captions fire BEFORE the audio gate. A deaf player who has not clicked'),
    style.dim('  anything yet, or who has muted the game, must still see them. Press u and watch nothing'),
    style.dim('  happen — that is the rule holding.'),
  ]
}
