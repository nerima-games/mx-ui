/**
 * The crosshair, as elements — and the only mx-ui mark with no panel behind it.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS FILE HAD TO SOLVE FIRST
 * ---------------------------------------------------------------------------
 *
 * `domain/palette.ts` states G1 「against mx-ui's OWN surfaces only」 and then
 * states, in as many words, what is NOT covered:
 *
 *   Anything drawn directly over the rendered scene… a glyph over an arbitrary
 *   world pixel has no contrast floor and mx-ui does not claim one. That is why
 *   `SCRIM` is a token and not a decoration: it is the mechanism by which the
 *   claim above is made honourable, and content that leaves it leaves the
 *   guarantee with it.
 *
 * Every other screen in this repository sits on a scrim or on a `SURFACE`. A
 * reticle cannot: a scrim panel behind it is a grey box in the middle of the
 * screen. So the crosshair is the one mark that leaves the guarantee — unless it
 * takes the guarantee WITH IT, which is what this file does.
 *
 * ---------------------------------------------------------------------------
 * The reference's answer, and why it fails in the middle of the range
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/packages/presentation/hud/crosshair.ts:19-20` gives the
 * reticle `mix-blend-mode: difference` over a `drop-shadow`, and
 * `crosshair.test.ts:296` — 「should protect crosshair contrast against bright and
 * dark backgrounds」 — asserts that those two properties are present. **The test
 * checks that the mechanism was spelled, not that it works, and the two
 * backgrounds it names in its own title are the two it is safe at.**
 *
 * `difference` composites to `|backdrop - source|`. Against a MID-GREY world
 * pixel the white arms land on top of a nearly identical grey:
 *
 *   | world pixel | arms vs world | halo vs world |
 *   | ----------- | ------------- | ------------- |
 *   | 96          | 2.38:1        | 1.00:1        |
 *   | 128         | **1.01:1**    | **1.00:1**    |
 *   | 160         | 2.44:1        | 1.00:1        |
 *
 * At 128 the arms are invisible, and so is the halo — the `filter` runs before
 * the blend, so the black shadow is differenced too and comes back as the
 * backdrop. Stone, water, and almost everything at dusk sit in that band. This is
 * the second defect this palette's arithmetic has found in the reference, after
 * the autosave pair in `domain/save-status.ts`, and it is found the same way: by
 * measuring the case nobody thought to name.
 *
 * ---------------------------------------------------------------------------
 * What this file does instead — and it needs NO new token
 * ---------------------------------------------------------------------------
 *
 * The arms are `INK` and they carry their own halo of `SCRIM`. That is not a new
 * mechanism; it is the mechanism `domain/palette.ts` already names, applied at
 * the size of a reticle instead of the size of a panel. The consequence is that
 * the crosshair's floor is a number the survey ALREADY measures and the tests
 * already pin: `worstCaseContrastOnScrim(INK)`, which is **13.34:1** over the
 * worst world pixel there is, against a 3:1 icon floor.
 *
 * So no token was added, no contrast measurement was invented, and the screen is
 * inside G1 rather than beside it. The reference's own instinct was right — its
 * `drop-shadow(0 0 2px rgba(0, 0, 0, 0.9))` is a scrim halo, and `rgba(0,0,0,.9)`
 * is `SCRIM` to within three channels. What breaks it is the blend mode layered
 * on top, which takes the halo away again.
 *
 * ---------------------------------------------------------------------------
 * The hit marker carries WEIGHT, not only motion
 * ---------------------------------------------------------------------------
 *
 * The reference's `pulse()` scales the reticle to 1.45 and recolours its shadow.
 * A scale is a decorative animation, so `domain/accessibility.ts` requires it to
 * be suppressed under reduced motion — and suppressing it there would leave that
 * player with NO hit feedback at all, which is the same shape of mistake as the
 * reference's frozen loading bar (`application/loading-view.ts`): the accessible
 * path silently loses information instead of carrying it differently.
 *
 * So a hit is a heavier mark ALWAYS, and additionally a scale when motion is
 * allowed. `weight` is a declared `Distinguisher` in `domain/palette.ts` and is
 * already how `application/slot-element.ts` separates a selected slot from an
 * unselected one. Nobody loses the signal; some people also get the animation.
 *
 * ---------------------------------------------------------------------------
 * What is NOT here
 * ---------------------------------------------------------------------------
 *
 * No listener and no timer — the hit's duration is arithmetic in
 * `domain/crosshair.ts` (DN-UI-10, DN-UI-4).
 *
 * **`DomOperationsService` is not carried over.** The reference's crosshair file
 * also exports a generic DOM facade that its trading, settings-overlay and
 * inventory renderers import. That is a second, unrelated job that happens to
 * live in the same file; `application/dom-surface.ts` is this repository's answer
 * to it and was written first.
 *
 * **Centring is not verified here.** `left: 50%` with a `-50%` translate is
 * written below, but whether the result lands on the camera's principal point is
 * layout, and layout needs a browser. `docs/e2e-triage.md` keeps that half in
 * mc-compose, with the rest of `HUD remains usable at ${width}px`.
 */
