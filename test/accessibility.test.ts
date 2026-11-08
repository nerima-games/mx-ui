/**
 * Accessibility regressions — the assets plan.md §3.13 asks to be carried over,
 * plus the Escape-key ownership rule that pairs with mc-render's input design.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect, Result } from 'effect'
import * as fc from 'fast-check'
import {
  createMotionPreferenceController,
  type MotionMediaQuery,
} from '../src/application/accessibility-dom'
import {
  animationDurationMs,
  COLOR_VISION_FILTER_TARGET,
  COLOR_VISION_MODES,
  colorVisionAttribute,
  decodeMotionSetting,
  rebind,
  resolveMotionPreference,
  shouldAnimate,
  unboundActions,
  type InputAction,
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

class FakeMotionMediaQuery implements MotionMediaQuery {
  readonly #listeners = new Set<() => void>()
  matches: boolean
  removedListenerCount = 0

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.#listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.removedListenerCount += 1
    this.#listeners.delete(listener)
  }

  change(matches: boolean): void {
    this.matches = matches
    for (const listener of this.#listeners) {
      listener()
    }
  }

  get listenerCount(): number {
    return this.#listeners.size
  }
}

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

describe('reduced motion DOM projection', () => {
  it('setting changes project immediately, system changes are followed, and disposal removes the listener', () => {
    const query = new FakeMotionMediaQuery(false)
    const observed: string[] = []
    const created = createMotionPreferenceController(query, 'system', (preference) => observed.push(preference))

    expect(Result.isSuccess(created)).toBe(true)
    if (Result.isFailure(created)) {
      return
    }

    expect(observed).toStrictEqual(['full'])
    expect(query.listenerCount).toBe(1)

    query.change(true)
    expect(observed).toStrictEqual(['full', 'reduced'])

    const explicitFull = created.success.update('full')
    expect(Result.isSuccess(explicitFull)).toBe(true)
    expect(observed).toStrictEqual(['full', 'reduced', 'full'])
    query.change(false)
    expect(observed).toStrictEqual(['full', 'reduced', 'full'])

    const system = created.success.update('system')
    expect(Result.isSuccess(system)).toBe(true)
    expect(observed).toStrictEqual(['full', 'reduced', 'full', 'full'])
    query.change(true)
    expect(observed).toStrictEqual(['full', 'reduced', 'full', 'full', 'reduced'])

    const invalid = created.success.update({ reducedMotion: 'reduced' })
    expect(Result.isFailure(invalid)).toBe(true)
    expect(observed).toStrictEqual(['full', 'reduced', 'full', 'full', 'reduced'])

    created.success.dispose()
    created.success.dispose()
    expect(query.listenerCount).toBe(0)
    expect(query.removedListenerCount).toBe(1)
    query.change(false)
    expect(observed).toStrictEqual(['full', 'reduced', 'full', 'full', 'reduced'])
    expect(Result.isFailure(created.success.update('reduced'))).toBe(true)
  })

  it('unknown settings return a typed failure or a schema-accepted motion setting without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const query = new FakeMotionMediaQuery(false)
        const observed: string[] = []
        const created = createMotionPreferenceController(query, input, (preference) => observed.push(preference))

        if (Result.isFailure(created)) {
          expect(created.failure).toBeDefined()
          expect(query.listenerCount).toBe(0)
          expect(observed).toStrictEqual([])
          return
        }

        const updated = created.success.update(input)
        if (Result.isFailure(updated)) {
          expect(updated.failure).toBeDefined()
        } else {
          expect(Result.isSuccess(decodeMotionSetting(updated.success))).toBe(true)
        }
        created.success.dispose()
      }),
    )

    for (const input of [null, undefined, 'animated', { _tag: 'MotionSetting' }]) {
      const result = decodeMotionSetting(input)
      expect(Result.isFailure(result)).toBe(true)
    }
  })
})

describe('legacy key remapping API', () => {
  it.effect('clears, reports conflicts, binds and lists unbound actions without changing the source map', () =>
    Effect.sync(() => {
      const bindings = new Map<InputAction, string>([
        ['jump', 'Space'],
        ['sneak', 'ShiftLeft'],
      ])

      const cleared = rebind(bindings, 'jump', 'Escape')
      const conflict = rebind(bindings, 'jump', 'ShiftLeft')
      const bound = rebind(bindings, 'jump', 'KeyJ')

      expect(cleared.kind).toBe('cleared')
      expect(cleared.kind === 'cleared' && cleared.bindings.has('jump')).toBe(false)
      expect(conflict).toStrictEqual({ heldBy: 'sneak', kind: 'conflict' })
      expect(bound.kind).toBe('bound')
      expect(bound.kind === 'bound' && bound.bindings.get('jump')).toBe('KeyJ')
      expect(unboundActions(bindings, ['jump', 'sprint'])).toStrictEqual(['sprint'])
      expect(bindings.get('jump')).toBe('Space')
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
