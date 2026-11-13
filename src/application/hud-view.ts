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
 * `setKeyboardFocus` is the same split applied one level down. The hotbar IS
 * focusable now — a roving `tabindex` makes it a single tab stop, which the
 * browser honours natively — and mx-ui draws the ring out of `FOCUS_RING` /
 * `FOCUS_RING_SHADOW`. `HudView` has no key or focus-event listener. The mount's
 * typed `moveFocus` and `moveInventoryFocus` helpers do own their explicit DOM
 * moves and synchronize the ring after them; native Tab and host-managed moves
 * still need their input owner to call `setKeyboardFocus`.
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
} from './dom-write.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  HOTBAR_SLOT_COUNT,
  type HudViewModel,
  type IconState,
  type SlotView,
  hotbarSlotIndex,
} from '../domain/hud-view-model.js'
import { type HudIconName, hudIconDataUri } from './hud-icons.generated.js'
import {
  ICON_ROW_MESSAGE_KEY,
  type IconElement,
  type IconKind,
  createIconElement,
  retireIconElement,
  updateIconElement,
} from './icon-element.js'
import { type MotionPreference, animationDurationMs } from '../domain/accessibility.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotFocusTarget,
  setSlotKeyboardFocus,
  setSlotTabStop,
  updateSlotElement,
} from './slot-element.js'
import { type UiLanguage, type UiMessageKey, type UiMessageValues, translateUiMessage } from '../domain/ui-language.js'
import {
  inheritUiLanguage,
  setLocalizedAttribute,
  setLocalizedText,
  uiLanguageForElement,
  writeLocalizedAttribute,
  writeLocalizedText,
  writeLocalizedTextUsing,
} from './ui-localization.js'
import { itemDisplayNameText, itemDisplayNameValue } from './item-display-name.js'
import { Result } from 'effect'

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
const NO_STATUS_EFFECTS = 0
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
  readonly render: (
    model: HudViewModel,
  ) =>
    Result.Result<
      void,
      Readonly<{ _tag: 'InvalidHudViewInput'; field: 'hotbar.countLabel' | 'hotbar.itemDisplayName' }>
    >
  /** Remove the optional host respawn listener when this view leaves its mount. */
  readonly dispose: () => void
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
   * THE SEAM: mx-ui draws the ring but does not observe native Tab or arbitrary
   * host-managed focus changes (`addEventListener` is not, and must never be —
   * DN-UI-4/DN-UI-13c). `UiMount` calls this after its explicit typed focus moves;
   * the input owner reports any focus changes outside those helpers, just as it
   * supplies a colour-vision mode (`applyColorVision`) and motion preference
   * (`setMotion`).
   *
   * Separate from `render` for the same reason `setMotion` is: this is not a
   * projection of mc-sim's state, and threading it through `HudViewModel` would
   * put an input fact inside one.
   *
   * The index is clamped by `hotbarSlotIndex`, the SAME derivation
   * `selectedHotbarIndex` goes through — a `9` or a `NaN` from across a boundary
   * moves the ring to a real slot rather than losing it (DN-UI-7a).
   *
   * Native Tab focus still needs the input owner to call this, since the view
   * cannot observe that key or focus event itself.
   */
  readonly setKeyboardFocus: (
    index?: number,
  ) => Result.Result<void, Readonly<{ _tag: 'InvalidHudFocusInput'; field: 'index' }>>
}

type HudCells = {
  readonly hearts: IconRowElement
  readonly shanks: IconRowElement
  readonly absorption: HudAssetRow
  readonly armor: HudAssetRow
  readonly oxygen: HudAssetRow
  readonly statusEffects: HudStatusEffects
  readonly time: HudTimeCue
  readonly sunsetWarning: HudSunsetWarning
  readonly levelText: TextCell
  readonly experienceWidth: PercentCell
  readonly experienceTransition: StyleCell
  readonly hotbar: ReadonlyArray<SlotElement>
  readonly deadFlag: AttributeCell
  readonly deathHidden: AttributeCell
  readonly deathDisplay: StyleCell
  readonly deathCause: TextCell
  readonly deathCauseHidden: AttributeCell
  readonly deathCoordinates: TextCell
  readonly deathCoordinatesHidden: AttributeCell
}

