/**
 * The overlay flows the reference could only reach through a browser.
 *
 * ---------------------------------------------------------------------------
 * What was ported
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/e2e/ui/inventory-overlay.e2e.ts` and
 * `e2e/ui/settings-overlay.e2e.ts` press E, press Escape, click Resume and then
 * poll `getComputedStyle(el).display` to find out what happened. Every one of
 * those tests boots a game, waits for a frame counter and drives real keys, and
 * `docs/e2e-triage.md` §3.6 demoted them here because the thing they are actually
 * about — 「すべて `ui:overlay-sync` のモーダル状態機械で、世界が要らない」 — is a pure
 * function in `domain/modal-stack.ts`.
 *
 * ---------------------------------------------------------------------------
 * What is NOT here, and it is the same half every time
 * ---------------------------------------------------------------------------
 *
 * The KEY is not here. `application/dom-surface.ts` has no `addEventListener`
 * and must never have one (DN-UI-4), so "E opens the inventory" is two claims
 * with a boundary between them: mc-render notices the E and mx-ui decides what an
 * open means. Only the second is askable in this repository, and asking the first
 * would mean building the listener the surface exists to forbid.
 *
 * So these tests say "opening the inventory" where the reference said "pressing
 * E". That is not a weaker claim about the same thing — it is the whole claim
 * about the half mx-ui owns. The other half is `docs/e2e-triage.md`'s mc-render
 * column.
 *
 * The failure these defend against is the one `domain/modal-stack.ts` names: a
 * player presses Escape to leave the settings overlay, two handlers both act, the
 * pause menu vanishes with it, and they are standing in the world being eaten by
 * a zombie.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  closeScreen,
  emptyModalStack,
  escapePressed,
  gameplayInputSuppressed,
  openScreen,
  pointerLockReleased,
  topOf,
  type ModalStack,
} from '../src/domain/modal-stack'

/** Everything a frame-level handler can ask about "is a screen up". */
const isOpen = (stack: ModalStack, screen: Parameters<typeof openScreen>[1]): boolean =>
  stack.includes(screen)

describe('nothing is open at startup', () => {
  it.effect('REGRESSION: settings and inventory are both closed on the first frame', () =>
    Effect.sync(() => {
      // `<reference-impl>/e2e/smoke/boot.e2e.ts` 「settings and inventory
      // overlays are hidden at startup」 and `inventory-overlay.e2e.ts`
      // 「inventory overlay is hidden at startup」 — the same claim from two
      // files, and both of them booted a whole game to make it.
      //
      // What it defends against is a session that begins with a modal up: the
      // player lands in the world unable to move, because
      // `gameplayInputSuppressed` is true and nothing told them why.
      expect(isOpen(emptyModalStack, 'settings')).toBe(false)
      expect(isOpen(emptyModalStack, 'inventory')).toBe(false)
      expect(topOf(emptyModalStack)).toBeUndefined()
      expect(gameplayInputSuppressed(emptyModalStack)).toBe(false)
      expect(pointerLockReleased(emptyModalStack)).toBe(false)
    }),
  )
})

