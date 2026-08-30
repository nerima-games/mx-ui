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
import {
  type AttributeCell,
  type StyleCell,
  type TextCell,
  attributeCell,
  styleCell,
  textCell,
  writeHidden,
  writeStyle,
  writeText,
} from './dom-write.js'
import { type CaptionLineView, MAX_VISIBLE_CAPTIONS } from '../domain/caption.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { type MotionPreference, shouldAnimate } from '../domain/accessibility.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'

/** Below this a line would be unreadable; the queue expires it before then anyway. */
const MIN_OPACITY = 0.15
/** A caption line at full brightness — the state reduced motion holds every line at. */
const FULL_OPACITY = 1
/** The queue index step: one line element per queue slot. */
const INDEX_INCREMENT = 1

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

const createCaptionArrow = (factory: DomElementFactory, parent: DomElement): TextCell => {
  const arrow = factory.createElement('span')
  arrow.setAttribute('data-mx-ui', 'caption-arrow')
  // INK_MUTED, not INK: the arrow is secondary to the words, and both are
  // Guarded text tokens, so the demotion costs no legibility.
  arrow.style.setProperty('color', PALETTE_VAR.inkMuted)
  parent.appendChild(arrow)
  return textCell(arrow)
}

const createCaptionText = (factory: DomElementFactory, parent: DomElement): TextCell => {
  const text = factory.createElement('span')
  text.setAttribute('data-mx-ui', 'caption-text')
  text.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(text)
  return textCell(text)
}

const createLine = (factory: DomElementFactory, parent: DomElement): CaptionLineElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'caption-line')
  root.setAttribute('hidden', '')
  // A caption sits on the scrim, which is the surface G1 is stated against.
  root.style.setProperty('background-color', PALETTE_VAR.scrim)
  parent.appendChild(root)

  const arrow = createCaptionArrow(factory, root)
  const text = createCaptionText(factory, root)

  const line: CaptionLineElement = {
    arrow,
    hidden: attributeCell(root, 'hidden'),
    opacity: styleCell(root, 'opacity'),
    text,
  }
  line.hidden.previous = ''
  return line
}

const createCaptionsRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'captions')
  // Captions may be mounted apart from the HUD — they outlive a closed screen —
  // So this root declares the palette for its own subtree rather than relying on
  // Inheriting from somebody else's.
  declarePalette(root)
  // A live region is the one accessibility affordance that is markup rather than
  // Colour: a caption that appears silently is invisible to a screen reader even
  // Though it is text. `polite` rather than `assertive` — captions are a stream.
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  parent.appendChild(root)
  return root
}

const createCaptionLines = (
  factory: DomElementFactory,
  root: DomElement,
): Array<CaptionLineElement> => {
  const lines: Array<CaptionLineElement> = []
  for (let index = 0; index < MAX_VISIBLE_CAPTIONS; index += INDEX_INCREMENT) {
    lines.push(createLine(factory, root))
  }
  return lines
}

const captionOpacity = (fades: boolean, freshness: number): number => {
  if (fades) {
    return Math.max(MIN_OPACITY, freshness)
  }
  return FULL_OPACITY
}

const projectLine = (line: CaptionLineElement, view: CaptionLineView, fades: boolean): void => {
  writeHidden(line.hidden, false)
  writeText(line.arrow, view.arrow ?? '')
  writeText(line.text, view.text)
  writeStyle(line.opacity, String(captionOpacity(fades, view.freshness)))
}

export const createCaptionView = (
  factory: DomElementFactory,
  parent: DomElement,
  motion: MotionPreference,
): CaptionView => {
  const root = createCaptionsRoot(factory, parent)
  const lines = createCaptionLines(factory, root)

  let fades = shouldAnimate(motion)
  let latest: ReadonlyArray<CaptionLineView> = []

  const project = (): void => {
    // OVER THE ARRAY, not over its length with an indexed read. The two say the
    // Same thing, and the indexed spelling needed an `if (line === undefined)`
    // Arm that no iteration can reach — `noUncheckedIndexedAccess` types the
    // Read `| undefined` however the index was bounded. `latest` keeps its
    // Indexed read because it is a DIFFERENT array and may genuinely be short;
    // That arm is the one below, and it does real work.
    for (const [index, line] of lines.entries()) {
      const view = latest[index]
      if (typeof view === 'undefined') {
        writeHidden(line.hidden, true)
      } else {
        projectLine(line, view, fades)
      }
    }
  }

  return {
    render: (next: ReadonlyArray<CaptionLineView>): void => {
      latest = next
      project()
    },
    root,
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