type HudAssetElement = {
  readonly root: DomElement
  readonly image: DomElement
  readonly hidden: AttributeCell
  previousName?: HudIconName
}

type HudAssetRow = {
  readonly root: DomElement
  readonly icons: Array<HudAssetElement>
  readonly value: TextCell
  readonly hidden: AttributeCell
}

type HudStatusEffectItem = {
  readonly root: DomElement
  readonly icon: HudAssetElement
  readonly label: TextCell
  readonly duration: TextCell
  readonly hidden: AttributeCell
  readonly category: AttributeCell
}

type HudStatusEffect = NonNullable<NonNullable<HudViewModel['presentation']>['effects']>[number]

type HudStatusEffects = {
  readonly root: DomElement
  readonly items: Array<HudStatusEffectItem>
  readonly hidden: AttributeCell
}

type HudTimeCue = {
  readonly root: DomElement
  readonly icon: HudAssetElement
  readonly label: TextCell
  readonly hidden: AttributeCell
}

type HudSunsetWarning = {
  readonly root: DomElement
  readonly icon: HudAssetElement
  readonly label: TextCell
  readonly hidden: AttributeCell
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
  setLocalizedAttribute(container, 'aria-label', ICON_ROW_MESSAGE_KEY[kind])
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
  options: Readonly<{
    factory: DomElementFactory
    row: IconRowElement
    states: ReadonlyArray<IconState>
    healthCondition?: 'poison' | 'wither'
  }>,
): void => {
  const { factory, row, states, healthCondition } = options
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
      updateIconElement(icon, state, healthCondition)
    }
  }
}

const hotbarSlotName = (
  index: number,
  view: SlotView,
  language: UiLanguage,
): Readonly<{ key: UiMessageKey; values: UiMessageValues }> => {
  const displayIndex = String(index + INDEX_INCREMENT)
  if (typeof view.itemId === 'undefined') {
    return { key: 'hud.hotbar-slot-empty', values: { slot: displayIndex } }
  }
  return {
    key: 'hud.hotbar-slot-item',
    values: { count: view.countLabel ?? '1', item: itemDisplayNameValue(view, language), slot: displayIndex },
  }
}

const updateHotbarSlotName = (slot: SlotElement, index: number, view: SlotView): void => {
  const language = uiLanguageForElement(slot.root)
  const itemText = itemDisplayNameText(view, language)
  const countText = view.countLabel ?? ''
  if (
    typeof slot.ariaLabel.previous === 'undefined' ||
    slot.itemText.previous !== itemText ||
    slot.countText.previous !== countText
  ) {
    const label = hotbarSlotName(index, view, language)
    writeLocalizedAttribute(slot.ariaLabel, label.key, label.values)
  }
}