import { shouldAnimate, type MotionPreference } from '../domain/accessibility'
import type { CrosshairViewModel } from '../domain/crosshair'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  clearStyle,
  percentCell,
  styleCell,
  writeAttribute,
  writeHidden,
  writePercent,
  writeStyle,
  type AttributeCell,
  type PercentCell,
  type StyleCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'

/** The reticle's box, in CSS pixels. `crosshair.ts:15-16` (`width/height: 20px`). */
export const CROSSHAIR_SIZE = '20px'

/**
 * Arm thickness, resting and on a hit.
 *
 * The resting weight is the reference's (`crosshair.ts:70`, `width: 2px`). The
 * hit weight is the non-motion half of the hit marker — see the header — and it
 * is one step, the same step `application/slot-element.ts` uses between
 * `BORDER_WEIGHT` and `SELECTED_BORDER_WEIGHT`.
 */
export const CROSSHAIR_ARM_WEIGHT = '2px'
export const CROSSHAIR_ARM_HIT_WEIGHT = '4px'

/**
 * The halo, which is what keeps this mark inside the palette's guarantee.
 *
 * A hard ring rather than the reference's 2 px blur: a blurred halo's contrast
 * varies across its own width, so the number the survey measures would describe
 * only its centre. One opaque pixel of `SCRIM` is a surface, and
 * `worstCaseContrastOnScrim` is exact about surfaces.
 */
export const CROSSHAIR_HALO_WIDTH = '1px'

/** How far the reticle grows on a hit, when motion is allowed. `crosshair.ts:26`. */
export const CROSSHAIR_PULSE_SCALE = 1.45

/** Accessible name for the active block-breaking progress indicator. */
export const CROSSHAIR_BREAK_PROGRESS_LABEL = 'Block breaking progress'

export type CrosshairView = {
  /** The element the host appended us to a parent as. Exposed for tests and previews. */
  readonly root: DomElement
  /** Project a model, or `undefined` for 「not aiming」. Idempotent. */
  readonly render: (model: CrosshairViewModel | undefined) => void
  /**
   * Change the motion preference.
   *
   * Separate from `render` for the reason `HudView.setMotion` is: it changes when
   * a setting or an OS media query changes, not per frame, and threading it
   * through a projection of the session's state would put a settings value inside
   * one.
   */
  readonly setMotion: (motion: MotionPreference) => void
}

type ArmCells = {
  readonly thickness: StyleCell
}

/**
 * One arm — a bar with its own halo.
 *
 * `across` is the thickness axis, so the two arms differ only in which dimension
 * carries the weight. Written as one function rather than two so that a change to
 * the halo cannot reach one arm and miss the other.
 */
const createArm = (
  factory: DomElementFactory,
  parent: DomElement,
  vertical: boolean,
): ArmCells => {
  const arm = factory.createElement('div')
  arm.setAttribute('data-mx-ui', 'crosshair-arm')
  arm.setAttribute('data-crosshair-arm', vertical ? 'vertical' : 'horizontal')
  arm.style.setProperty('position', 'absolute')
  // INK, and its floor over any world pixel is the halo's doing — see the header.
  arm.style.setProperty('background-color', PALETTE_VAR.ink)
  arm.style.setProperty(
    'box-shadow',
    `0 0 0 ${CROSSHAIR_HALO_WIDTH} ${PALETTE_VAR.scrim}`,
  )
  arm.style.setProperty(vertical ? 'height' : 'width', '100%')
  arm.style.setProperty(vertical ? 'left' : 'top', '50%')
  arm.style.setProperty('transform', vertical ? 'translateX(-50%)' : 'translateY(-50%)')
  parent.appendChild(arm)

  return { thickness: styleCell(arm, vertical ? 'width' : 'height') }
}

/**
 * Build the crosshair under `parent`.
 *
 * `parent` is passed in, never looked up (`docs/public-api.md` §4-1). The
 * reference appends to `document.body` and removes itself on hide, which is the
 * two things this repository's surface deliberately cannot do.
 */
