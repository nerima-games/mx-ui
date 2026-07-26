/**
 * The inventory / crafting screen — and the honest report that it does not exist.
 *
 * A dev application, not shipped API.
 *
 * ---------------------------------------------------------------------------
 * What plan.md asks for, and what the repository has
 * ---------------------------------------------------------------------------
 *
 * plan.md §3.13 lists 「インベントリとクラフト」 among mx-ui's screens and asks for a
 * preview of each 「各画面を単体で起動できる状態モック付きプレビュー」. Four screens are
 * named; three of them have a view model in `domain/` and this one does not.
 *
 * `inventory` and `crafting` appear in exactly one place in the whole
 * repository: as two members of the `ScreenId` union in `domain/modal-stack.ts`,
 * which is a list of things that can be ON TOP OF THE STACK. There is no grid,
 * no slot model, no recipe matching, no "can this item stack with that one" —
 * nothing for a preview to mock state for.
 *
 * So this screen previews what does exist: the MODAL STACK behaviour that owns
 * opening and closing them, which is a real and load-bearing piece of design
 * (`domain/modal-stack.ts` — one Escape handler, one modal closed per press).
 * And it says, on screen, what is missing. A preview that drew a plausible
 * inventory grid out of the preview's own imagination would be the worst
 * possible outcome here: it would look like progress.
 */
import {
  gameplayInputSuppressed,
  pointerLockReleased,
  topOf,
  type ModalStack,
  type ScreenId,
} from '../../domain/modal-stack'
import { padEnd, type Style } from './ansi'
import { GOOD, INK, MUTED, WARN } from './palette'

export const renderInventory = (
  style: Style,
  stack: ModalStack,
  escapeLog: ReadonlyArray<string>,
  candidates: ReadonlyArray<ScreenId>,
): ReadonlyArray<string> => {
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
    style.paint('  THIS SCREEN HAS NO VIEW MODEL.', WARN),
    style.dim('  `inventory` and `crafting` exist in this repository only as two members of the'),
    style.dim('  ScreenId union in domain/modal-stack.ts. There is no slot grid, no stack-merging rule'),
    style.dim('  and no recipe matcher, so there is nothing to boot with mocked state yet.'),
    style.dim('  Drawing a plausible-looking grid here would make the gap invisible, so the preview'),
    style.dim('  shows the part that IS implemented: who owns opening and closing a modal.'),
    style.dim('  Not an oversight: mc-sim owns the inventory STATE (plan.md §2.3-1) and has not'),
    style.dim('  published its shape, so a derivation written now would invent the snapshot type it'),
    style.dim('  reads — and api-lock.md would publish that guess as this package’s surface.'),
    style.dim('  Pinned by test/view-model.test.ts, "GAP: inventory and crafting are screen ids".'),
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
            MUTED,
          ),
        ]
      : []),
  ]
}