const renderHotbarSlots = (
  hotbar: ReadonlyArray<SlotElement>,
  views: ReadonlyArray<SlotView>,
): void => {
  for (const [index, slot] of hotbar.entries()) {
    const view = views[index]
    // `hudViewModel` builds `hotbar` with `Array.from({ length:
    // HOTBAR_SLOT_COUNT })`, so ITS output is always exactly as long as
    // `cells.hotbar`. But `HudViewModel` is a PUBLISHED type and `render` a
    // Published function: the type says `ReadonlyArray<SlotView>` and nothing
    // In it says nine, so a consumer that assembles one by hand — which is
    // What a published view model is for — can hand over a shorter one, and
    // This guard's "leave the surplus square alone" arm is exercised directly
    // By such a model in `test/hud-view.test.ts` (the "shorter hotbar" case),
    // Not by anything `hudViewModel` itself can produce.
    if (typeof view !== 'undefined') {
      // The hotbar has no merge highlighting — that is an inventory-drag
      // Concept and mc-sim answers it per screen, not per frame.
      updateHotbarSlotName(slot, index, view)
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

const RESOURCE_ICON_NAMES: Readonly<
  Record<'absorption' | 'armor' | 'oxygen', Readonly<Record<IconState, HudIconName>>>
> = {
  absorption: { empty: 'health-empty', full: 'absorption-full', half: 'absorption-half' },
  armor: { empty: 'armor-empty', full: 'armor-full', half: 'armor-half' },
  oxygen: { empty: 'oxygen-empty', full: 'oxygen-full', half: 'oxygen-half' },
}

const createHudAssetImage = (factory: DomElementFactory): DomElement => {
  const image = factory.createElement('img')
  image.setAttribute('alt', '')
  image.setAttribute('aria-hidden', 'true')
  image.style.setProperty('width', '32px')
  image.style.setProperty('height', '32px')
  image.style.setProperty('image-rendering', 'pixelated')
  return image
}

const createHudAssetElement = (factory: DomElementFactory, parent: DomElement): HudAssetElement => {
  const icon = factory.createElement('span')
  icon.setAttribute('data-mx-ui', 'hud-asset-icon')
  icon.style.setProperty('display', 'inline-block')
  icon.style.setProperty('line-height', '0')

  const image = createHudAssetImage(factory)
  icon.appendChild(image)
  parent.appendChild(icon)
  return { hidden: attributeCell(icon, 'hidden'), image, root: icon }
}

const updateHudAssetElement = (icon: HudAssetElement, name: HudIconName): void => {
  writeHidden(icon.hidden, false)
  if (icon.previousName === name) {
    return
  }
  icon.previousName = name
  icon.root.setAttribute('data-hud-icon', name)
  icon.image.setAttribute('data-hud-icon', name)
  icon.image.setAttribute('src', hudIconDataUri(name))
}

const createHudAssetRowRoot = (
  factory: DomElementFactory,
  kind: 'absorption' | 'armor' | 'oxygen',
  label: UiMessageKey,
): DomElement => {
  const row = factory.createElement('div')
  row.setAttribute('data-mx-ui', `${kind}-row`)
  row.setAttribute('role', 'group')
  setLocalizedAttribute(row, 'aria-label', label)
  row.setAttribute('hidden', '')
  return row
}

const initialHiddenCell = (element: DomElement): AttributeCell => {
  const hidden = attributeCell(element, 'hidden')
  hidden.previous = ''
  return hidden
}

const createHudAssetRow = (
  options: Readonly<{
    factory: DomElementFactory
    parent: DomElement
    kind: 'absorption' | 'armor' | 'oxygen'
    label: UiMessageKey
  }>,
): HudAssetRow => {
  const { factory, parent, kind, label } = options
  const row = createHudAssetRowRoot(factory, kind, label)
  const value = factory.createElement('span')
  value.setAttribute('data-mx-ui', `${kind}-value`)
  row.appendChild(value)
  parent.appendChild(row)
  return {
    hidden: initialHiddenCell(row),
    icons: [],
    root: row,
    value: textCell(value),
  }
}

type HudMeter = NonNullable<NonNullable<HudViewModel['presentation']>['armor']>

const ensureHudAssetIcons = (factory: DomElementFactory, row: HudAssetRow, count: number): void => {
  while (row.icons.length < count) {
    row.icons.push(createHudAssetElement(factory, row.root))
  }
}

const renderHudAssetIcons = (
  row: HudAssetRow,
  kind: 'absorption' | 'armor' | 'oxygen',
  meter: HudMeter,
): void => {
  for (const [index, icon] of row.icons.entries()) {
    const state = meter.states[index]
    if (typeof state === 'undefined') {
      writeHidden(icon.hidden, true)
    } else {
      updateHudAssetElement(icon, RESOURCE_ICON_NAMES[kind][state])
    }
  }
}

const renderHudAssetRow = (
  options: Readonly<{
    factory: DomElementFactory
    row: HudAssetRow
    kind: 'absorption' | 'armor' | 'oxygen'
    meter: HudMeter | undefined
  }>,
): void => {
  const { factory, row, kind, meter } = options
  if (typeof meter === 'undefined') {
    writeHidden(row.hidden, true)
    return
  }
  writeHidden(row.hidden, false)
  ensureHudAssetIcons(factory, row, meter.states.length)
  renderHudAssetIcons(row, kind, meter)
  writeLocalizedText(row.value, 'hud.metric-value', {
    current: meter.current,
    max: meter.max,
  })
}

const createHudStatusEffects = (factory: DomElementFactory, parent: DomElement): HudStatusEffects => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'status-effects')
  root.setAttribute('role', 'group')
  setLocalizedAttribute(root, 'aria-label', 'hud.status-effects')
  root.setAttribute('hidden', '')
  parent.appendChild(root)
  return { hidden: initialHiddenCell(root), items: [], root }
}

const createStatusEffectText = (
  factory: DomElementFactory,
  parent: DomElement,
  selector: 'status-effect-label' | 'status-effect-duration',
): TextCell => {
  const element = factory.createElement('span')
  element.setAttribute('data-mx-ui', selector)
  inheritUiLanguage(parent, element)
  parent.appendChild(element)
  return textCell(element)
}

const createHudStatusEffectItem = (
  factory: DomElementFactory,
  parent: DomElement,
): HudStatusEffectItem => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'status-effect')
  root.setAttribute('role', 'group')
  root.setAttribute('hidden', '')
  inheritUiLanguage(parent, root)
  const icon = createHudAssetElement(factory, root)
  const label = createStatusEffectText(factory, root, 'status-effect-label')
  const duration = createStatusEffectText(factory, root, 'status-effect-duration')
  parent.appendChild(root)
  return {
    category: attributeCell(root, 'data-effect-category'),
    duration,
    hidden: initialHiddenCell(root),
    icon,
    label,
    root,
  }
}

