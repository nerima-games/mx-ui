/**
 * Accessibility regressions — the assets plan.md §3.13 asks to be carried over,
 * plus the Escape-key ownership rule that pairs with mc-render's input design.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  animationDurationMs,
  COLOR_VISION_FILTER_TARGET,
  COLOR_VISION_MODES,
  colorVisionAttribute,
  REBIND_CLEAR_KEYS,
  rebind,
  resolveMotionPreference,
  shouldAnimate,
  unboundActions,
  type InputAction,
  type KeyBindings,
} from '../src/domain/accessibility'
import {
  closeScreen,
  emptyModalStack,
  escapePressed,
  gameplayInputSuppressed,
  openScreen,
  pointerLockReleased,
  topOf,
} from '../src/domain/modal-stack'

const bindings = (entries: ReadonlyArray<readonly [InputAction, string]>): KeyBindings =>
  new Map(entries)

describe('colour vision (feColorMatrix daltonisation)', () => {
  it.effect('REGRESSION: the filter targets the canvas only, never the whole document', () =>
    Effect.sync(() => {
      // plan.md §3.13: 「canvasのみに適用」. Applying the per-pixel correction to
      // the whole document also transforms the UI chrome, which was authored
      // with deliberate, already-accessible contrast — so the "accessibility"
      // setting makes the HUD harder to read than it was.
      expect(COLOR_VISION_FILTER_TARGET).toBe('canvas')
    }),
  )

  it.effect('the mode set matches the reference exactly, so its saved settings stay readable', () =>
    Effect.sync(() => {
      // packages/game/application/settings.schema.ts:10-11
      expect([...COLOR_VISION_MODES]).toStrictEqual([
        'off',
        'protanopia',
        'deuteranopia',
        'tritanopia',
      ])
    }),
  )

  it.effect('"off" removes the attribute rather than setting it to a string', () =>
    Effect.sync(() => {
      // The reference deletes `body.dataset.colorVision` for `off`
      // (packages/presentation/hud/color-vision.ts:9-13). Setting it to the
      // literal "off" would need a matching CSS rule that nobody writes.
      expect(colorVisionAttribute('off')).toBeUndefined()
      expect(colorVisionAttribute('deuteranopia')).toBe('deuteranopia')
    }),
  )
})

describe('reduced motion', () => {
  it.effect('REGRESSION: the default defers to the OS, because asking again is asking too late', () =>
    Effect.sync(() => {
      // The reference seeds the same default from `prefers-reduced-motion:
      // reduce` (packages/core/domain/environment-port.ts:10-13). A player who
      // has already told their OS should not have to sit through a screenful of
      // animation to reach the setting that turns it off.
      expect(resolveMotionPreference('system', true)).toBe('reduced')
      expect(resolveMotionPreference('system', false)).toBe('full')
    }),
  )

  it.effect('an explicit choice overrides the OS in both directions', () =>
    Effect.sync(() => {
      expect(resolveMotionPreference('full', true)).toBe('full')
      expect(resolveMotionPreference('reduced', false)).toBe('reduced')
    }),
  )

  it.effect('REGRESSION: reduced motion means zero duration, not a shorter one', () =>
    Effect.sync(() => {
      // A 100 ms screen shake is still a screen shake. The setting exists for
      // people who get motion sick, not for people who are impatient.
      expect(animationDurationMs(400, 'reduced')).toBe(0)
      expect(animationDurationMs(400, 'full')).toBe(400)
      expect(shouldAnimate('reduced')).toBe(false)
      expect(shouldAnimate('full')).toBe(true)
    }),
  )

  it.effect('a negative base duration is clamped rather than producing a negative animation', () =>
    Effect.sync(() => {
      expect(animationDurationMs(-10, 'full')).toBe(0)
    }),
  )
})

describe('key remapping', () => {
  it.effect('REGRESSION: Escape and Backspace CLEAR a binding instead of being bound to it', () =>
    Effect.sync(() => {
      // packages/presentation/settings/settings-overlay.ts:174-178. Escape has
      // to clear: a player who opens the rebind field by accident needs an exit
      // that does not bind Escape to "sneak". Once it is bound to sneak, the
      // pause menu is unreachable.
      expect([...REBIND_CLEAR_KEYS].sort()).toStrictEqual(['Backspace', 'Escape'])

      const start = bindings([['jump', 'Space']])
      const cleared = rebind(start, 'jump', 'Escape')

      expect(cleared.kind).toBe('cleared')
      if (cleared.kind === 'cleared') {
        expect(cleared.bindings.has('jump')).toBe(false)
      }
    }),
  )

  it.effect('REGRESSION: a conflict is reported, never silently resolved', () =>
    Effect.sync(() => {
      // Automatically unbinding the other action is how a player ends up unable
      // to jump with no idea why.
      const start = bindings([
        ['jump', 'Space'],
        ['sneak', 'ShiftLeft'],
      ])
      const result = rebind(start, 'sneak', 'Space')

      expect(result).toStrictEqual({ kind: 'conflict', heldBy: 'jump' })
      // And the original bindings are untouched.
      expect(start.get('jump')).toBe('Space')
    }),
  )

  it.effect('rebinding an action to the key it already holds is idempotent, not a self-conflict', () =>
    Effect.sync(() => {
      const start = bindings([['jump', 'Space']])
      const result = rebind(start, 'jump', 'Space')

      expect(result.kind).toBe('bound')
      if (result.kind === 'bound') {
        expect(result.bindings.get('jump')).toBe('Space')
      }
    }),
  )

  it.effect('binding is immutable: the map passed in is never modified', () =>
    Effect.sync(() => {
      const start = bindings([['jump', 'Space']])
      const result = rebind(start, 'sneak', 'ShiftLeft')

      expect(start.has('sneak')).toBe(false)
      if (result.kind === 'bound') {
        expect(result.bindings.get('sneak')).toBe('ShiftLeft')
      }
    }),
  )

  it.effect('unbound actions are reported so the screen can show them rather than hide them', () =>
    Effect.sync(() => {
      const start = bindings([['jump', 'Space']])
      expect(unboundActions(start, ['jump', 'sneak', 'sprint'])).toStrictEqual(['sneak', 'sprint'])
    }),
  )
})

describe('Escape belongs to ONE frame-level handler', () => {
  it.effect('REGRESSION: Escape closes exactly one modal, top-down', () =>
    Effect.sync(() => {
      // plan.md §3.13: 「閉じる責務はフレーム側単一ハンドラ」. Two modals both
      // listening for Escape means one keypress closes both — the "Escape didn't
      // work, now I'm being eaten by a zombie" bug.
      const stack = openScreen(openScreen(emptyModalStack, 'pause'), 'settings')
      const outcome = escapePressed(stack)

      expect(outcome.action).toBe('closed')
      expect(outcome.closed).toBe('settings')
      expect(outcome.stack).toStrictEqual(['pause'])
    }),
  )

  it.effect('REGRESSION: Escape with nothing open opens the pause menu, and says so explicitly', () =>
    Effect.sync(() => {
      const outcome = escapePressed(emptyModalStack)
      expect(outcome).toStrictEqual({
        stack: emptyModalStack,
        action: 'open-pause',
        closed: undefined,
      })
      // The action is returned rather than inferred. A caller that had to
      // re-derive "the stack did not change, so open pause" would be deriving
      // the decision a second time — and a decision derived twice eventually
      // gets derived differently.
    }),
  )

  it.effect('REGRESSION: re-opening a screen raises it instead of pushing a duplicate', () =>
    Effect.sync(() => {
      // A duplicate needs two Escapes to close, which the player experiences as
      // "Escape didn't work".
      const stack = openScreen(openScreen(openScreen(emptyModalStack, 'inventory'), 'chat'), 'inventory')
      expect(stack).toStrictEqual(['chat', 'inventory'])
      expect(topOf(stack)).toBe('inventory')
      expect(escapePressed(stack).stack).toStrictEqual(['chat'])
    }),
  )

  it.effect('closing a screen that is not on top removes only that screen', () =>
    Effect.sync(() => {
      const stack = openScreen(openScreen(emptyModalStack, 'pause'), 'settings')
      expect(closeScreen(stack, 'pause')).toStrictEqual(['settings'])
    }),
  )

  it.effect('gameplay input and pointer lock are suppressed whenever anything is open', () =>
    Effect.sync(() => {
      // The frame-level counterpart to `stopPropagation()` in the modal: a stage
      // that never sees a DOM event still must not swing a pickaxe while the
      // player is typing in chat.
      expect(gameplayInputSuppressed(emptyModalStack)).toBe(false)
      expect(pointerLockReleased(emptyModalStack)).toBe(false)

      const chatting = openScreen(emptyModalStack, 'chat')
      expect(gameplayInputSuppressed(chatting)).toBe(true)
      expect(pointerLockReleased(chatting)).toBe(true)
    }),
  )
})
