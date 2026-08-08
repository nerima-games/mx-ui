/**
 * The HUD screen: hotbar, health, hunger, XP.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * What is actually on screen here
 * ---------------------------------------------------------------------------
 *
 * `hudViewModel(snapshot)` and nothing else. Every icon, every label and every
 * percentage below is read straight off the returned `HudViewModel` — the
 * renderer computes no game state, exactly as the DOM layer must not
 * (`domain/hud-view-model.ts:16-25`: 「The DOM layer becomes a dumb projection of
 * this type, so a rendering bug and a derivation bug are never the same bug」).
 *
 * That is what makes a terminal renderer worth anything here. It is a different
 * projection of the same view model the browser will project, so what it shows
 * you about the MODEL transfers; what it shows you about layout does not, and
 * this file claims nothing about layout.
 *
 * The raw fields are printed underneath the picture for the same reason
 * mc-worldgen's terrain preview prints numbers under its map: a row of icons is
 * unfalsifiable on its own, and "19 health is nine full hearts and one half" is
 * a claim you can only check against a number.
 */
import { hudViewModel, type HudViewModel, type IconState, type VitalsSnapshot } from '../../src/domain/hud-view-model'
import { mix, padEnd, padStart, type Rgb, type Style } from './ansi'
import {
  BAD,
  DURABILITY_HIGH,
  DURABILITY_LOW,
  FAINT,
  HEART_EMPTY,
  HEART_FULL,
  HEART_HALF,
  INK,
  MUTED,
  SHANK_EMPTY,
  SHANK_FULL,
  SHANK_HALF,
  SLOT_BORDER,
  SLOT_SELECTED,
  XP_BAR,
  XP_LEVEL,
  XP_TRACK,
  type IconGlyphs,
} from './palette'

const iconRowLine = (
  style: Style,
  icons: ReadonlyArray<IconState>,
  glyphs: IconGlyphs,
  colors: { readonly full: Rgb; readonly half: Rgb; readonly empty: Rgb },
): string =>
  icons
    .map((icon) => {
      if (icon === 'full') {
        return style.paint(glyphs.full, colors.full)
      }
      if (icon === 'half') {
        return style.paint(glyphs.half, colors.half)
      }
      return style.paint(glyphs.empty, colors.empty)
    })
    .join('')

const countIcons = (icons: ReadonlyArray<IconState>, state: IconState): number =>
  icons.filter((icon) => icon === state).length

/**
 * A durability meter.
 *
 * Filled and empty use DIFFERENT CHARACTERS, not only different colours. A meter
 * whose reading depends on hue is unreadable to precisely the players
 * `domain/accessibility.ts` exists for — and unreadable in `--ascii` output,
 * which is where a frame goes when it is pasted into an issue.
 */
const durabilityBar = (
  style: Style,
  percent: number | undefined,
  width: number,
  glyphs: IconGlyphs,
): string => {
  if (percent === undefined) {
    return ' '.repeat(width)
  }
  const filled = Math.round((percent / 100) * width)
  const color = mix(DURABILITY_LOW, DURABILITY_HIGH, percent / 100)
  return (
    style.paint(glyphs.barFull.repeat(filled), color) +
    style.paint(glyphs.barEmpty.repeat(Math.max(0, width - filled)), FAINT)
  )
}

const SLOT_WIDTH = 12

/**
 * One hotbar slot.
 *
 * Selection is drawn as a DIFFERENT BORDER as well as a brighter colour. A
 * selected slot that differs only in hue is unreadable to the players
 * `domain/accessibility.ts` exists for, and the preview would have no standing
 * to measure anybody else's contrast if its own selection cue were colour-only.
 */
const hotbarSlot = (
  style: Style,
  slot: HudViewModel['hotbar'][number],
  glyphs: IconGlyphs,
): ReadonlyArray<string> => {
  const border = slot.selected ? SLOT_SELECTED : SLOT_BORDER
  const side = slot.selected ? glyphs.boxSideSelected : glyphs.boxSide
  const top = (slot.selected ? glyphs.boxTopSelected : glyphs.boxTop).repeat(SLOT_WIDTH + 2)
  const label = slot.empty ? '' : (slot.itemId ?? '')
  const shortened = label.length > SLOT_WIDTH - 2 ? `${label.slice(0, SLOT_WIDTH - 3)}~` : label
  const edge = style.paint(side, border)

  return [
    style.paint(top, border),
    `${edge}${style.paint(padEnd(` ${shortened}`, SLOT_WIDTH), slot.empty ? FAINT : INK)}${edge}`,
    `${edge}${style.paint(padStart(`${slot.countLabel ?? ''} `, SLOT_WIDTH), MUTED)}${edge}`,
    `${edge}${durabilityBar(style, slot.durabilityPercent, SLOT_WIDTH, glyphs)}${edge}`,
    style.paint(top, border),
    style.paint(
      padEnd(
        `  ${String(slot.index + 1)}${slot.selected ? ' held' : ''}${slot.empty ? ' empty' : ''}`,
        SLOT_WIDTH + 2,
      ),
      FAINT,
    ),
  ]
}