const ensureStatusEffectItems = (factory: DomElementFactory, group: HudStatusEffects, count: number): void => {
  while (group.items.length < count) {
    group.items.push(createHudStatusEffectItem(factory, group.root))
  }
}

const renderStatusEffectItem = (item: HudStatusEffectItem, effect: HudStatusEffect | undefined): void => {
  if (typeof effect === 'undefined') {
    writeHidden(item.hidden, true)
  } else {
    writeHidden(item.hidden, false)
    updateHudAssetElement(item.icon, effect.icon)
    writeAttribute(item.category, effect.category)
    writeLocalizedText(item.label, effect.label)
    writeLocalizedText(item.duration, 'hud.effect-duration', {
      seconds: effect.remainingSeconds,
    })
  }
}

const renderStatusEffectItems = (
  items: ReadonlyArray<HudStatusEffectItem>,
  effects: ReadonlyArray<HudStatusEffect>,
): void => {
  for (const [index, item] of items.entries()) {
    renderStatusEffectItem(item, effects[index])
  }
}

const renderHudStatusEffects = (
  factory: DomElementFactory,
  group: HudStatusEffects,
  effects: NonNullable<HudViewModel['presentation']>['effects'] | undefined,
): void => {
  if (typeof effects === 'undefined' || effects.length === NO_STATUS_EFFECTS) {
    writeHidden(group.hidden, true)
    return
  }
  writeHidden(group.hidden, false)
  ensureStatusEffectItems(factory, group, effects.length)
  renderStatusEffectItems(group.items, effects)
}

const renderHudTimeCue = (
  time: HudTimeCue,
  presentation: HudViewModel['presentation'],
): void => {
  const name = presentation?.timeIcon
  const label = presentation?.timeLabel
  if (typeof name === 'undefined' || typeof label === 'undefined') {
    writeHidden(time.hidden, true)
    return
  }
  writeHidden(time.hidden, false)
  updateHudAssetElement(time.icon, name)
  writeLocalizedText(time.label, label)
}

const renderHudSunsetWarning = (
  warning: HudSunsetWarning,
  presentation: HudViewModel['presentation'],
): void => {
  const seconds = presentation?.sunsetWarningSeconds
  if (typeof seconds === 'undefined') {
    writeHidden(warning.hidden, true)
    return
  }
  writeHidden(warning.hidden, false)
  updateHudAssetElement(warning.icon, 'sunset-warning')
  writeLocalizedText(warning.label, 'hud.sunset-warning', { seconds })
}

const renderDeathCause = (cells: HudCells, model: HudViewModel): void => {
  const cause = model.presentation?.deathCause
  if (!model.dead || typeof cause === 'undefined') {
    writeHidden(cells.deathCauseHidden, true)
  } else {
    writeHidden(cells.deathCauseHidden, false)
    writeLocalizedTextUsing(cells.deathCause, (language) =>
      translateUiMessage(language, 'hud.death-cause', {
        cause: translateUiMessage(language, cause),
      }),
    )
  }

}

