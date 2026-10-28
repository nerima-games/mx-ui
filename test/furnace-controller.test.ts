import { describe, expect, it } from '@effect/vitest'
import * as fc from 'fast-check'
import { Effect, Layer, Result, Schema } from 'effect'
import { WorldIdSchema, type ItemType } from '@nerima-games/mc-kernel'
import {
  FurnaceFailureSchema,
  FurnaceService,
  FurnaceServiceStateSchema,
  FurnaceSnapshotValidationResultSchema,
  FurnaceStateSchema,
  FurnaceStateValidationFailureSchema,
  ReplicatedOwnerIdSchema,
  WorldCommitCoordinator,
  countOf,
  emptyInventory,
  itemStack,
  makeFurnaceService,
  makeFurnaceServiceRegistration,
  makeWorldCommitCoordinator,
  type ItemStack,
  type ItemStackFailure,
} from '@nerima-games/mc-sim'
import { furnaceController, furnaceSnapshotOf } from '../src/domain/furnace-controller'

const itemStackEffect = (
  item: ItemType,
  count: number,
): Effect.Effect<ItemStack, ItemStackFailure> => {
  const result = itemStack(item, count)
  return Result.isFailure(result)
    ? Effect.fail(result.failure)
    : Effect.succeed(result.success)
}

const strictSchemaOptions = { onExcessProperty: 'error' } as const
const decodeFurnaceState = Schema.decodeUnknownResult(FurnaceStateSchema, strictSchemaOptions)
const decodeFurnaceServiceState = Schema.decodeUnknownResult(
  FurnaceServiceStateSchema,
  strictSchemaOptions,
)
const decodeFurnaceFailure = Schema.decodeUnknownResult(FurnaceFailureSchema, strictSchemaOptions)
const decodeFurnaceSnapshotValidation = Schema.decodeUnknownResult(
  FurnaceSnapshotValidationResultSchema,
  strictSchemaOptions,
)
const decodeFurnaceStateValidationFailure = Schema.decodeUnknownResult(
  FurnaceStateValidationFailureSchema,
  strictSchemaOptions,
)

const furnaceStateInput = {
  station: 'furnace',
  input: undefined,
  fuel: undefined,
  output: undefined,
  fuelTimeRemainingSecs: 0,
  fuelTimeTotalSecs: 0,
  cookProgressSecs: 0,
}
const furnaceServiceStateInput = { furnace: furnaceStateInput, experience: 0 }
const furnaceStateValidationFailureInput = {
  _tag: 'FurnaceStateValidationFailure',
  path: 'input',
  reason: 'invalid',
}
const furnaceStateFields = [
  'station',
  'input',
  'fuel',
  'output',
  'fuelTimeRemainingSecs',
  'fuelTimeTotalSecs',
  'cookProgressSecs',
] as const
const furnaceDurationFields = [
  'fuelTimeRemainingSecs',
  'fuelTimeTotalSecs',
  'cookProgressSecs',
] as const
const nonNegativeFiniteSeconds = fc.double({
  min: 0,
  max: Number.MAX_VALUE,
  noNaN: true,
  noDefaultInfinity: true,
})
const cookingStation = fc.constantFrom('furnace', 'blast_furnace', 'smoker')
const withoutField = (value: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))
const furnaceStateWithDuration = (field: (typeof furnaceDurationFields)[number], value: number) =>
  field === 'fuelTimeRemainingSecs'
    ? { ...furnaceStateInput, fuelTimeRemainingSecs: value, fuelTimeTotalSecs: value }
    : { ...furnaceStateInput, [field]: value }

