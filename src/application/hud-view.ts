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
 * No `addEventListener`. Not "none today" — the generic element surface does
 * not contain the verb, so this file could not attach one without opting into
 * the menu-only interactive surface. DN-UI-4: 「モーダルの Escape は
 * stopPropagation、閉じる責務はフレーム側単一ハンドラ(mc-render の入力設計と対)」.
 * `domain/modal-stack.ts` holds the decision; mc-render delivers the key; this
 * file draws the result.
 *
 * `setKeyboardFocus` is the same split applied one level down, and it is worth
 * being precise about because it looks like an exception and is not. The hotbar
 * IS focusable now — a roving `tabindex` makes it a single tab stop, which the
 * browser honours natively with no listener anywhere — and mx-ui draws the ring
 * out of `FOCUS_RING` / `FOCUS_RING_SHADOW`. What it does not do is take the
 * keystroke that moves focus, or watch for the focus event that would tell it the
 * player pressed Tab: neither operation is available on a generic `DomElement`.
 * A focus RING is a rendering concern; a focus
 * MOVE is an input one, and they were only ever the same thing because nobody
 * had separated them.
 */
import {
  type AttributeCell,
  type PercentCell,
  type StyleCell,
  type TextCell,
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
} from './dom-write'
import type { DomElement, DomElementFactory } from './dom-surface'
import {
  HOTBAR_SLOT_COUNT,
  type HudViewModel,
  type IconState,
  type SlotView,
  hotbarSlotIndex,
} from '../domain/hud-view-model'
import {
  ICON_ROW_LABEL,
  type IconElement,
  type IconKind,
  createIconElement,
  retireIconElement,
  updateIconElement,
} from './icon-element'
import {
  type MotionPreference,
  animationDurationMs,
} from '../domain/accessibility'
import { PALETTE_VAR, declarePalette } from './palette-css'
import {
  type SlotElement,
  createSlotElement,
  setSlotKeyboardFocus,
  setSlotTabStop,
  updateSlotElement,
} from './slot-element'

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

/**
 * Where the hotbar's single tab stop sits when nobody has said where the keyboard
 * is.
 *
 * Slot 0, and NOT the selected slot: `setKeyboardFocus(undefined)` means "the
 * keyboard is not here", and seeding the tab stop from mc-sim's selection would
 * answer the keyboard's question with the game's — the two `domain/palette.ts`
 * keeps `FOCUS_RING` and `SLOT_SELECTED` apart in order to keep separate.
 */
const DEFAULT_TAB_STOP_INDEX = 0
/** A duration of exactly zero means "do not animate at all" — see `applyMotion`. */
const ZERO_DURATION_MS = 0
/** One hotbar slot per iteration. */
const INDEX_INCREMENT = 1

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
  /**
   * Say which hotbar slot the keyboard is on, or omit it for "not here".
   *
   * THE SEAM, and the half of the focus ring that is not mx-ui's. mx-ui makes a
   * slot focusable and decides what focus LOOKS like; it cannot move focus
   * (`focus()` is not in `application/dom-surface.ts`) and cannot observe it
   * (`addEventListener` is not, and must never be — DN-UI-4/DN-UI-13c). Both of
   * those are input, and input is mc-render's (plan.md §2.3-2). So the input
   * owner says where the keyboard went, exactly as it hands over a colour-vision
   * mode (`applyColorVision`) and a motion preference (`setMotion`) rather than
   * mx-ui reading either.
   *
   * Separate from `render` for the same reason `setMotion` is: this is not a
   * projection of mc-sim's state, and threading it through `HudViewModel` would
   * put an input fact inside one.
   *
   * The index is clamped by `hotbarSlotIndex`, the SAME derivation
   * `selectedHotbarIndex` goes through — a `9` or a `NaN` from across a boundary
   * moves the ring to a real slot rather than losing it (DN-UI-7a).
   *
   * WHAT IS STILL OPEN, precisely: until the input owner calls this, a player who
   * presses Tab lands on the default stop and sees the USER AGENT's focus ring
   * rather than the palette's. That is not a hook with nothing behind it — the
   * ring, the tokens and the tab stop are all real and all reachable — but it is
   * the one thing this repository cannot close on its own, because closing it
   * means noticing a keystroke.
   */
  readonly setKeyboardFocus: (index?: number) => void
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

