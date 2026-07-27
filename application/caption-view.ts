/**
 * Sound captions, as text.
 *
 * plan.md §3.13 lists サウンド字幕 among the four accessibility assets, and the
 * word that matters is TEXT. A caption drawn on the canvas is a caption a screen
 * reader cannot read and a translation layer cannot touch; `textContent` on a
 * real element is the whole point of mx-ui owning this rather than mc-render.
 *
 * `domain/caption.ts` already decided everything except where the pixels go: the
 * queue is bounded at `MAX_VISIBLE_CAPTIONS`, the arrow is chosen, the fade is a
 * number in 0–1. So the line elements are allocated ONCE, at exactly that bound,
 * and shown or hidden — a caption stream during combat never allocates.
 *
 * ---------------------------------------------------------------------------
 * The fade, and reduced motion
 * ---------------------------------------------------------------------------
 *
 * `domain/caption.ts` on `freshness`: 「Note that the fade is a PRESENTATION
 * property and must be suppressed under reduced motion — see
 * `domain/accessibility.ts`; the DOM layer is responsible for asking」. This is
 * the layer, and it asks. Under `reduced` every visible line is fully opaque:
 * a caption that fades is a caption that is hardest to read at the moment it is
 * about to disappear, which for a player reading captions instead of hearing
 * sounds is the wrong trade twice over.
 *
 * `shouldAnimate` is the predicate rather than `animationDurationMs`, because
 * the fade is not a duration — it is a value per frame — and
 * `domain/accessibility.ts` provides exactly that distinction: 「Whether a purely
 * decorative animation should run at all」.
 */
import { shouldAnimate, type MotionPreference } from '../domain/accessibility'
import { MAX_VISIBLE_CAPTIONS, type CaptionLineView } from '../domain/caption'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  styleCell,
  textCell,
  writeHidden,
  writeStyle,
  writeText,
  type AttributeCell,
  type StyleCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'

/** Below this a line would be unreadable; the queue expires it before then anyway. */
const MIN_OPACITY = 0.15

type CaptionLineElement = {
  readonly hidden: AttributeCell
  readonly arrow: TextCell
  readonly text: TextCell
  readonly opacity: StyleCell
}

export type CaptionView = {
  readonly root: DomElement
  readonly render: (lines: ReadonlyArray<CaptionLineView>) => void
  readonly setMotion: (motion: MotionPreference) => void
}

const createLine = (factory: DomElementFactory, parent: DomElement): CaptionLineElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'caption-line')
  root.setAttribute('hidden', '')
  // A caption sits on the scrim, which is the surface G1 is stated against.
  root.style.setProperty('background-color', PALETTE_VAR.scrim)
  parent.appendChild(root)

  const arrow = factory.createElement('span')
  arrow.setAttribute('data-mx-ui', 'caption-arrow')
  // INK_MUTED, not INK: the arrow is secondary to the words, and both are
  // guarded text tokens, so the demotion costs no legibility.
  arrow.style.setProperty('color', PALETTE_VAR.inkMuted)
  root.appendChild(arrow)

  const text = factory.createElement('span')
  text.setAttribute('data-mx-ui', 'caption-text')
  text.style.setProperty('color', PALETTE_VAR.ink)
  root.appendChild(text)

  const line: CaptionLineElement = {
    hidden: attributeCell(root, 'hidden'),
    arrow: textCell(arrow),
    text: textCell(text),
    opacity: styleCell(root, 'opacity'),
  }
  line.hidden.previous = ''
  return line
}

export const createCaptionView = (
  factory: DomElementFactory,
  parent: DomElement,
  motion: MotionPreference,
): CaptionView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'captions')
  // Captions may be mounted apart from the HUD — they outlive a closed screen —
  // so this root declares the palette for its own subtree rather than relying on
  // inheriting from somebody else's.
  declarePalette(root)
  // A live region is the one accessibility affordance that is markup rather than
  // colour: a caption that appears silently is invisible to a screen reader even
  // though it is text. `polite` rather than `assertive` — captions are a stream.
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  parent.appendChild(root)

  const lines: Array<CaptionLineElement> = []
  for (let index = 0; index < MAX_VISIBLE_CAPTIONS; index += 1) {
    lines.push(createLine(factory, root))
  }

  let fades = shouldAnimate(motion)
  let latest: ReadonlyArray<CaptionLineView> = []

  const project = (): void => {
    // OVER THE ARRAY, not over its length with an indexed read. The two say the
    // same thing, and the indexed spelling needed an `if (line === undefined)`
    // arm that no iteration can reach — `noUncheckedIndexedAccess` types the
    // read `| undefined` however the index was bounded. `latest` keeps its
    // indexed read because it is a DIFFERENT array and may genuinely be short;
    // that arm is the one below, and it does real work.
    for (const [index, line] of lines.entries()) {
      const view = latest[index]
      if (view === undefined) {
        writeHidden(line.hidden, true)
        continue
      }
      writeHidden(line.hidden, false)
      writeText(line.arrow, view.arrow ?? '')
      writeText(line.text, view.text)
      const opacity = fades ? Math.max(MIN_OPACITY, view.freshness) : 1
      writeStyle(line.opacity, String(opacity))
    }
  }

  return {
    root,
    render: (next: ReadonlyArray<CaptionLineView>): void => {
      latest = next
      project()
    },
    setMotion: (next: MotionPreference): void => {
      const wanted = shouldAnimate(next)
      if (wanted === fades) {
        return
      }
      fades = wanted
      project()
    },
  }
}