describe('the inventory toggles', () => {
  it.effect('REGRESSION: opening then closing returns to exactly the stack it started from', () =>
    Effect.sync(() => {
      // `inventory-overlay.e2e.ts` spent two tests on this — 「E key opens」 and
      // 「second E key closes」 — because a toggle that leaves residue is
      // invisible until the third press. Here the residue is assertable
      // directly: the stack after a round trip must be the stack before it, not
      // merely one that reports the inventory closed.
      const opened = openScreen(emptyModalStack, 'inventory')
      expect(isOpen(opened, 'inventory')).toBe(true)
      expect(gameplayInputSuppressed(opened)).toBe(true)

      const closed = closeScreen(opened, 'inventory')
      expect(closed).toStrictEqual(emptyModalStack)
      expect(gameplayInputSuppressed(closed)).toBe(false)
    }),
  )

  it.effect('a toggle under a chat window closes the inventory and leaves the chat up', () =>
    Effect.sync(() => {
      // The reference could not ask this: reaching two simultaneous overlays
      // needed a server connection for the chat panel. It is the case a toggle
      // implemented as 「clear the stack」 passes every single-screen test and
      // fails on — and the player's experience is their half-typed message
      // disappearing when they check their inventory.
      const stack = openScreen(openScreen(emptyModalStack, 'chat'), 'inventory')
      expect(closeScreen(stack, 'inventory')).toStrictEqual(['chat'])
    }),
  )

  it.effect('REGRESSION: Escape over the inventory closes it and does NOT also open pause', () =>
    Effect.sync(() => {
      // `inventory-overlay.e2e.ts` 「Escape key closes inventory overlay when
      // open」 gave up mid-test — 「After Escape, either inventory or settings may
      // be shown — game should remain functional」 — and settled for reading the
      // FPS counter. It could not tell which screen it was looking at, so it
      // asserted the game had not crashed.
      //
      // That is the assertion this port replaces, and the replacement is the
      // stronger one the reference wanted: one press, one screen, and the pause
      // menu specifically NOT opened underneath.
      const outcome = escapePressed(openScreen(emptyModalStack, 'inventory'))

      expect(outcome.action).toBe('closed')
      expect(outcome.closed).toBe('inventory')
      expect(outcome.stack).toStrictEqual(emptyModalStack)
      expect(isOpen(outcome.stack, 'pause')).toBe(false)
    }),
  )
})

describe('pause to settings and back to playing', () => {
  it.effect('REGRESSION: the whole round trip ends in a state the player can move in', () =>
    Effect.sync(() => {
      // `settings-overlay.e2e.ts` 「pause -> settings -> resume returns to active
      // gameplay state」, which is the most valuable of the nine because it is
      // the only one that follows the sequence to its end. The reference proved
      // the end by pressing E twice and watching the inventory answer.
      //
      // Every intermediate state is checked, because the bug this defends
      // against is not "the last step failed" — it is a stack that has quietly
      // kept a screen the player already dismissed, so that gameplay input stays
      // suppressed and the game appears to have frozen.
      const paused = openScreen(emptyModalStack, 'pause')
      expect(pointerLockReleased(paused)).toBe(true)

      const settings = openScreen(paused, 'settings')
      expect(topOf(settings)).toBe('settings')

      // Escape from settings: back to pause, and pause is STILL up. Closing both
      // here is the 「Escape didn't work, now I'm being eaten by a zombie」 bug.
      const afterEscape = escapePressed(settings)
      expect(afterEscape.stack).toStrictEqual(['pause'])
      expect(isOpen(afterEscape.stack, 'pause')).toBe(true)

      // Resume is a CLOSE of a named screen, not another Escape — the reference
      // clicked `[data-role="resume"]`. The two must agree on the result.
      const resumed = closeScreen(afterEscape.stack, 'pause')
      expect(resumed).toStrictEqual(emptyModalStack)
      expect(gameplayInputSuppressed(resumed)).toBe(false)
      expect(pointerLockReleased(resumed)).toBe(false)

      // And the reference's own proof that the session is live again: the
      // inventory still toggles.
      expect(closeScreen(openScreen(resumed, 'inventory'), 'inventory')).toStrictEqual(
        emptyModalStack,
      )
    }),
  )

  it.effect('closing settings by its button and by Escape reach the same stack', () =>
    Effect.sync(() => {
      // `settings-overlay.e2e.ts` tested 「#settings-close button closes overlay」
      // and 「second Escape key closes settings overlay」 as separate tests
      // against separate handlers. Two routes to one dismissal is exactly how
      // they drift, and the reference notes the same class of problem in its own
      // source (`session-runtime-overlays.ts:151`: 「paths (Escape, M key, Save &
      // Quit) with no shared open/close stream」).
      const stack = openScreen(openScreen(emptyModalStack, 'pause'), 'settings')

      expect(closeScreen(stack, 'settings')).toStrictEqual(escapePressed(stack).stack)
    }),
  )
})