const renderDeathCoordinates = (cells: HudCells, model: HudViewModel): void => {
  const coordinates = model.presentation?.coordinates
  if (!model.dead || typeof coordinates === 'undefined') {
    writeHidden(cells.deathCoordinatesHidden, true)
  } else {
    writeHidden(cells.deathCoordinatesHidden, false)
    writeLocalizedText(cells.deathCoordinates, 'hud.death-coordinates', { coordinates })
  }
}

const renderDeathDetails = (cells: HudCells, model: HudViewModel): void => {
  renderDeathCause(cells, model)
  renderDeathCoordinates(cells, model)
}

const createHudTimeCue = (factory: DomElementFactory, parent: DomElement): HudTimeCue => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'time-cue')
  root.setAttribute('role', 'group')
  root.setAttribute('hidden', '')
  const icon = createHudAssetElement(factory, root)
  const labelElement = factory.createElement('span')
  labelElement.setAttribute('data-mx-ui', 'time-label')
  root.appendChild(labelElement)
  parent.appendChild(root)
  return { hidden: initialHiddenCell(root), icon, label: textCell(labelElement), root }
}

const createHudSunsetWarning = (factory: DomElementFactory, parent: DomElement): HudSunsetWarning => {
  const root = factory.createElement('div')
  root.setAttribute('data-mx-ui', 'sunset-warning')
  root.setAttribute('role', 'group')
  root.setAttribute('hidden', '')
  const icon = createHudAssetElement(factory, root)
  const labelElement = factory.createElement('span')
  labelElement.setAttribute('data-mx-ui', 'sunset-warning-label')
  root.appendChild(labelElement)
  parent.appendChild(root)
  return { hidden: initialHiddenCell(root), icon, label: textCell(labelElement), root }
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

const createHotbarGroup = (factory: DomElementFactory, root: DomElement): DomElement => {
  const hotbarGroup = factory.createElement('div')
  hotbarGroup.setAttribute('data-mx-ui', 'hotbar')
  // The hotbar group needs one accessible name because its visible label is a
  // Sibling `<span>`, not a label for the slot widget.
  hotbarGroup.setAttribute('role', 'group')
  setLocalizedAttribute(hotbarGroup, 'aria-label', 'hud.hotbar')
  root.appendChild(hotbarGroup)
  return hotbarGroup
}

const createHotbarRadioGroup = (factory: DomElementFactory, group: DomElement): DomElement => {
  const hotbarRadioGroup = factory.createElement('div')
  hotbarRadioGroup.setAttribute('data-mx-ui', 'hotbar-radio-group')
  hotbarRadioGroup.setAttribute('role', 'radiogroup')
  setLocalizedAttribute(hotbarRadioGroup, 'aria-label', 'hud.hotbar-slots')
  hotbarRadioGroup.setAttribute('aria-orientation', 'horizontal')
  // The hotbar is ONE tab stop, so it needs one accessible name. DN-UI-1c records
  // The reference discovering the same thing about its rebind fields: 「the
  // Visible label is a sibling `<span>`, so a screen reader would otherwise
  // Announce this only as "edit text"」. A focusable element with no name is a
  // Focus stop that announces nothing, which is a worse outcome than not being
  // Reachable at all. Static, so it costs nothing per frame.
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
  hotbarRadioGroup.style.setProperty('display', 'grid')
  hotbarRadioGroup.style.setProperty(
    'grid-template-columns',
    `repeat(${String(HOTBAR_SLOT_COUNT)}, 1fr)`,
  )
  group.appendChild(hotbarRadioGroup)
  return hotbarRadioGroup
}

const createHotbarRow = (factory: DomElementFactory, root: DomElement): DomElement => {
  const group = createHotbarGroup(factory, root)
  return createHotbarRadioGroup(factory, group)
}

const createHotbarSlots = (
  factory: DomElementFactory,
  hotbarRow: DomElement,
): Array<SlotElement> => {
  const hotbar: Array<SlotElement> = []
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += INDEX_INCREMENT) {
    const slot = createSlotElement(factory, index)
    writeAttribute(slot.role, 'radio')
    setSlotFocusTarget(slot, { columns: HOTBAR_SLOT_COUNT, group: 'hotbar', index })
    hotbarRow.appendChild(slot.root)
    hotbar.push(slot)
  }
  return hotbar
}

