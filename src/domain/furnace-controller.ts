import { Effect, Result } from 'effect'
import {
  FurnaceService,
  type FurnaceState as SimFurnaceState,
  type FurnaceServiceApi,
  type FurnaceServiceError,
  type Inventory,
  type ItemStack,
  type WorldCommitCoordinator,
} from '@nerima-games/mc-sim'
import type { FurnaceSnapshot } from './furnace-view-model.js'

export type FurnaceSnapshotProjectionFailure = Readonly<{
  readonly _tag: 'FurnaceSnapshotProjectionFailure'
  readonly field: 'cookProgress'
  readonly missing: 'normalized-cook-progress'
  readonly cookProgressSecs: number
}>

export const furnaceSnapshotOf = (
  state: SimFurnaceState,
): Result.Result<FurnaceSnapshot, FurnaceSnapshotProjectionFailure> => {
  if (state.cookProgressSecs > 0) {
    return Result.fail({
      _tag: 'FurnaceSnapshotProjectionFailure',
      field: 'cookProgress',
      missing: 'normalized-cook-progress',
      cookProgressSecs: state.cookProgressSecs,
    })
  }

  const projectStack = (stack: ItemStack | undefined): FurnaceSnapshot['input'] =>
    stack === undefined ? undefined : { itemId: stack.item, count: stack.count }

  return Result.succeed({
    burnProgress: state.fuelTimeTotalSecs === 0
      ? 0
      : state.fuelTimeRemainingSecs / state.fuelTimeTotalSecs,
    cookProgress: 0,
    fuel: projectStack(state.fuel),
    input: projectStack(state.input),
    output: projectStack(state.output),
  })
}

type RequireFurnaceService<T> = T extends (
  ...args: infer Parameters
) => Effect.Effect<infer Success, infer Error, infer Requirements>
  ? (...args: Parameters) => Effect.Effect<Success, Error, FurnaceService | Requirements>
  : T extends Effect.Effect<infer Success, infer Error, infer Requirements>
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
  snapshot: Effect.flatMap(FurnaceService, (service) =>
    Effect.flatMap(service.snapshot, (state) => {
      const projection = furnaceSnapshotOf(state)
      return Result.isFailure(projection)
        ? Effect.fail(projection.failure)
        : Effect.succeed(projection.success)
    }),
  ),
  setInput: (input: ItemStack | undefined) =>
    Effect.flatMap(FurnaceService, (service) => service.setInput(input)),
  setFuel: (fuel: ItemStack | undefined) =>
    Effect.flatMap(FurnaceService, (service) => service.setFuel(fuel)),
  advance: (elapsedSecs: number) =>
    Effect.flatMap(FurnaceService, (service) => service.advance(elapsedSecs)),
  prepareCollectOutput: (inventory: Inventory) =>
    Effect.flatMap(FurnaceService, (service) => service.prepareCollectOutput(inventory)),
  prepareCollectExperience: Effect.flatMap(
    FurnaceService,
    (service) => service.prepareCollectExperience,
  ),
}