/** `''` when present, otherwise no attribute at all. */
const presenceValue = (present: boolean): string | undefined => {
  if (present) {
    return ''
  }
  return
}

const focusedIndexFor = (index: number | undefined): number | undefined => {
  if (typeof index === 'undefined') {
    return
  }
  return hotbarSlotIndex(index)
}

const createIconRow = (
  factory: DomElementFactory,
  kind: IconKind,
  parent: DomElement,
): IconRowElement => {
  const container = factory.createElement('div')
  container.setAttribute('data-mx-ui', `${kind}-row`)
  // A row of glyphs that nobody has named announces as twenty punctuation
  // Characters. `ICON_ROW_LABEL` says why this is the row's job rather than each
  // Icon's; static, so it costs nothing on the frame path.
  container.setAttribute('role', 'group')
  container.setAttribute('aria-label', ICON_ROW_LABEL[kind])
  parent.appendChild(container)
  return { container, icons: [], kind }
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

  // Over the array; see `caption-view.ts`'s note on the same shape. `states` is
  // The other array and keeps its check, because a row with fewer states than
  // Icons is what retires the surplus.
  for (const [index, icon] of row.icons.entries()) {
    const state = states[index]
    if (typeof state === 'undefined') {
      retireIconElement(icon)
    } else {
      updateIconElement(icon, state)
    }
  }
}

const renderHotbarSlots = (
  hotbar: ReadonlyArray<SlotElement>,
  views: ReadonlyArray<SlotView>,
): void => {
  for (const [index, slot] of hotbar.entries()) {
    const view = views[index]
    // UNCOVERED ON PURPOSE, and it is the only such arm in this repository.
    //
    // `hudViewModel` builds `hotbar` with `Array.from({ length:
    // HOTBAR_SLOT_COUNT })`, so its output is always exactly as long as
    // `cells.hotbar` and this can never be `undefined`. It stays because
    // `HudViewModel` is a PUBLISHED type and `render` a published function:
    // The type says `ReadonlyArray<SlotView>` and nothing in it says nine,
    // So a consumer that assembles one by hand — which is what a published
    // View model is FOR — can hand over a shorter one.
    //
    // Covering it would mean building a model that bypasses the only
    // Producer, which teaches the next reader that the producer can be
    // Short. Leaving the surplus squares alone is the inert answer: a
    // Stale slot rather than a crash mid-frame. docs/testing.md §6-2.
    if (typeof view !== 'undefined') {
      // The hotbar has no merge highlighting — that is an inventory-drag
      // Concept and mc-sim answers it per screen, not per frame.
      updateSlotElement(slot, view)
    }
  }
}

const createHudRoot = (factory: DomElementFactory): DomElement => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'hud')
  // THE palette declaration, and the only place in this repository token VALUES
  // Enter a document. Everything below references them by name.
  declarePalette(root)
  // The scrim. `domain/palette.ts`: 「it is the mechanism by which the claim
  // Above is made honourable, and content that leaves it leaves the guarantee
  // With it」 — so the HUD's own background is the guarded surface, and every
  // Element below is inside it.
  root.style.setProperty('background-color', PALETTE_VAR.scrim)
  root.style.setProperty('color', PALETTE_VAR.ink)
  return root
}

type HudVitals = {
  readonly hearts: IconRowElement
  readonly shanks: IconRowElement
}

const createHudVitals = (factory: DomElementFactory, root: DomElement): HudVitals => {
  const vitals = factory.createElement('div')
  vitals.setAttribute('data-mx-ui', 'vitals')
  root.appendChild(vitals)

  const hearts = createIconRow(factory, 'heart', vitals)
  const shanks = createIconRow(factory, 'shank', vitals)
  return { hearts, shanks }
}