const configureHudRespawnButton = (
  respawn: DomElement,
  hasRespawn: boolean,
): void => {
  respawn.setAttribute('data-mx-ui', 'respawn')
  respawn.setAttribute('type', 'button')
  respawn.style.setProperty('min-height', '44px')
  respawn.style.setProperty('padding', '8px 16px')
  setLocalizedText(respawn, 'hud.respawn')
  if (!hasRespawn) {
    respawn.setAttribute('disabled', '')
  }
}

const createHudRespawnButton = (
  factory: DomElementFactory,
  death: DomElement,
  onRespawn?: (() => void) | undefined,
): (() => void) | undefined => {
  const respawn = factory.createElement('button')
  configureHudRespawnButton(respawn, typeof onRespawn !== 'undefined')
  death.appendChild(respawn)
  if (typeof onRespawn === 'undefined') {
    return
  }
  respawn.addEventListener('click', onRespawn)
  return () => respawn.removeEventListener?.('click', onRespawn)
}

type HudDeathElements = {
  readonly deadFlag: AttributeCell
  readonly deathHidden: AttributeCell
  readonly deathDisplay: StyleCell
  readonly cause: TextCell
  readonly causeHidden: AttributeCell
  readonly coordinates: TextCell
  readonly coordinatesHidden: AttributeCell
  readonly disposeRespawn?: () => void
}

type HudDeathDetailElements = Readonly<{ cause: DomElement; coordinates: DomElement }>

const createHudDeathLabel = (factory: DomElementFactory, death: DomElement): void => {
  const deathLabel = factory.createElement('span')
  setLocalizedText(deathLabel, 'hud.you-died')
  deathLabel.style.setProperty('font-size', '32px')
  deathLabel.style.setProperty('font-weight', '700')
  death.appendChild(deathLabel)
}

const configureHudDeathLayout = (death: DomElement): void => {
  death.style.setProperty('position', 'absolute')
  death.style.setProperty('inset', '0')
  death.style.setProperty('display', 'none')
  death.style.setProperty('align-content', 'center')
  death.style.setProperty('justify-items', 'center')
  death.style.setProperty('gap', '16px')
  death.style.setProperty('padding', '24px')
  death.style.setProperty('background-color', PALETTE_VAR.scrim)
  death.style.setProperty('text-align', 'center')
}

const createHudDeathRoot = (factory: DomElementFactory): DomElement => {
  const death = factory.createElement('div')
  death.setAttribute('data-mx-ui', 'death')
  death.setAttribute('role', 'alert')
  death.style.setProperty('color', PALETTE_VAR.statusAlert)
  configureHudDeathLayout(death)
  createHudDeathLabel(factory, death)
  return death
}

const createHudDeathDetails = (
  factory: DomElementFactory,
  death: DomElement,
): HudDeathDetailElements => {
  const cause = factory.createElement('span')
  cause.setAttribute('data-mx-ui', 'death-cause')
  cause.setAttribute('hidden', '')
  death.appendChild(cause)
  const coordinates = factory.createElement('span')
  coordinates.setAttribute('data-mx-ui', 'death-coordinates')
  coordinates.setAttribute('hidden', '')
  death.appendChild(coordinates)
  return { cause, coordinates }
}

const createHudDeathOverlay = (
  factory: DomElementFactory,
  root: DomElement,
  onRespawn?: (() => void) | undefined,
): HudDeathElements => {
  const death = createHudDeathRoot(factory)
  const { cause, coordinates } = createHudDeathDetails(factory, death)

  const disposeRespawn = createHudRespawnButton(factory, death, onRespawn)
  death.setAttribute('hidden', '')
  root.appendChild(death)

  const deathHidden = initialHiddenCell(death)

  const elements: HudDeathElements = {
    cause: textCell(cause),
    causeHidden: initialHiddenCell(cause),
    coordinates: textCell(coordinates),
    coordinatesHidden: initialHiddenCell(coordinates),
    deadFlag: attributeCell(root, 'data-dead'),
    deathDisplay: styleCell(death, 'display'),
    deathHidden,
  }
  if (typeof disposeRespawn === 'undefined') {
    return elements
  }
  return { ...elements, disposeRespawn }
}

