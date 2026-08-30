/**
 * The inventory / crafting screen.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * This screen used to be an apology
 * ---------------------------------------------------------------------------
 *
 * It said, on screen, THIS SCREEN HAS NO VIEW MODEL, and it was right to: there
 * was no slot grid and no derivation, and drawing a plausible-looking grid out
 * of the preview's own imagination would have made the gap look like progress.
 *
 * `domain/inventory-view-model.ts` exists now, so the screen draws it — and
 * draws the part that matters most, which is not the grid. It is the three
 * places the derivation answers `unknown`. mc-sim owns stacking rules and
 * recipe matching (plan.md §2.3-1), and where it has not answered, this screen
 * shows that it has not answered rather than the most plausible substitute.
 * Those are the states a plausible grid would have hidden, so they are drawn
 * loudly.
 *
 * The modal-stack half is kept. It was never a placeholder: one Escape handler,
 * one modal closed per press (DN-UI-4), and this remains the only screen that
 * exercises it.
 */
import {
  inventoryViewModel,
  INVENTORY_SLOT_COUNT,
  regionOf,
  type InventorySnapshot,
  type InventoryViewModel,
  type RegionId,
  type SlotRegion,
} from '../../src/domain/inventory-view-model'
import {
  gameplayInputSuppressed,
  pointerLockReleased,
  topOf,
  type ModalStack,
  type ScreenId,
} from '../../src/domain/modal-stack'
import { itemStack } from '@nerima-games/mc-sim'
import { padEnd, type Style } from './ansi'
import { BAD, FAINT, GOOD, INK, MUTED, SLOT_SELECTED, WARN } from './palette'

/** A mocked container, in the shape mc-sim's `snapshot` Effect resolves to. */
export const SAMPLE_INVENTORY: InventorySnapshot = {
  inventory: {
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
      if (index === 0) {
        return itemStack('diamond_pickaxe', 1)
      }
      if (index === 2) {
        return itemStack('torch', 64)
      }
      if (index === 11) {
        return itemStack('cobblestone', 48)
      }
      if (index === 19) {
        return itemStack('bread', 3)
      }
      return undefined
    }),
  },
  selectedHotbarIndex: 0,
  durabilityBySlot: new Map([[0, 0.82]]),
  carried: undefined,
  // Everything below is `undefined` because mc-sim genuinely has none of it,
  // and the preview must not supply what the game will not.
  armour: undefined,
  offhand: undefined,
  crafting: { gridWidth: 2, grid: Array.from({ length: 4 }), result: undefined },
  mergeableSlotIndices: undefined,
}

const slotCell = (style: Style, label: string, selected: boolean, empty: boolean): string =>
  style.paint(
    padEnd(selected ? `[${label}]` : ` ${label} `, 14),
    selected ? SLOT_SELECTED : empty ? FAINT : INK,
  )

const regionLines = (style: Style, region: SlotRegion | undefined, id: RegionId): ReadonlyArray<string> => {
  if (region === undefined) {
    return [`  ${style.paint(padEnd(id, 16), MUTED)}${style.dim('(absent)')}`]
  }

  if (region.kind === 'unknown') {
    // The load-bearing case. Four empty squares would tell the player they are
    // wearing no armour; mc-sim has said nothing at all, and those are
    // different screens.
    return [
      `  ${style.paint(padEnd(region.id, 16), MUTED)}${style.paint('UNKNOWN', WARN)}`,
      `  ${' '.repeat(16)}${style.dim(region.why)}`,
    ]
  }

  const rows: Array<string> = []
  for (let start = 0; start < region.slots.length; start += region.columns) {
    rows.push(
      `  ${style.paint(padEnd(start === 0 ? region.id : '', 16), MUTED)}${region.slots
        .slice(start, start + region.columns)
        .map((slot) =>
          slotCell(
            style,
            slot.empty
              ? '·'
              : `${(slot.itemId ?? '').slice(0, 9)}${slot.countLabel === undefined ? '' : ` x${slot.countLabel}`}`,
            slot.selected,
            slot.empty,
          ),
        )
        .join('')}`,
    )
  }

  const withDurability = region.slots.filter((slot) => slot.durabilityPercent !== undefined)
  if (withDurability.length > 0) {
    rows.push(
      `  ${' '.repeat(16)}${style.dim(
        withDurability
          .map((slot) => `slot ${String(slot.index + 1)} durability ${String(slot.durabilityPercent)}%`)
          .join('   '),
      )}`,
    )
  }
  return rows
}