const createExperienceTrack = (factory: DomElementFactory, experience: DomElement): DomElement => {
  const track = factory.createElement('div')
  track.setAttribute('data-mx-ui', 'experience-track')
  track.style.setProperty('background-color', PALETTE_VAR.meterTrack)
  experience.appendChild(track)

  const fill = factory.createElement('div')
  fill.setAttribute('data-mx-ui', 'experience-fill')
  fill.style.setProperty('background-color', PALETTE_VAR.xpFill)
  // XP_FILL_HIGHLIGHT is a gradient stop within one mark, exactly as
  // `domain/palette.ts` argues when it declines to guard it. It appears here as
  // A gradient and nowhere as a meaning; the measured token is the flat
  // `background-color` above, which is what a contrast reading would sample.
  fill.style.setProperty(
    'background-image',
    `linear-gradient(180deg, ${PALETTE_VAR.xpFillHighlight}, ${PALETTE_VAR.xpFill})`,
  )
  track.appendChild(fill)
  return fill
}

const createExperienceLevel = (factory: DomElementFactory, experience: DomElement): TextCell => {
  const level = factory.createElement('span')
  level.setAttribute('data-mx-ui', 'experience-level')
  level.style.setProperty('color', PALETTE_VAR.xpLevel)
  experience.appendChild(level)
  return textCell(level)
}

type HudExperienceElements = {
  readonly levelText: TextCell
  readonly experienceWidth: PercentCell
  readonly experienceTransition: StyleCell
}

const createHudExperience = (
  factory: DomElementFactory,
  root: DomElement,
): HudExperienceElements => {
  const experience = factory.createElement('div')
  experience.setAttribute('data-mx-ui', 'experience')
  root.appendChild(experience)

  const fill = createExperienceTrack(factory, experience)
  const levelText = createExperienceLevel(factory, experience)

  return {
    experienceTransition: styleCell(fill, 'transition'),
    experienceWidth: percentCell(fill, 'width'),
    levelText,
  }
}

const createHotbarRow = (factory: DomElementFactory, root: DomElement): DomElement => {
  const hotbarRow = factory.createElement('div')
  hotbarRow.setAttribute('data-mx-ui', 'hotbar')
  // The hotbar is ONE tab stop, so it needs one accessible name. DN-UI-1c records
  // The reference discovering the same thing about its rebind fields: 「the
  // Visible label is a sibling `<span>`, so a screen reader would otherwise
  // Announce this only as "edit text"」. A focusable element with no name is a
  // Focus stop that announces nothing, which is a worse outcome than not being
  // Reachable at all. Static, so it costs nothing per frame.
  hotbarRow.setAttribute('role', 'group')
  hotbarRow.setAttribute('aria-label', 'Hotbar')
  // NINE COLUMNS, and this line is here because a browser said so.
  //
  // `apps/browser-harness/` mounted this file against a real `Document` and the
  // Hotbar came back as nine FULL-WIDTH BARS STACKED VERTICALLY — 254px tall at
  // Both 320 and 390. Nothing headless can see that: `test/fake-dom.ts` has no
  // Layout, so `test/screen-mount.test.ts` correctly finds nine slots with
  // Exactly one selected and has no way to notice they are in a column.
  //
  // The reason it is a DEFECT rather than a host's business is that this
  // Repository had already answered the question elsewhere and answered it
  // Differently. `application/inventory-view.ts`'s `createRegion` gives every
  // Region a `display: grid` child and writes `grid-template-columns` from the
  // Model's own `columns` — INCLUDING the hotbar region, which the inventory
  // Screen therefore draws as a row of nine while the HUD drew the same nine as
  // A column. One repository, two answers, and the browser is the only thing
  // That could tell them apart.
  //
  // Static rather than a cell: `HOTBAR_SLOT_COUNT` is a constant, so unlike the
  // Inventory's regions there is nothing per-frame to diff. Written at mount and
  // Never again, like every other geometry declaration in this file.
  hotbarRow.style.setProperty('display', 'grid')
  hotbarRow.style.setProperty(
    'grid-template-columns',
    `repeat(${String(HOTBAR_SLOT_COUNT)}, 1fr)`,
  )
  root.appendChild(hotbarRow)
  return hotbarRow
}

const createHotbarSlots = (
  factory: DomElementFactory,
  hotbarRow: DomElement,
): Array<SlotElement> => {
  const hotbar: Array<SlotElement> = []
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += INDEX_INCREMENT) {
    const slot = createSlotElement(factory, index)
    hotbarRow.appendChild(slot.root)
    hotbar.push(slot)
  }
  return hotbar
}

