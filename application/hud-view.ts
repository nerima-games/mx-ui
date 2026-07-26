/**
 * The HUD, as elements.
 *
 * ---------------------------------------------------------------------------
 * What this file is, and what it deliberately is not
 * ---------------------------------------------------------------------------
 *
 * `domain/hud-view-model.ts` promised this: 「The DOM layer becomes a dumb
 * projection of this type, so a rendering bug and a derivation bug are never the
 * same bug」. Everything below is that projection and nothing else — there is no
 * arithmetic here beyond choosing between two `var(...)` strings, no clamping,
 * no rounding and no opinion about what a number means. `hudViewModel` decided
 * all of it, and it is tested under `environment: 'node'` where it is cheap to
 * test exhaustively.
 *
 * The file is also, on purpose, not a component framework. It builds a tree once
 * and mutates it. There is no reconciliation, no keyed list, no virtual node —
 * the shape of a HUD is known at compile time except for the length of two icon
 * rows, which is the one thing handled dynamically.
 *
 * ---------------------------------------------------------------------------
 * The frame path (plan.md §5.2)
 * ---------------------------------------------------------------------------
 *
 * `ui:hud-sync` runs every frame. `render` therefore:
 *
 *   - allocates nothing on a steady frame. No array, no closure, no object, and
 *     no string except a percentage on the frames a percentage actually moved
 *     (`writePercent` compares the number first);
 *   - performs ZERO DOM mutations when the model has not changed, which is the
 *     property `test/hud-view.test.ts` asserts by counting writes on a fake
 *     document rather than by measuring time;
 *   - never writes a colour. Colours are `var(--mx-ui-*)` references installed
 *     at mount; a state change swaps which reference an element holds, and even
 *     that is diffed.
 *
 * The one case that allocates is a heart row that got LONGER — a max-health
 * change — which creates and appends the icons it lacks. That is not a
 * per-frame event, and the alternative (pre-allocating for an unbounded maximum)
 * is worse: `iconRow` derives its length from `maxHealthPoints`, which
 * `safeMaxPoints` deliberately does not bound.
 *
 * ---------------------------------------------------------------------------
 * Escape, and what is NOT here
 * ---------------------------------------------------------------------------
 *
 * No `addEventListener`. Not "none today" — `application/dom-surface.ts` does
 * not contain the verb, so this file could not attach one without widening a
 * file whose header says why it must not be widened. DN-UI-4: 「モーダルの Escape は
 * stopPropagation、閉じる責務はフレーム側単一ハンドラ(mc-render の入力設計と対)」.
 * `domain/modal-stack.ts` holds the decision; mc-render delivers the key; this
 * file draws the result.
 */
import {
  animationDurationMs,
  type MotionPreference,
} from '../domain/accessibility'
import { HOTBAR_SLOT_COUNT, type HudViewModel, type IconState } from '../domain/hud-view-model'
import {
  createIconElement,
  retireIconElement,
  updateIconElement,
  type IconElement,
  type IconKind,
} from './icon-element'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  attributeCell,
  clearStyle,
  percentCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writePercent,
  writeStyle,
  writeText,
  type AttributeCell,
  type PercentCell,
  type StyleCell,
  type TextCell,
} from './dom-write'
import { declarePalette, PALETTE_VAR } from './palette-css'
import { createSlotElement, updateSlotElement, type SlotElement } from './slot-element'

/**
 * How long the XP bar takes to slide, at full motion.
 *
 * The HUD's only animation, and it is here rather than in `domain/` for the same
 * reason `DURABILITY_LOW_PERCENT` is: a duration is a presentation choice.
 * What is NOT a presentation choice is whether it runs — that is
 * `animationDurationMs`, and routing through it is what makes 「did we
 * remember?」 a question with a single answer (`domain/accessibility.ts`).
 */
export const EXPERIENCE_TRANSITION_MS = 220

/** A row of hearts or shanks, grown on demand. */
type IconRowElement = {
  readonly kind: IconKind
  readonly container: DomElement
  readonly icons: Array<IconElement>
}

export type HudView = {
  /** The element the host appended us to a parent as. Exposed for tests and previews. */
  readonly root: DomElement
  /** Project a model. Idempotent: the same model twice mutates nothing the second time. */
  readonly render: (model: HudViewModel) => void
  /**
   * Change the motion preference.
   *
   * Separate from `render` because it is not per-frame state: it changes when
   * the player changes a setting or the OS media query flips, and threading it
   * through the view model would put a settings value inside a projection of
   * mc-sim's state.
   */
  readonly setMotion: (motion: MotionPreference) => void
}

type HudCells = {
  readonly hearts: IconRowElement
  readonly shanks: IconRowElement
  readonly levelText: TextCell
  readonly experienceWidth: PercentCell
  readonly experienceTransition: StyleCell
  readonly hotbar: ReadonlyArray<SlotElement>
  readonly deadFlag: AttributeCell
  readonly deathHidden: AttributeCell
}

const createIconRow = (
  factory: DomElementFactory,
  kind: IconKind,
  parent: DomElement,
): IconRowElement => {
  const container = factory.createElement('div')
  container.setAttribute('data-mx-ui', `${kind}-row`)
  parent.appendChild(container)
  return { kind, container, icons: [] }
}

/**
 * Grow the row to `length`, then set every icon and hide the surplus.
 *
 * Surplus icons are HIDDEN rather than removed. Removal would mean
 * `removeChild` in `application/dom-surface.ts` and a tree whose shape depends
 * on history; hiding means the tree built at mount is the tree that exists
 * forever, which is the invariant that lets every other cell in this file hold a
 * permanent element reference.
 */
