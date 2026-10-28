import {
  AchievementIdSchema,
  AngleRadians,
  DeltaTimeSecs,
  DimensionIdSchema,
  EntityIdSchema,
  SimulationTickSchema,
} from '@nerima-games/mc-kernel'
import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AchievementToastIconSchema,
  AchievementToastSchema,
  AchievementToastTitleSchema,
  type AchievementToast,
} from '../src/domain/achievement-toast.js'
import { FramesPerSecondSchema, type DebugOverlayModel } from '../src/domain/debug-overlay.js'
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
  biome: undefined,
  chunk: undefined,
  coordinates: { worldX: 0, worldY: 64, worldZ: 0 },
  dimension: Schema.decodeUnknownSync(DimensionIdSchema)('overworld'),
  facing: { yawRadians: AngleRadians(-1.25), pitchRadians: AngleRadians(0) },
  fps: Schema.decodeUnknownSync(FramesPerSecondSchema)(60),
  frameDeltaSecs: DeltaTimeSecs(0),
  gpuTimingSupported: false,
  latestGpuTimeMs: 0,
  qualityPreset: undefined,
  worldTime: { dayLengthTicks: 24_000, ticks: 0 },
}

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

  it('observes current state through a read-only ui namespace', async () => {
    let currentDebugOverlay: DebugOverlayModel | undefined = debugOverlay
    let reads = 0
    const namespace = createUiQaNamespace(() => {
      reads += 1
      return { achievementToast: undefined, debugOverlay: currentDebugOverlay }
    })

    expect(namespace.name).toBe('ui')
    expect(namespace.observe.state.name).toBe('state')
    expect(Object.keys(namespace.command)).toStrictEqual([])
    await expect(Effect.runPromise(namespace.observe.state.run({}))).resolves.toStrictEqual({
      achievementToast: null,
      debugOverlay: uiQaStateFromSnapshot({ achievementToast: undefined, debugOverlay }).debugOverlay,
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
      debugOverlay: undefined,
    }))
    const failure = await Effect.runPromise(Effect.flip(namespace.observe.state.run({})))

    expect(failure).toBeInstanceOf(Schema.SchemaError)
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
        debugOverlay: { ...uiQaStateFromSnapshot({ achievementToast: undefined, debugOverlay }).debugOverlay, fps: undefined },
      }),
    ).toThrow(Schema.SchemaError)
  })
})