const createHudRespawnButton = (factory: DomElementFactory, death: DomElement): void => {
  const respawn = factory.createElement('button')
  respawn.setAttribute('data-mx-ui', 'respawn')
  respawn.setAttribute('type', 'button')
  respawn.textContent = 'Respawn'
  death.appendChild(respawn)
}

type HudDeathElements = {
  readonly deadFlag: AttributeCell
  readonly deathHidden: AttributeCell
}

const createHudDeathOverlay = (factory: DomElementFactory, root: DomElement): HudDeathElements => {
  const death = factory.createElement('div')
  death.setAttribute('data-mx-ui', 'death')
  death.style.setProperty('color', PALETTE_VAR.statusAlert)
  death.textContent = 'You died'
  createHudRespawnButton(factory, death)
  death.setAttribute('hidden', '')
  root.appendChild(death)

  const deathHidden = attributeCell(death, 'hidden')
  // `deathHidden` was set directly above so the first frame does not flash the
  // Overlay; tell the cell what the element already says.
  deathHidden.previous = ''

  return {
    deadFlag: attributeCell(root, 'data-dead'),
    deathHidden,
  }
}

type HudElements = {
  readonly root: DomElement
  readonly cells: HudCells
}

const buildHudElements = (factory: DomElementFactory): HudElements => {
  const root = createHudRoot(factory)
  const vitals = createHudVitals(factory, root)
  const experience = createHudExperience(factory, root)
  const hotbarRow = createHotbarRow(factory, root)
  const hotbar = createHotbarSlots(factory, hotbarRow)
  const death = createHudDeathOverlay(factory, root)

  const cells: HudCells = {
    deadFlag: death.deadFlag,
    deathHidden: death.deathHidden,
    experienceTransition: experience.experienceTransition,
    experienceWidth: experience.experienceWidth,
    hearts: vitals.hearts,
    hotbar,
    levelText: experience.levelText,
    shanks: vitals.shanks,
  }

  return { cells, root }
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
  const { cells, root } = buildHudElements(factory)

  const applyMotion = (preference: MotionPreference): void => {
    const durationMs = animationDurationMs(EXPERIENCE_TRANSITION_MS, preference)
    if (durationMs === ZERO_DURATION_MS) {
      // REMOVED, not zeroed. See `clearStyle` in `application/dom-write.ts`.
      clearStyle(cells.experienceTransition)
      return
    }
    writeStyle(cells.experienceTransition, `width ${String(durationMs)}ms linear`)
  }

  /**
   * Move the tab stop and the ring together.
   *
   * They are the same slot whenever the ring is drawn at all, which is what makes
   * the browser's native Tab agree with what mx-ui painted without anybody
   * listening for a key.
   */
  const applyKeyboardFocus = (index?: number): void => {
    const focusedIndex = focusedIndexFor(index)
    const tabStopIndex = focusedIndex ?? DEFAULT_TAB_STOP_INDEX
    for (const [slotIndex, slot] of cells.hotbar.entries()) {
      setSlotTabStop(slot, slotIndex === tabStopIndex)
      setSlotKeyboardFocus(slot, slotIndex === focusedIndex)
    }
  }

  applyMotion(motion)
  // At mount the keyboard is not here: the hotbar is reachable by Tab and no ring
  // Is drawn, because nothing has said one should be.
  applyKeyboardFocus()
  parent.appendChild(root)

  return {
    render: (model: HudViewModel): void => {
      renderIconRow(factory, cells.hearts, model.hearts)
      renderIconRow(factory, cells.shanks, model.shanks)
      writeText(cells.levelText, model.experienceLevelLabel)
      writePercent(cells.experienceWidth, model.experiencePercent)
      renderHotbarSlots(cells.hotbar, model.hotbar)
      writeAttribute(cells.deadFlag, presenceValue(model.dead))
      writeHidden(cells.deathHidden, !model.dead)
    },
    root,
    setKeyboardFocus: applyKeyboardFocus,
    setMotion: applyMotion,
  }
}