const renderIconRow = (
  factory: DomElementFactory,
  row: IconRowElement,
  states: ReadonlyArray<IconState>,
): void => {
  while (row.icons.length < states.length) {
    const icon = createIconElement(factory, row.kind)
    row.container.appendChild(icon.root)
    row.icons.push(icon)
  }

  for (let index = 0; index < row.icons.length; index += 1) {
    const icon = row.icons[index]
    if (icon === undefined) {
      continue
    }
    const state = states[index]
    if (state === undefined) {
      retireIconElement(icon)
      continue
    }
    updateIconElement(icon, state)
  }
}

/**
 * Build the HUD under `parent` and return a handle that projects models onto it.
 *
 * `parent` is passed in, never looked up. `docs/public-api.md` §4-1: mx-ui does
 * not go looking for `document`, because a preview page has to be able to stand
 * up more than one instance.
 */
export const createHudView = (
  factory: DomElementFactory,
  parent: DomElement,
  motion: MotionPreference,
): HudView => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'hud')
  // THE palette declaration, and the only place in this repository token VALUES
  // enter a document. Everything below references them by name.
  declarePalette(root)
  // The scrim. `domain/palette.ts`: 「it is the mechanism by which the claim
  // above is made honourable, and content that leaves it leaves the guarantee
  // with it」 — so the HUD's own background is the guarded surface, and every
  // element below is inside it.
  root.style.setProperty('background-color', PALETTE_VAR.scrim)
  root.style.setProperty('color', PALETTE_VAR.ink)

  const vitals = factory.createElement('div')
  vitals.setAttribute('data-mx-ui', 'vitals')
  root.appendChild(vitals)

  const hearts = createIconRow(factory, 'heart', vitals)
  const shanks = createIconRow(factory, 'shank', vitals)

  const experience = factory.createElement('div')
  experience.setAttribute('data-mx-ui', 'experience')
  root.appendChild(experience)

  const track = factory.createElement('div')
  track.setAttribute('data-mx-ui', 'experience-track')
  track.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  experience.appendChild(track)

  const fill = factory.createElement('div')
  fill.setAttribute('data-mx-ui', 'experience-fill')
  fill.style.setProperty('background-color', PALETTE_VAR.xpFill)
  // XP_FILL_HIGHLIGHT is a gradient stop within one mark, exactly as
  // `domain/palette.ts` argues when it declines to guard it. It appears here as
  // a gradient and nowhere as a meaning; the measured token is the flat
  // `background-color` above, which is what a contrast reading would sample.
  fill.style.setProperty(
    'background-image',
    `linear-gradient(180deg, ${PALETTE_VAR.xpFillHighlight}, ${PALETTE_VAR.xpFill})`,
  )
  track.appendChild(fill)

  const level = factory.createElement('span')
  level.setAttribute('data-mx-ui', 'experience-level')
  level.style.setProperty('color', PALETTE_VAR.xpLevel)
  experience.appendChild(level)

  const hotbarRow = factory.createElement('div')
  hotbarRow.setAttribute('data-mx-ui', 'hotbar')
  root.appendChild(hotbarRow)

  const hotbar: Array<SlotElement> = []
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
    const slot = createSlotElement(factory, index)
    hotbarRow.appendChild(slot.root)
    hotbar.push(slot)
  }

  const death = factory.createElement('div')
  death.setAttribute('data-mx-ui', 'death')
  death.style.setProperty('color', PALETTE_VAR.statusAlert)
  death.textContent = 'You died'
  death.setAttribute('hidden', '')
  root.appendChild(death)

  const cells: HudCells = {
    hearts,
    shanks,
    levelText: textCell(level),
    experienceWidth: percentCell(fill, 'width'),
    experienceTransition: styleCell(fill, 'transition'),
    hotbar,
    deadFlag: attributeCell(root, 'data-dead'),
    deathHidden: attributeCell(death, 'hidden'),
  }
  // `deathHidden` was set directly above so the first frame does not flash the
  // overlay; tell the cell what the element already says.
  cells.deathHidden.previous = ''

  const applyMotion = (preference: MotionPreference): void => {
    const durationMs = animationDurationMs(EXPERIENCE_TRANSITION_MS, preference)
    if (durationMs === 0) {
      // REMOVED, not zeroed. See `clearStyle` in `application/dom-write.ts`.
      clearStyle(cells.experienceTransition)
      return
    }
    writeStyle(cells.experienceTransition, `width ${String(durationMs)}ms linear`)
  }

  applyMotion(motion)
  parent.appendChild(root)

  return {
    root,
    render: (model: HudViewModel): void => {
      renderIconRow(factory, cells.hearts, model.hearts)
      renderIconRow(factory, cells.shanks, model.shanks)
      writeText(cells.levelText, model.experienceLevelLabel)
      writePercent(cells.experienceWidth, model.experiencePercent)

      for (let index = 0; index < cells.hotbar.length; index += 1) {
        const slot = cells.hotbar[index]
        const view = model.hotbar[index]
        if (slot === undefined || view === undefined) {
          continue
        }
        // The hotbar has no merge highlighting — that is an inventory-drag
        // concept and mc-sim answers it per screen, not per frame.
        updateSlotElement(slot, view, undefined)
      }

      writeAttribute(cells.deadFlag, model.dead ? '' : undefined)
      writeHidden(cells.deathHidden, !model.dead)
    },
    setMotion: applyMotion,
  }
}
