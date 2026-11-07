import { Effect, Exit } from 'effect'
import * as Scope from 'effect/Scope'
import { AchievementToastEventBusLayer } from '../../src/application/achievement-toast-subscriber.js'
import { makeUiMount } from '../../src/application/ui-mount.js'
import { createSessionInput } from './session-input.js'

const requiredElement = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing session element: ${id}`)
  }
  return element
}

const startSessionPage = async (): Promise<void> => {
  const root = requiredElement('session-root')
  const actionOutput = requiredElement('session-action-output')
  const remapRoot = requiredElement('key-remap-root')
  const remapStatus = requiredElement('remap-status')
  const input = await createSessionInput({ actionOutput, remapRoot, remapStatus, root })
  const runtime = makeUiMount({ onInventoryAction: input.onInventoryAction, root })
  const scope = Scope.makeUnsafe()

  input.connect(runtime)
  await Effect.runPromise(
    runtime.start.pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.provide(AchievementToastEventBusLayer),
    ),
  )

  document.documentElement.dataset['sessionReady'] = '1'
  window.addEventListener(
    'pagehide',
    async () => {
      input.dispose()
      try {
        await Effect.runPromise(runtime.stop)
      } finally {
        await Effect.runPromise(Scope.close(scope, Exit.void))
      }
    },
    { once: true },
  )
}

startSessionPage().catch((error: unknown) => {
  document.documentElement.dataset['sessionError'] =
    error instanceof Error ? error.message : 'Session mount failed'
})