const makeFurnaceFixture = Effect.gen(function* () {
  const ownerId = Schema.decodeUnknownSync(ReplicatedOwnerIdSchema)('furnace-controller-test')
  const world = Schema.decodeUnknownSync(WorldIdSchema)('furnace-controller-world')
  const registration = makeFurnaceServiceRegistration(ownerId)
  if (Result.isFailure(registration)) {
    return yield* Effect.fail(registration.failure)
  }

  const coordinator = yield* makeWorldCommitCoordinator({
    world,
    owners: [registration.success],
    dimensions: [],
  })
  const service = yield* makeFurnaceService(ownerId)
  return {
    layer: Layer.mergeAll(
      Layer.succeed(WorldCommitCoordinator, coordinator),
      Layer.succeed(FurnaceService, service),
    ),
    ownerId,
  }
})

describe('furnace controller', () => {
  it.effect('uses published furnace recipes, fuel, progress, and slot behavior', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFurnaceFixture
      const input = yield* itemStackEffect('raw_gold', 2)
      const fuel = yield* itemStackEffect('oak_log', 2)

      const initial = yield* furnaceController.snapshot.pipe(Effect.provide(fixture.layer))
      expect(initial).toStrictEqual({
        burnProgress: 0,
        cookProgress: 0,
        fuel: undefined,
        input: undefined,
        output: undefined,
      })

      yield* furnaceController.setInput(input).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.setFuel(fuel).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.advance(10).pipe(Effect.provide(fixture.layer))

      const snapshot = yield* furnaceController.snapshot.pipe(Effect.provide(fixture.layer))
      expect(snapshot.input).toStrictEqual({ itemId: 'raw_gold', count: 1 })
      expect(snapshot.output).toStrictEqual({ itemId: 'gold_ingot', count: 1 })
      expect(snapshot.fuel).toStrictEqual({ itemId: 'oak_log', count: 1 })
      expect(snapshot.burnProgress).toBeCloseTo(1 / 3)
      expect(snapshot.cookProgress).toBe(0)
    }),
  )

  it.effect('prepares output and experience collection as candidates for the host commit', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFurnaceFixture
      const input = yield* itemStackEffect('raw_gold', 1)
      const fuel = yield* itemStackEffect('oak_log', 1)

      yield* furnaceController.setInput(input).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.setFuel(fuel).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.advance(10).pipe(Effect.provide(fixture.layer))

      const outputCandidate = yield* furnaceController.prepareCollectOutput(emptyInventory()).pipe(
        Effect.provide(fixture.layer),
      )
      const experienceCandidate = yield* furnaceController.prepareCollectExperience.pipe(
        Effect.provide(fixture.layer),
      )

      expect(outputCandidate.outcome.result._tag).toBe('Collected')
      expect(countOf(outputCandidate.outcome.inventory, 'gold_ingot')).toBe(1)
      expect(experienceCandidate.experience).toBe(1)
      expect(experienceCandidate.expectedRevision).toBe(outputCandidate.expectedRevision)

      if (
        outputCandidate.ownerCandidate === undefined ||
        experienceCandidate.ownerCandidate === undefined
      ) {
        return yield* Effect.die('successful collection must return owner candidates')
      }
      const outputState = Schema.decodeUnknownSync(FurnaceServiceStateSchema)(
        outputCandidate.ownerCandidate.state,
      )
      const experienceState = Schema.decodeUnknownSync(FurnaceServiceStateSchema)(
        experienceCandidate.ownerCandidate.state,
      )
      const commit = Effect.flatMap(WorldCommitCoordinator, (coordinator) =>
        coordinator.commit({
          expectedRevision: outputCandidate.expectedRevision,
          expectedDimensions: [],
          changes: [
            {
              ownerId: outputCandidate.ownerCandidate.ownerId,
              state: {
                furnace: outputState.furnace,
                experience: experienceState.experience,
              },
            },
          ],
        }),
      )
      yield* commit.pipe(Effect.provide(fixture.layer))

      const afterCollect = yield* furnaceController.snapshot.pipe(Effect.provide(fixture.layer))
      const replicatedState = yield* Effect.flatMap(WorldCommitCoordinator, (coordinator) =>
        coordinator.snapshot(fixture.ownerId, FurnaceServiceStateSchema),
      ).pipe(Effect.provide(fixture.layer))
      expect(afterCollect.output).toBeUndefined()
      expect(replicatedState.state.experience).toBe(0)
    }),
  )

  it.effect('preserves itemStack construction failures as typed failures', () =>
    Effect.gen(function* () {
      const invalid = itemStack('raw_gold', 0)
      if (Result.isSuccess(invalid)) {
        return yield* Effect.die('zero-count itemStack unexpectedly succeeded')
      }

      const failure = yield* Effect.flip(itemStackEffect('raw_gold', 0))
      expect(failure).toStrictEqual(invalid.failure)
    }),
  )

  it.effect('returns a typed gap when sim exposes only in-progress cook seconds', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFurnaceFixture
      const input = yield* itemStackEffect('raw_gold', 1)
      const fuel = yield* itemStackEffect('oak_log', 1)

      yield* furnaceController.setInput(input).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.setFuel(fuel).pipe(Effect.provide(fixture.layer))
      yield* furnaceController.advance(5).pipe(Effect.provide(fixture.layer))

      const failure = yield* Effect.flip(
        furnaceController.snapshot.pipe(Effect.provide(fixture.layer)),
      )
      expect(failure).toStrictEqual({
        _tag: 'FurnaceSnapshotProjectionFailure',
        field: 'cookProgress',
        missing: 'normalized-cook-progress',
        cookProgressSecs: 5,
      })
    }),
  )

  it('validates fixed-duration boundaries and the just-outside values', () => {
    for (const field of furnaceDurationFields) {
      for (const value of [0, Number.MAX_VALUE]) {
        fc.assert(
          fc.property(fc.constant(value), (boundary) => {
            const decoded = decodeFurnaceState(furnaceStateWithDuration(field, boundary))
            expect(Result.isSuccess(decoded)).toBe(true)
          }),
          { numRuns: 1 },
        )
      }

      for (const value of [-Number.MIN_VALUE, Number.POSITIVE_INFINITY]) {
        fc.assert(
          fc.property(fc.constant(value), (outside) => {
            const decoded = decodeFurnaceState(furnaceStateWithDuration(field, outside))
            expect(Result.isFailure(decoded)).toBe(true)
          }),
          { numRuns: 1 },
        )
      }
    }

    const justAboveTotal = 1 + Number.EPSILON
    fc.assert(
      fc.property(fc.constant(justAboveTotal), (remaining) => {
        const decoded = decodeFurnaceState({
          ...furnaceStateInput,
          fuelTimeRemainingSecs: remaining,
          fuelTimeTotalSecs: 1,
        })
        expect(Result.isFailure(decoded)).toBe(true)
      }),
      { numRuns: 1 },
    )
  })

  it('projects generated valid service snapshot states decoded by the public schema', () => {
    const cookProgressSecs = fc.oneof(
      fc.constant(0),
      fc.double({
        min: Number.MIN_VALUE,
        max: Number.MAX_VALUE,
        noNaN: true,
        noDefaultInfinity: true,
      }),
    )
    const fuelFraction = fc.double({ min: 0, max: 1, noNaN: true })

    fc.assert(
      fc.property(
        cookingStation,
        nonNegativeFiniteSeconds,
        fuelFraction,
        cookProgressSecs,
        (station, fuelTimeTotalSecs, fraction, cookProgress) => {
          const fuelTimeRemainingSecs = fuelTimeTotalSecs * fraction
          const decoded = decodeFurnaceState({
            ...furnaceStateInput,
            station,
            fuelTimeRemainingSecs,
            fuelTimeTotalSecs,
            cookProgressSecs: cookProgress,
          })
          expect(Result.isSuccess(decoded)).toBe(true)
          if (Result.isFailure(decoded)) return

          const projection = furnaceSnapshotOf(decoded.success)
          expect(Result.isFailure(projection)).toBe(cookProgress > 0)
          if (Result.isFailure(projection)) {
            expect(projection.failure).toStrictEqual({
              _tag: 'FurnaceSnapshotProjectionFailure',
              field: 'cookProgress',
              missing: 'normalized-cook-progress',
              cookProgressSecs: cookProgress,
            })
            return
          }

          expect(projection.success).toStrictEqual({
            burnProgress: fuelTimeTotalSecs === 0
              ? 0
              : fuelTimeRemainingSecs / fuelTimeTotalSecs,
            cookProgress: 0,
            fuel: undefined,
            input: undefined,
            output: undefined,
          })
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects missing, null, and excess fields with published strict schemas', () => {
    for (const field of furnaceStateFields) {
      fc.assert(
        fc.property(fc.constant(field), (missingField) => {
          expect(
            Result.isFailure(decodeFurnaceState(withoutField(furnaceStateInput, missingField))),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
      fc.assert(
        fc.property(fc.constant(field), (nullField) => {
          expect(
            Result.isFailure(decodeFurnaceState({ ...furnaceStateInput, [nullField]: null })),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
    }

    for (const field of ['furnace', 'experience'] as const) {
      fc.assert(
        fc.property(fc.constant(field), (missingField) => {
          expect(
            Result.isFailure(
              decodeFurnaceServiceState(withoutField(furnaceServiceStateInput, missingField)),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
      fc.assert(
        fc.property(fc.constant(field), (nullField) => {
          expect(
            Result.isFailure(
              decodeFurnaceServiceState({ ...furnaceServiceStateInput, [nullField]: null }),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
    }

    for (const field of ['path', 'reason'] as const) {
      fc.assert(
        fc.property(fc.constant(field), (missingField) => {
          expect(
            Result.isFailure(
              decodeFurnaceStateValidationFailure(
                withoutField(furnaceStateValidationFailureInput, missingField),
              ),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
      fc.assert(
        fc.property(fc.constant(field), (nullField) => {
          expect(
            Result.isFailure(
              decodeFurnaceStateValidationFailure({
                ...furnaceStateValidationFailureInput,
                [nullField]: null,
              }),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
    }

    const validValidationResult = { _tag: 'Valid', state: furnaceStateInput }
    for (const field of ['_tag', 'state'] as const) {
      fc.assert(
        fc.property(fc.constant(field), (missingField) => {
          expect(
            Result.isFailure(
              decodeFurnaceSnapshotValidation(
                withoutField(validValidationResult, missingField),
              ),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
      fc.assert(
        fc.property(fc.constant(field), (nullField) => {
          expect(
            Result.isFailure(
              decodeFurnaceSnapshotValidation({ ...validValidationResult, [nullField]: null }),
            ),
          ).toBe(true)
        }),
        { numRuns: 1 },
      )
    }

    fc.assert(
      fc.property(fc.string(), (suffix) => {
        const extraField = `extra:${suffix}`
        expect(
          Result.isFailure(
            decodeFurnaceState({ ...furnaceStateInput, [extraField]: true }),
          ),
        ).toBe(true)
        expect(
          Result.isFailure(
            decodeFurnaceServiceState({ ...furnaceServiceStateInput, [extraField]: true }),
          ),
        ).toBe(true)
        expect(
          Result.isFailure(
            decodeFurnaceStateValidationFailure({
              ...furnaceStateValidationFailureInput,
              [extraField]: true,
            }),
          ),
        ).toBe(true)
        expect(
          Result.isFailure(
            decodeFurnaceSnapshotValidation({ ...validValidationResult, [extraField]: true }),
          ),
        ).toBe(true)
      }),
    )
  })

  it('rejects unknown tags in the published furnace unions', () => {
    fc.assert(
      fc.property(fc.string(), (suffix) => {
        const unknownTag = `unknown-${suffix}`
        expect(Result.isFailure(decodeFurnaceFailure({ _tag: unknownTag }))).toBe(true)
        expect(Result.isFailure(decodeFurnaceSnapshotValidation({ _tag: unknownTag }))).toBe(true)
      }),
    )
  })
})
