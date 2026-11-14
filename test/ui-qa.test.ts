import {
  AchievementIdSchema,
  AngleRadians,
  DeltaTimeSecs,
  DimensionIdSchema,
  EntityIdSchema,
  SimulationTickSchema,
} from '@nerima-games/mc-kernel'
import { Effect, Result, Schema } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  AchievementToastIconSchema,
  AchievementToastSchema,
  AchievementToastTitleSchema,
  type AchievementToast,
} from '../src/domain/achievement-toast.js'
import {
  FramesPerSecondSchema,
  GpuTimeMillisecondsSchema,
  type DebugOverlayModel,
} from '../src/domain/debug-overlay.js'
import { UiQaStateInputSchema, UiQaStateSchema, uiQaStateFromSnapshot } from '../src/domain/ui-qa.js'
import { createUiQaNamespace } from '../src/application/ui-qa.js'

/* oxlint-disable no-magic-numbers */

const toast: AchievementToast = {
  achievement: Schema.decodeUnknownSync(AchievementIdSchema)('minecraft:story/mine_stone'),
  icon: Schema.decodeUnknownSync(AchievementToastIconSchema)('minecraft:wooden_pickaxe'),
  player: Schema.decodeUnknownSync(EntityIdSchema)('player:one'),
  tick: Schema.decodeUnknownSync(SimulationTickSchema)(7),
  title: Schema.decodeUnknownSync(AchievementToastTitleSchema)('Stone Age'),
}

const debugOverlay: DebugOverlayModel = {
  biome: null,
  chunk: null,
  coordinates: { worldX: 0, worldY: 64, worldZ: 0 },
  dimension: Schema.decodeUnknownSync(DimensionIdSchema)('overworld'),
  facing: { yawRadians: AngleRadians(-1.25), pitchRadians: AngleRadians(0) },
  fps: Schema.decodeUnknownSync(FramesPerSecondSchema)(60),
  frameDeltaSecs: DeltaTimeSecs(0),
  gpuTimingSupported: false,
  latestGpuTimeMs: Schema.decodeUnknownSync(GpuTimeMillisecondsSchema)(0),
  qualityPreset: null,
  worldTime: { dayLengthTicks: 24_000, ticks: 0 },
}

const projectionFailure = (projection: ReturnType<typeof uiQaStateFromSnapshot>) => {
  if ('failure' in projection) {
    return projection.failure
  }
  return null
}

const decodeUiQaState = Schema.decodeUnknownResult(UiQaStateSchema, {
  onExcessProperty: 'error',
})

