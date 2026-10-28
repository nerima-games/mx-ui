import { Effect, Result } from 'effect'
import {
  FurnaceService,
  type FurnaceServiceApi,
  type FurnaceServiceError,
  type Inventory,
  type ItemStack,
  type FurnaceState as SimFurnaceState,
  type WorldCommitCoordinator,
} from '@nerima-games/mc-sim'
import type { FurnaceSnapshot } from './furnace-view-model.js'

const ZERO = 0

export type FurnaceSnapshotProjectionFailure = Readonly<{
  readonly _tag: 'FurnaceSnapshotProjectionFailure'
  readonly field: 'cookProgress'
  readonly missing: 'normalized-cook-progress'
  readonly cookProgressSecs: number
}>

export const furnaceSnapshotOf = (
  state: SimFurnaceState,
): Result.Result<FurnaceSnapshot, FurnaceSnapshotProjectionFailure> => {
  if (state.cookProgressSecs > ZERO) {
    return Result.fail({
      _tag: 'FurnaceSnapshotProjectionFailure',
      cookProgressSecs: state.cookProgressSecs,
      field: 'cookProgress',
      missing: 'normalized-cook-progress',
    })
  }

  const projectStack = (stack: ItemStack | undefined): FurnaceSnapshot['input'] => {
    if (typeof stack === 'undefined') {
      return
    }
    return { count: stack.count, itemId: stack.item }
  }

  let burnProgress = ZERO
  if (state.fuelTimeTotalSecs !== ZERO) {
    burnProgress = state.fuelTimeRemainingSecs / state.fuelTimeTotalSecs
  }

  return Result.succeed({
    burnProgress,
    cookProgress: ZERO,
    fuel: projectStack(state.fuel),
    input: projectStack(state.input),
    output: projectStack(state.output),
  })
}

type RequireFurnaceService<Method> = Method extends (
  ...args: infer Parameters
) => Effect.Effect<infer Success, infer Error, infer Requirements>
  ? (...args: Parameters) => Effect.Effect<Success, Error, FurnaceService | Requirements>
  : Method extends Effect.Effect<infer Success, infer Error, infer Requirements>
    ? Effect.Effect<Success, Error, FurnaceService | Requirements>
    : never

type FurnaceControllerMethods = Pick<
  FurnaceServiceApi,
  'setInput' | 'setFuel' | 'advance' | 'prepareCollectOutput' | 'prepareCollectExperience'
>

type FurnaceController = {
  readonly [Key in keyof FurnaceControllerMethods]: RequireFurnaceService<FurnaceControllerMethods[Key]>
} & {
  readonly snapshot: Effect.Effect<
    FurnaceSnapshot,
    FurnaceServiceError | FurnaceSnapshotProjectionFailure,
    FurnaceService | WorldCommitCoordinator
  >
}

export const furnaceController: FurnaceController = {
  advance: (elapsedSecs: number) =>
    Effect.flatMap(FurnaceService, (service) => service.advance(elapsedSecs)),
  prepareCollectExperience: Effect.flatMap(
    FurnaceService,
    (service) => service.prepareCollectExperience,
  ),
  prepareCollectOutput: (inventory: Inventory) =>
    Effect.flatMap(FurnaceService, (service) => service.prepareCollectOutput(inventory)),
  setFuel: (fuel: ItemStack | undefined) =>
    Effect.flatMap(FurnaceService, (service) => service.setFuel(fuel)),
  setInput: (input: ItemStack | undefined) =>
    Effect.flatMap(FurnaceService, (service) => service.setInput(input)),
  snapshot: Effect.flatMap(FurnaceService, (service) =>
    Effect.flatMap(service.snapshot, (state) => {
      const projection = furnaceSnapshotOf(state)
      if (Result.isFailure(projection)) {
        return Effect.fail(projection.failure)
      }
      return Effect.succeed(projection.success)
    }),
  ),
}
