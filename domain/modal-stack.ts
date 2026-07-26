/**
 * The modal stack, and who owns the Escape key.
 *
 * ---------------------------------------------------------------------------
 * The rule, and the reference's reason for it
 * ---------------------------------------------------------------------------
 *
 * plan.md §3.13: 「モーダルの Escape は stopPropagation、閉じる責務はフレーム側単一
 * ハンドラ(mc-render の入力設計と対)」. The other half of the pair is recorded in
 * the reference's input service, `packages/presentation/input/input-service.ts:172-178`:
 *
 *     Key listeners live on `window` (bubble phase) so modal overlays
 *     (inventory/settings/pause/chat) that consume a key with stopPropagation()
 *     on `document` shield it from gameplay input. Otherwise the frame-pipeline
 *     sees the same Escape one frame after the modal already handled it and acts
 *     on stale modal state.
 *
 * So there are two mechanisms and they do different jobs:
 *
 *   - `stopPropagation()` on `document`, in the modal, stops the keystroke
 *     reaching gameplay input. That is a DOM-level concern and belongs to the
 *     DOM layer.
 *   - The DECISION about what Escape means — close the top modal, or open the
 *     pause menu — belongs to ONE handler at frame level. This module is that
 *     decision, expressed as a pure function so it can be tested without a
 *     browser.
 *
 * The failure mode when the decision is distributed instead is specific and
 * nasty: two modals both listening for Escape means one keypress closes both,
 * and the player who pressed Escape once to leave the settings overlay finds
 * themselves back in the game with the pause menu gone too. The reference notes
 * the same class of problem at `session-runtime-overlays.ts:151` — 「paths
 * (Escape, M key, Save & Quit) with no shared open/close stream」.
 */

/**
 * Screens that can be on the modal stack.
 *
 * PROVISIONAL: the full set arrives with the screens themselves (plan.md §3.13
 * lists HUD, menus, inventory/crafting, settings, achievements and statistics).
 * The ORDER of this union is meaningless — the stack decides what is on top.
 */
export type ScreenId =
  | 'pause'
  | 'settings'
  | 'inventory'
  | 'crafting'
  | 'chat'
  | 'achievements'
  | 'statistics'

/** Innermost modal LAST, so `push` and `pop` operate on the end. */
export type ModalStack = ReadonlyArray<ScreenId>

export const emptyModalStack: ModalStack = []

export const topOf = (stack: ModalStack): ScreenId | undefined => stack[stack.length - 1]

/**
 * Open a screen.
 *
 * Re-opening a screen already on the stack RAISES it to the top rather than
 * pushing a duplicate. A duplicate would need two Escapes to close, which the
 * player experiences as "Escape didn't work".
 */
export const openScreen = (stack: ModalStack, screen: ScreenId): ModalStack => [
  ...stack.filter((existing) => existing !== screen),
  screen,
]

export const closeScreen = (stack: ModalStack, screen: ScreenId): ModalStack =>
  stack.filter((existing) => existing !== screen)

export type EscapeOutcome = {
  readonly stack: ModalStack
  /**
   * What the single frame-level handler should do next.
   *
   * `closed` — a modal was on top and has been dismissed.
   * `open-pause` — nothing was open, so Escape means "pause".
   */
  readonly action: 'closed' | 'open-pause'
  /** The screen that was dismissed, for the DOM layer to animate out. */
  readonly closed: ScreenId | undefined
}

/**
 * THE single decision point for Escape.
 *
 * One modal closes per press, top-down. Two consequences that read as bugs if
 * you get them wrong:
 *
 *   - Escape with settings over pause closes settings ONLY, leaving the pause
 *     menu up. Closing both is the "Escape didn't work, now I'm being eaten by
 *     a zombie" bug.
 *   - Escape with nothing open does not close anything; it opens the pause
 *     menu. That branch is the reason this returns an action rather than just a
 *     stack — the caller cannot infer "open pause" from an unchanged stack
 *     without re-deriving the decision, and a decision derived twice is a
 *     decision that will eventually be derived differently.
 */
export const escapePressed = (stack: ModalStack): EscapeOutcome => {
  const top = topOf(stack)
  if (top === undefined) {
    return { stack, action: 'open-pause', closed: undefined }
  }
  return { stack: stack.slice(0, -1), action: 'closed', closed: top }
}

/**
 * Whether gameplay input should be suppressed this frame.
 *
 * The DOM-level counterpart is `stopPropagation()` in the modal; this is the
 * frame-level counterpart, so that a stage which never sees a DOM event still
 * knows not to swing a pickaxe while the player is typing in chat.
 */
export const gameplayInputSuppressed = (stack: ModalStack): boolean => stack.length > 0

/**
 * Whether the pointer should be released.
 *
 * Same condition today, deliberately a separate function: the two diverge as
 * soon as there is a modal that wants pointer lock kept (a minimap overlay, a
 * transparent HUD editor), and finding every `stack.length > 0` at that point is
 * exactly the refactor nobody does correctly.
 */
export const pointerLockReleased = (stack: ModalStack): boolean => stack.length > 0