type HudElements = {
  readonly root: DomElement
  readonly cells: HudCells
  readonly disposeRespawn?: () => void
}

type HudSupplementalElements = Pick<
  HudCells,
  'absorption' | 'armor' | 'oxygen' | 'statusEffects' | 'time' | 'sunsetWarning'
>

const createHudSupplementalElements = (
  factory: DomElementFactory,
  root: DomElement,
): HudSupplementalElements => ({
  absorption: createHudAssetRow({ factory, kind: 'absorption', label: 'hud.absorption', parent: root }),
  armor: createHudAssetRow({ factory, kind: 'armor', label: 'hud.armor', parent: root }),
  oxygen: createHudAssetRow({ factory, kind: 'oxygen', label: 'hud.oxygen', parent: root }),
  statusEffects: createHudStatusEffects(factory, root),
  sunsetWarning: createHudSunsetWarning(factory, root),
  time: createHudTimeCue(factory, root),
})

const createHudHotbarElements = (
  factory: DomElementFactory,
  root: DomElement,
): ReadonlyArray<SlotElement> => createHotbarSlots(factory, createHotbarRow(factory, root))

type HudElementParts = Readonly<{
  death: HudDeathElements
  experience: HudExperienceElements
  hotbar: ReadonlyArray<SlotElement>
  supplemental: HudSupplementalElements
  vitals: HudVitals
}>

const createHudElementParts = (
  factory: DomElementFactory,
  root: DomElement,
  onRespawn?: (() => void) | undefined,
): HudElementParts => {
  const vitals = createHudVitals(factory, root)
  const supplemental = createHudSupplementalElements(factory, root)
  const experience = createHudExperience(factory, root)
  const hotbar = createHudHotbarElements(factory, root)
  const death = createHudDeathOverlay(factory, root, onRespawn)
  return { death, experience, hotbar, supplemental, vitals }
}

const buildHudElements = (
  factory: DomElementFactory,
  onRespawn?: (() => void) | undefined,
): HudElements => {
  const root = createHudRoot(factory)
  const { death, experience, hotbar, supplemental, vitals } = createHudElementParts(factory, root, onRespawn)

  const cells: HudCells = {
    ...supplemental,
    deadFlag: death.deadFlag,
    deathCause: death.cause,
    deathCauseHidden: death.causeHidden,
    deathCoordinates: death.coordinates,
    deathCoordinatesHidden: death.coordinatesHidden,
    deathDisplay: death.deathDisplay,
    deathHidden: death.deathHidden,
    experienceTransition: experience.experienceTransition,
    experienceWidth: experience.experienceWidth,
    hearts: vitals.hearts,
    hotbar,
    levelText: experience.levelText,
    shanks: vitals.shanks,
  }

  const elements: HudElements = { cells, root }
  if (typeof death.disposeRespawn === 'undefined') {
    return elements
  }
  return { ...elements, disposeRespawn: death.disposeRespawn }
}

const renderHudVitals = (factory: DomElementFactory, cells: HudCells, model: HudViewModel): void => {
  const healthCondition = model.presentation?.healthCondition
  if (healthCondition) {
    renderIconRow({ factory, healthCondition, row: cells.hearts, states: model.hearts })
  } else {
    renderIconRow({ factory, row: cells.hearts, states: model.hearts })
  }
  renderIconRow({ factory, row: cells.shanks, states: model.shanks })
}