describe('UI QA namespace', () => {
  it('projects visible feature state and uses null only for unavailable values', () => {
    expect(
      uiQaStateFromSnapshot({ achievementToast: toast, debugOverlay }),
    ).toStrictEqual({
      achievementToast: toast,
      debugOverlay: {
        biome: null,
        chunk: null,
        coordinates: { worldX: 0, worldY: 64, worldZ: 0 },
        dimension: 'overworld',
        facing: { yawRadians: AngleRadians(-1.25), pitchRadians: AngleRadians(0) },
        fps: 60,
        frameDeltaSecs: DeltaTimeSecs(0),
        gpuTimingSupported: false,
        latestGpuTimeMs: 0,
        qualityPreset: null,
        worldTime: { dayLengthTicks: 24_000, ticks: 0 },
      },
    })
  })

  it('rejects explicit null snapshot fields with typed failures', () => {
    const nullSnapshot = uiQaStateFromSnapshot(null)
    const nullAchievementToast = uiQaStateFromSnapshot({ achievementToast: null })
    const nullDebugOverlay = uiQaStateFromSnapshot({ debugOverlay: null })

    expect(projectionFailure(nullSnapshot)).toStrictEqual({
      _tag: 'InvalidUiQaSnapshot',
      field: 'snapshot',
    })
    expect(projectionFailure(nullAchievementToast)).toStrictEqual({
      _tag: 'InvalidUiQaSnapshot',
      field: 'achievementToast',
    })
    expect(projectionFailure(nullDebugOverlay)).toStrictEqual({
      _tag: 'InvalidUiQaSnapshot',
      field: 'debugOverlay',
    })
  })

  it('returns a typed snapshot failure when a getter changes during validation', () => {
    let reads = 0
    const unstableSnapshot = new Proxy({}, {
      get: (_target, property) => {
        if (property === 'debugOverlay') {
          reads += 1
          return reads === 1 ? null : undefined
        }
        return undefined
      },
    })

    expect(uiQaStateFromSnapshot(unstableSnapshot)).toStrictEqual(Result.fail({
      _tag: 'InvalidUiQaSnapshot',
      field: 'snapshot',
    }))
  })

  it('rejects malformed toast and debug-overlay structures with typed failures', () => {
    const malformedToast = { ...toast, unexpected: true }
    const malformedDebugFields = { ...debugOverlay, unexpected: true }
    const malformedDebugSchema = { ...debugOverlay, fps: 'fast' }
    const malformedCoordinates = {
      ...debugOverlay,
      coordinates: { worldX: 0, worldY: 64, worldZ: 0, unexpected: true },
    }
    const malformedFacing = {
      ...debugOverlay,
      facing: { pitchRadians: 0, yawRadians: -1.25, unexpected: true },
    }
    const malformedWorldTime = {
      ...debugOverlay,
      worldTime: { dayLengthTicks: 24_000, ticks: 0, unexpected: true },
    }

    expect(projectionFailure(uiQaStateFromSnapshot({ achievementToast: malformedToast }))).toStrictEqual({
      _tag: 'InvalidUiQaSnapshot',
      field: 'achievementToast',
    })
    for (const malformedState of [
      malformedDebugFields,
      malformedDebugSchema,
      malformedCoordinates,
      malformedFacing,
      malformedWorldTime,
    ]) {
      expect(projectionFailure(uiQaStateFromSnapshot({ debugOverlay: malformedState }))).toStrictEqual({
        _tag: 'InvalidUiQaSnapshot',
        field: 'debugOverlay',
      })
    }
  })

  it('rejects unexpected snapshot keys with a typed failure', () => {
    expect(projectionFailure(uiQaStateFromSnapshot({ unexpected: true }))).toStrictEqual({
      _tag: 'InvalidUiQaSnapshot',
      field: 'snapshot',
    })
  })

  it('returns a typed failure or schema-valid state for arbitrary snapshots', () => {
    fc.assert(
      fc.property(fc.anything(), (snapshot) => {
        const state = uiQaStateFromSnapshot(snapshot)
        if (projectionFailure(state) !== null) {
          return true
        }
        return Result.isSuccess(decodeUiQaState(state))
      }),
    )
  })

  it('observes current state through a read-only ui namespace', async () => {
    let currentDebugOverlay: DebugOverlayModel | undefined = debugOverlay
    let reads = 0
    const namespace = createUiQaNamespace(() => {
      reads += 1
      if (typeof currentDebugOverlay === 'undefined') {
        return {}
      }
      return { debugOverlay: currentDebugOverlay }
    })

    expect(namespace.name).toBe('ui')
    expect(namespace.observe.state.name).toBe('state')
    expect(Object.keys(namespace.command)).toStrictEqual([])
    await expect(Effect.runPromise(namespace.observe.state.run({}))).resolves.toStrictEqual({
      achievementToast: null,
      debugOverlay: uiQaStateFromSnapshot({ debugOverlay }).debugOverlay,
    })

    currentDebugOverlay = undefined
    await expect(Effect.runPromise(namespace.observe.state.run({}))).resolves.toStrictEqual({
      achievementToast: null,
      debugOverlay: null,
    })
    expect(reads).toBe(2)
  })

  it('rejects extra input keys instead of silently ignoring them', () => {
    expect(() =>
      Schema.decodeUnknownSync(UiQaStateInputSchema)({ unexpected: true }),
    ).toThrow(Schema.SchemaError)
  })

  it('rejects malformed nested output from the state reader', async () => {
    const malformedToast = { ...toast, unexpected: true }
    const namespace = createUiQaNamespace(() => ({
      achievementToast: malformedToast,
    }))
    const failure = await Effect.runPromise(Effect.flip(namespace.observe.state.run({})))

    expect(failure).toMatchObject({ _tag: 'InvalidUiQaSnapshot', field: 'achievementToast' })
  })

  it('rejects malformed output when consumers decode the output codec', () => {
    expect(() =>
      Schema.decodeUnknownSync(UiQaStateSchema, { onExcessProperty: 'error' })({
        achievementToast: null,
        debugOverlay: null,
        unexpected: true,
      }),
    ).toThrow(Schema.SchemaError)
  })

  it('requires both state sections and validates non-null nested fields', () => {
    const strictDecode = Schema.decodeUnknownSync(UiQaStateSchema, {
      onExcessProperty: 'error',
    })

    expect(() => strictDecode({ achievementToast: null })).toThrow(Schema.SchemaError)
    expect(() => strictDecode({ debugOverlay: null })).toThrow(Schema.SchemaError)
    expect(() => strictDecode(null)).toThrow(Schema.SchemaError)
    expect(() =>
      Schema.decodeUnknownSync(AchievementToastSchema, { onExcessProperty: 'error' })({
        achievement: 'minecraft:story/mine_stone',
        icon: 'minecraft:wooden_pickaxe',
        player: null,
        tick: 7,
        title: 'Stone Age',
      }),
    ).toThrow(Schema.SchemaError)
    expect(() =>
      strictDecode({
        achievementToast: null,
        debugOverlay: { ...uiQaStateFromSnapshot({ debugOverlay }).debugOverlay, fps: undefined },
      }),
    ).toThrow(Schema.SchemaError)
  })
})
