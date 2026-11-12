// @vitest-environment jsdom

import { DomainEventBusLayer, EventSubscriberCapacitySchema } from '@nerima-games/mc-sim'
import { Deferred, Effect, Fiber, Schema } from 'effect'
import * as Scope from 'effect/Scope'
import { describe, expect, it, vi } from 'vitest'

const TOAST_BUS_CAPACITY = Schema.decodeUnknownSync(EventSubscriberCapacitySchema)(64)
const SCOPE_STATE_TAG = '_tag' as const

describe('UiMount startup interruption', () => {
  it('closes the toast scope if startup is interrupted while subscribing', async () => {
    const subscriberEntered = Deferred.makeUnsafe<void>()
    let toastScope: Scope.Scope | null = null

    vi.doMock('../src/application/achievement-toast-subscriber.js', () => ({
      startAchievementToastSubscriber: (): Effect.Effect<never, never, Scope.Scope> =>
        Effect.gen(function* mockSubscriber() {
          toastScope = yield* Scope.Scope
          Deferred.doneUnsafe(subscriberEntered, Effect.void)
          return yield* Effect.never
        }),
    }))

    try {
      const { makeUiMount } = await import('../src/application/ui-mount.js')
      const root = document.createElement('main')
      const runtime = makeUiMount({ root })

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const fiber = yield* runtime.start.pipe(Effect.forkChild)
            yield* Deferred.await(subscriberEntered)
            yield* Fiber.interrupt(fiber)
            expect(toastScope?.state[SCOPE_STATE_TAG]).toBe('Closed')
            expect(runtime.current()).toBeUndefined()
            expect(root.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
            yield* runtime.stop
          }).pipe(Effect.provide(DomainEventBusLayer(TOAST_BUS_CAPACITY))),
        ),
      )
    } finally {
      vi.doUnmock('../src/application/achievement-toast-subscriber.js')
    }
  })

  it('destroys the main menu if its initial render fails', async () => {
    const destroyMenu = vi.fn()
    vi.doMock('../src/application/main-menu-view.js', () => ({
      createMainMenuView: () => ({
        destroy: destroyMenu,
        render: () => {
          throw new Error('main menu render failed')
        },
        root: document.createElement('div'),
      }),
    }))

    try {
      vi.resetModules()
      const { makeUiMount } = await import('../src/application/ui-mount.js')
      const root = document.createElement('main')
      const runtime = makeUiMount({ root })

      await expect(
        Effect.runPromise(
          Effect.scoped(runtime.start.pipe(Effect.provide(DomainEventBusLayer(TOAST_BUS_CAPACITY)))),
        ),
      ).rejects.toThrow('Failed to mount mx-ui')
      expect(destroyMenu).toHaveBeenCalledOnce()
      expect(root.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
    } finally {
      vi.doUnmock('../src/application/main-menu-view.js')
      vi.resetModules()
    }
  })
})