const renderHudSupplements = (factory: DomElementFactory, cells: HudCells, model: HudViewModel): void => {
  const { presentation } = model
  renderHudAssetRow({ factory, kind: 'absorption', meter: presentation?.absorption, row: cells.absorption })
  renderHudAssetRow({ factory, kind: 'armor', meter: presentation?.armor, row: cells.armor })
  renderHudAssetRow({ factory, kind: 'oxygen', meter: presentation?.oxygen, row: cells.oxygen })
  renderHudStatusEffects(factory, cells.statusEffects, presentation?.effects)
  renderHudTimeCue(cells.time, presentation)
  renderHudSunsetWarning(cells.sunsetWarning, presentation)
}

const renderHudDeathState = (cells: HudCells, model: HudViewModel): void => {
  writeAttribute(cells.deadFlag, presenceValue(model.dead))
  if (model.dead) {
    writeStyle(cells.deathDisplay, 'grid')
  } else {
    writeStyle(cells.deathDisplay, 'none')
  }
  writeHidden(cells.deathHidden, !model.dead)
  renderDeathDetails(cells, model)
}

const renderHudFrame = (
  factory: DomElementFactory,
  cells: HudCells,
  model: HudViewModel,
): Result.Result<
  void,
  Readonly<{ _tag: 'InvalidHudViewInput'; field: 'hotbar.countLabel' | 'hotbar.itemDisplayName' }>
> => {
  if (model.hotbar.some((slot) => Reflect.get(slot, 'countLabel') === null)) {
    return Result.fail({ _tag: 'InvalidHudViewInput', field: 'hotbar.countLabel' })
  }
  if (model.hotbar.some((slot) => Reflect.get(slot, 'itemDisplayName') === null)) {
    return Result.fail({ _tag: 'InvalidHudViewInput', field: 'hotbar.itemDisplayName' })
  }
  renderHudVitals(factory, cells, model)
  renderHudSupplements(factory, cells, model)
  writeText(cells.levelText, model.experienceLevelLabel)
  writePercent(cells.experienceWidth, model.experiencePercent)
  renderHotbarSlots(cells.hotbar, model.hotbar)
  renderHudDeathState(cells, model)
  return Result.void
}

/**
 * Build the HUD under `parent` and return a handle that projects models onto it.
 *
 * `parent` is passed in, never looked up. `docs/public-api.md` §4-1: mx-ui does
 * not go looking for `document`, because a preview page has to be able to stand
 * up more than one instance.
 */
type CreateHudViewArguments = readonly [
  factory: DomElementFactory,
  parent: DomElement,
  motion: MotionPreference,
  options?: Readonly<{ readonly onRespawn?: (() => void) | undefined }>,
]

export const createHudView = (...arguments_: CreateHudViewArguments): HudView => {
  const [factory, parent, motion, options] = arguments_
  const { cells, disposeRespawn, root } = buildHudElements(factory, options?.onRespawn)

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
  const applyKeyboardFocus = (
    index?: number,
  ): Result.Result<void, Readonly<{ _tag: 'InvalidHudFocusInput'; field: 'index' }>> => {
    if (Object.is(index, null)) {
      return Result.fail({ _tag: 'InvalidHudFocusInput', field: 'index' })
    }
    const focusedIndex = focusedIndexFor(index)
    const tabStopIndex = focusedIndex ?? DEFAULT_TAB_STOP_INDEX
    for (const [slotIndex, slot] of cells.hotbar.entries()) {
      // Roving tabindex keeps every hotbar radio enabled for keyboard navigation.
      writeAttribute(slot.disabled)
      setSlotTabStop(slot, slotIndex === tabStopIndex)
      setSlotKeyboardFocus(slot, slotIndex === focusedIndex)
    }
    return Result.void
  }

  applyMotion(motion)
  // At mount the keyboard is not here: the hotbar is reachable by Tab and no ring
  // Is drawn, because nothing has said one should be.
  applyKeyboardFocus()
  parent.appendChild(root)

  const dispose = (): void => {
    if (typeof disposeRespawn !== 'undefined') {
      disposeRespawn()
    }
  }

  return {
    dispose,
    render: (model: HudViewModel): Result.Result<
      void,
      Readonly<{ _tag: 'InvalidHudViewInput'; field: 'hotbar.countLabel' | 'hotbar.itemDisplayName' }>
    > => renderHudFrame(factory, cells, model),
    root,
    setKeyboardFocus: applyKeyboardFocus,
    setMotion: applyMotion,
  }
}
