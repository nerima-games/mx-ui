import { type UiQaNamespace, createUiQaNamespace } from './ui-qa.js'
import type { GameModule } from '@nerima-games/mc-kernel'
import { Layer } from 'effect'
import type { UiQaSnapshot } from '../domain/ui-qa.js'

export type UiGameModule = GameModule<never, never, never> & {
  readonly qa: UiQaNamespace
}

export const createUiModuleInstance = (
  frameStages: GameModule<never, never, never>['frameStages'],
  readUiQaSnapshot: () => UiQaSnapshot,
): UiGameModule => ({
  frameStages,
  layers: Layer.empty,
  qa: createUiQaNamespace(readUiQaSnapshot),
})