const unknownLines = (style: Style, model: InventoryViewModel): ReadonlyArray<string> => [
  style.paint('what this repository refuses to answer', INK),
  style.dim('  mc-sim owns stacking rules and recipe matching (plan.md §2.3-1). Where it has not'),
  style.dim('  answered, the derivation reports `unknown` — which is a DIFFERENT screen from the'),
  style.dim('  plausible substitute, and differs exactly where a player would notice.'),
  '',
  `  ${style.paint(padEnd('crafting result', 20), MUTED)}${style.paint(
    model.crafting.kind,
    model.crafting.kind === 'unknown' ? WARN : GOOD,
  )}   ${style.dim(
    model.crafting.kind === 'unknown'
      ? '"unknown" is NOT "no-match": an empty output square would claim there is nothing to make'
      : 'mc-sim answered, so the screen can draw it',
  )}`,
  `  ${style.paint(padEnd('merge targets', 20), MUTED)}${style.paint(
    model.mergeTargets.kind,
    model.mergeTargets.kind === 'unknown' ? WARN : GOOD,
  )}   ${style.dim(
    'comparing itemIds here would reproduce a third of addItem() and get MAX_STACK_COUNT wrong',
  )}`,
  `  ${style.paint(padEnd('carried stack', 20), MUTED)}${style.dim(
    model.carried === undefined ? '(nothing on the cursor)' : (model.carried.itemId ?? '(empty)'),
  )}`,
]

export const renderInventory = (
  style: Style,
  stack: ModalStack,
  escapeLog: ReadonlyArray<string>,
  candidates: ReadonlyArray<ScreenId>,
): ReadonlyArray<string> => {
  const model = inventoryViewModel(SAMPLE_INVENTORY)
  const top = topOf(stack)

  const stackLines =
    stack.length === 0
      ? [style.dim('  (nothing open)')]
      : [...stack]
          .reverse()
          .map((screen, index) =>
            index === 0
              ? `  ${style.paint('top ->', MUTED)} ${style.paint(screen, INK)}   ${style.dim('Escape closes this one, and only this one')}`
              : `         ${style.dim(screen)}`,
          )

  return [
    style.bold('inventory / crafting'),
    '',
    style.dim(`  ${String(INVENTORY_SLOT_COUNT)} flat slots from mc-sim, split into regions by mx-ui — layout is this`),
    style.dim('  repository’s, the slots are mc-sim’s, and every cell below is projected by the SAME'),
    style.dim('  slotView() the hotbar uses, so the two screens cannot disagree about "empty".'),
    '',
    ...regionLines(style, regionOf(model, 'hotbar'), 'hotbar'),
    ...regionLines(style, regionOf(model, 'main'), 'main'),
    ...regionLines(style, regionOf(model, 'crafting-grid'), 'crafting-grid'),
    ...regionLines(style, regionOf(model, 'armour'), 'armour'),
    ...regionLines(style, regionOf(model, 'offhand'), 'offhand'),
    '',
    ...unknownLines(style, model),
    '',
    style.paint('modal stack', INK),
    ...stackLines,
    '',
    `  ${style.paint(padEnd('top of stack', 24), MUTED)}${style.paint(top ?? '(none)', INK)}`,
    `  ${style.paint(padEnd('gameplay input', 24), MUTED)}${style.paint(
      gameplayInputSuppressed(stack) ? 'suppressed' : 'live',
      gameplayInputSuppressed(stack) ? WARN : GOOD,
    )}   ${style.dim('so a stage that never sees a DOM event still knows not to swing a pickaxe')}`,
    `  ${style.paint(padEnd('pointer lock', 24), MUTED)}${style.paint(
      pointerLockReleased(stack) ? 'released' : 'held',
      pointerLockReleased(stack) ? WARN : GOOD,
    )}   ${style.dim('same condition today, a separate function on purpose')}`,
    '',
    style.paint('Escape, decided in one place', INK),
    style.dim('  Escape is NOT the quit key in this preview — it is the thing under test. Use x to quit.'),
    ...(escapeLog.length === 0
      ? [style.dim('  (press Escape to see what the single frame-level handler decides)')]
      : escapeLog.map((entry) => `  ${style.dim('·')} ${style.paint(entry, MUTED)}`)),
    '',
    style.dim(`  o opens the next of: ${candidates.join(', ')}`),
    style.dim('  open a screen twice: it is RAISED, not pushed — a duplicate would need two Escapes,'),
    style.dim('  which a player experiences as "Escape didn’t work".'),
    ...(stack.length > 1
      ? [
          style.paint(
            `  ${String(stack.length)} modals are open; one Escape must leave ${String(stack.length - 1)} of them up`,
            BAD,
          ),
        ]
      : []),
  ]
}