export const createCrosshairView = (
  factory: DomElementFactory,
  parent: DomElement,
  motion: MotionPreference,
): CrosshairView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'crosshair')
  declarePalette(root)
  root.style.setProperty('position', 'absolute')
  root.style.setProperty('left', '50%')
  root.style.setProperty('top', '50%')
  root.style.setProperty('width', CROSSHAIR_SIZE)
  root.style.setProperty('height', CROSSHAIR_SIZE)
  // The reference sets `pointer-events: none` (`crosshair.ts:17`) and it is
  // carried over: a mark sitting exactly where every click lands would otherwise
  // eat the clicks that are the whole point of aiming.
  root.style.setProperty('pointer-events', 'none')
  // The centring translate is STATIC, on the root, and the pulse scale lives on
  // an inner element. One `transform` carrying both would mean the pulse's
  // `clearStyle` also removed the centring, so 「reduced motion」 would move the
  // reticle off the point it is meant to mark.
  root.style.setProperty('transform', 'translate(-50%, -50%)')
  root.setAttribute('hidden', '')
  parent.appendChild(root)

  const mark = factory.createElement('div')
  mark.setAttribute('data-mx-ui', 'crosshair-mark')
  // The reticle is decorative: its whole content is 「the viewport centre」.
  // Keep only the mark hidden so the sibling progressbar remains perceivable.
  mark.setAttribute('aria-hidden', 'true')
  mark.style.setProperty('position', 'relative')
  mark.style.setProperty('width', '100%')
  mark.style.setProperty('height', '100%')
  root.appendChild(mark)

  const vertical = createArm(factory, mark, true)
  const horizontal = createArm(factory, mark, false)

  const progress = factory.createElement('div')
  progress.setAttribute('data-mx-ui', 'crosshair-progress')
  progress.setAttribute('role', 'progressbar')
  progress.setAttribute('aria-label', CROSSHAIR_BREAK_PROGRESS_LABEL)
  progress.setAttribute('aria-valuemin', '0')
  progress.setAttribute('aria-valuemax', '100')
  progress.setAttribute('hidden', '')
  progress.style.setProperty('position', 'absolute')
  progress.style.setProperty('left', '50%')
  progress.style.setProperty('top', 'calc(100% + 6px)')
  progress.style.setProperty('width', '28px')
  progress.style.setProperty('height', '3px')
  progress.style.setProperty('transform', 'translateX(-50%)')
  progress.style.setProperty('background-color', PALETTE_VAR.scrim)
  root.appendChild(progress)

  const progressFill = factory.createElement('div')
  progressFill.setAttribute('data-mx-ui', 'crosshair-progress-fill')
  progressFill.style.setProperty('height', '100%')
  progressFill.style.setProperty('background-color', PALETTE_VAR.ink)
  progress.appendChild(progressFill)

  const cells: {
    readonly hidden: AttributeCell
    readonly hitFlag: AttributeCell
    readonly pulse: StyleCell
    readonly progressHidden: AttributeCell
    readonly progressValue: AttributeCell
    readonly progressWidth: PercentCell
  } = {
    hidden: attributeCell(root, 'hidden'),
    hitFlag: attributeCell(root, 'data-crosshair-hit'),
    pulse: styleCell(mark, 'transform'),
    progressHidden: attributeCell(progress, 'hidden'),
    progressValue: attributeCell(progress, 'aria-valuenow'),
    progressWidth: percentCell(progressFill, 'width'),
  }
  // Hidden directly above so no frame flashes a reticle before anybody has said
  // the player is aiming; tell the cell what the element already says.
  cells.hidden.previous = ''
  cells.progressHidden.previous = ''

  let animates = shouldAnimate(motion)
  let latest: CrosshairViewModel | undefined

  const project = (): void => {
    writeHidden(cells.hidden, latest === undefined)
    const hit = latest?.hit === true
    writeAttribute(cells.hitFlag, hit ? '' : undefined)
    const breakProgress = latest?.breakProgress
    writeHidden(cells.progressHidden, breakProgress === undefined)
    const breakPercent = breakProgress === undefined ? undefined : breakProgress * 100
    writeAttribute(cells.progressValue, breakPercent === undefined ? undefined : String(breakPercent))
    if (breakPercent !== undefined) {
      writePercent(cells.progressWidth, breakPercent)
    }
    // WEIGHT first, and unconditionally: the hit is legible without the
    // animation, which is what makes the animation optional rather than the
    // signal.
    const weight = hit ? CROSSHAIR_ARM_HIT_WEIGHT : CROSSHAIR_ARM_WEIGHT
    writeStyle(vertical.thickness, weight)
    writeStyle(horizontal.thickness, weight)

    if (hit && animates) {
      writeStyle(cells.pulse, `scale(${String(CROSSHAIR_PULSE_SCALE)})`)
      return
    }
    // REMOVED rather than set to `scale(1)`, the same call `application/hud-view.ts`
    // makes for its transition: a transform that is always present is a
    // compositing layer that is always present, and 「no animation」 should be
    // expressible as the absence of one.
    clearStyle(cells.pulse)
  }

  project()

  return {
    root,
    render: (model: CrosshairViewModel | undefined): void => {
      latest = model
      project()
    },
    setMotion: (next: MotionPreference): void => {
      const wanted = shouldAnimate(next)
      if (wanted === animates) {
        return
      }
      animates = wanted
      project()
    },
  }
}