/**
 * Fields that disagree with each other, called out under the picture.
 *
 * Not a general validator — two specific disagreements the preview found, kept
 * here so that reproducing them is a keystroke rather than a memory. Both are in
 * this directory's README.md with the reasoning.
 */
const describeSlotAnomalies = (style: Style, view: HudViewModel): ReadonlyArray<string> => {
  const lines: Array<string> = []

  const ghostBars = view.hotbar.filter((slot) => slot.empty && slot.durabilityPercent !== undefined)
  for (const slot of ghostBars) {
    lines.push(
      style.paint(
        `  ! slot ${String(slot.index + 1)} is empty and still reports durabilityPercent ${String(slot.durabilityPercent)} — a bar under an empty slot`,
        BAD,
      ),
    )
  }

  const noneSelected = !view.hotbar.some((slot) => slot.selected)
  if (noneSelected) {
    lines.push(
      style.paint(
        '  ! no slot is selected — selectedHotbarIndex was clamped, and the clamp let a NaN through',
        BAD,
      ),
    )
  }

  const emptyRow = view.hearts.every((icon) => icon === 'empty')
  if (emptyRow && !view.dead) {
    lines.push(
      style.paint(
        '  ! every heart is empty but dead is false — the row was clamped and the flag was not',
        BAD,
      ),
    )
  }

  return lines
}

export const renderHud = (
  style: Style,
  snapshot: VitalsSnapshot,
  glyphs: IconGlyphs,
  columns: number,
): ReadonlyArray<string> => {
  const view = hudViewModel(snapshot)
  const icons = glyphs

  const hearts = iconRowLine(style, view.hearts, icons, {
    full: HEART_FULL,
    half: HEART_HALF,
    empty: HEART_EMPTY,
  })
  const shanks = iconRowLine(style, view.shanks, icons, {
    full: SHANK_FULL,
    half: SHANK_HALF,
    empty: SHANK_EMPTY,
  })

  const xpWidth = Math.max(10, Math.min(40, columns - 24))
  const xpFilled = Math.round((view.experiencePercent / 100) * xpWidth)
  const xpBar = `${style.paint(icons.barFull.repeat(xpFilled), XP_BAR)}${style.paint(icons.barEmpty.repeat(Math.max(0, xpWidth - xpFilled)), XP_TRACK)}`

  // The hotbar is drawn as six parallel rows so the slots sit side by side.
  const slotRows = view.hotbar.map((slot) => hotbarSlot(style, slot, icons))
  const visibleSlots = Math.max(1, Math.min(slotRows.length, Math.floor((columns - 2) / (SLOT_WIDTH + 2))))
  const hotbarLines = Array.from({ length: 6 }, (_, row) =>
    slotRows
      .slice(0, visibleSlots)
      .map((lines) => lines[row] ?? '')
      .join(''),
  )

  return [
    style.bold('HUD'),
    '',
    `${style.paint(padEnd('health', 8), MUTED)}${hearts}   ${style.paint(`${String(snapshot.healthPoints)}/${String(snapshot.maxHealthPoints)} points`, INK)}${view.dead ? style.paint('   DEAD', BAD) : ''}`,
    `${style.paint(padEnd('hunger', 8), MUTED)}${shanks}   ${style.paint(`${String(snapshot.hungerPoints)}/${String(snapshot.maxHungerPoints)} points`, INK)}`,
    `${style.paint(padEnd('xp', 8), MUTED)}${xpBar}  ${style.paint(view.experienceLevelLabel, XP_LEVEL)}  ${style.paint(`${String(view.experiencePercent)}%`, MUTED)}`,
    '',
    ...hotbarLines,
    '',
    style.dim('view model as returned by hudViewModel(snapshot) — the picture above draws only this'),
    style.dim(
      `  hearts  full ${String(countIcons(view.hearts, 'full'))}  half ${String(countIcons(view.hearts, 'half'))}  empty ${String(countIcons(view.hearts, 'empty'))}   (${String(view.hearts.length)} icons)`,
    ),
    style.dim(
      `  shanks  full ${String(countIcons(view.shanks, 'full'))}  half ${String(countIcons(view.shanks, 'half'))}  empty ${String(countIcons(view.shanks, 'empty'))}   (${String(view.shanks.length)} icons)`,
    ),
    style.dim(
      `  xp      level "${view.experienceLevelLabel}"  percent ${String(view.experiencePercent)}   dead ${String(view.dead)}`,
    ),
    style.dim(`  selected slot index ${String(view.hotbar.findIndex((slot) => slot.selected))}`),
    ...describeSlotAnomalies(style, view),
  ]
}
