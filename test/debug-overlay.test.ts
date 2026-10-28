import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { DeltaTimeSecs, MonotonicTimeSecs } from '@nerima-games/mc-kernel'
import {
  INITIAL_PLAYER_DIMENSION,
  INITIAL_PLAYER_POSE,
  cameraPoseOf,
  type PlayerServiceApi,
  type TimeServiceApi,
} from '@nerima-games/mc-sim'
import {
  debugOverlayModel,
  FramesPerSecondSchema,
  type DebugOverlaySnapshot,
} from '../src/domain/debug-overlay'

type EffectValue<T> = T extends import('effect').Effect.Effect<infer TValue, infer _Error, infer _Requirements>
  ? TValue
  : never

const cameraPose = (yawRadians: number, pitchRadians: number): EffectValue<PlayerServiceApi['cameraPose']> => {
  const result = cameraPoseOf(
    { ...INITIAL_PLAYER_POSE, yawRadians, pitchRadians },
    MonotonicTimeSecs(0),
  )
  if (Result.isSuccess(result)) {
    return result.success
  }
  throw new Error('expected camera pose to be valid')
}

const frame = (deltaSecs: number): NonNullable<DebugOverlaySnapshot['frame']> => ({
  deltaSecs: DeltaTimeSecs(deltaSecs),
  cameraPosition: { worldX: 0, worldY: 64, worldZ: -0.5 },
})

const emptySnapshot = (): DebugOverlaySnapshot => ({
  cameraPose: undefined,
  dimension: undefined,
  worldTime: undefined,
  frame: undefined,
  gpuTimingSupported: undefined,
  latestGpuTimeMs: undefined,
  qualityPreset: undefined,
})

describe('debugOverlayModel', () => {
  it('decodes finite FPS boundaries and rejects non-finite or null values', () => {
    expect(Schema.decodeUnknownSync(FramesPerSecondSchema)(0)).toBe(0)
    expect(Schema.decodeUnknownSync(FramesPerSecondSchema)(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
    expect(() => Schema.decodeUnknownSync(FramesPerSecondSchema)(Infinity)).toThrow(
      Schema.SchemaError,
    )
    expect(() => Schema.decodeUnknownSync(FramesPerSecondSchema)(NaN)).toThrow(Schema.SchemaError)
    expect(() => Schema.decodeUnknownSync(FramesPerSecondSchema)(null)).toThrow(Schema.SchemaError)
    expect(() => DeltaTimeSecs(-Number.MIN_VALUE)).toThrow()

    const maximumDelta = debugOverlayModel({
      ...emptySnapshot(),
      frame: frame(Number.MAX_VALUE),
    })
    expect(maximumDelta.fps).toBe(
      Schema.decodeUnknownSync(FramesPerSecondSchema)(1 / Number.MAX_VALUE),
    )
  })

  it('preserves unavailable values as null', () => {
    expect(debugOverlayModel(emptySnapshot())).toStrictEqual({
      biome: null,
      chunk: null,
      coordinates: null,
      dimension: null,
      facing: null,
      fps: null,
      frameDeltaSecs: null,
      gpuTimingSupported: null,
      latestGpuTimeMs: null,
      qualityPreset: null,
      worldTime: null,
    })
  })

  it('projects public simulation and rendering values without replacing zero or false', () => {
    const worldTime = { ticks: 0, dayLengthTicks: 24_000 } satisfies EffectValue<TimeServiceApi['snapshot']>
    const snapshot: DebugOverlaySnapshot = {
      cameraPose: cameraPose(-1.25, 0),
      dimension: INITIAL_PLAYER_DIMENSION,
      worldTime,
      frame: frame(0.5),
      gpuTimingSupported: false,
      latestGpuTimeMs: 0,
      qualityPreset: 'high',
    }

    expect(debugOverlayModel(snapshot)).toStrictEqual({
      biome: null,
      chunk: null,
      coordinates: { worldX: 0, worldY: 64, worldZ: -0.5 },
      dimension: INITIAL_PLAYER_DIMENSION,
      facing: { pitchRadians: 0, yawRadians: -1.25 },
      fps: 2,
      frameDeltaSecs: 0.5,
      gpuTimingSupported: false,
      latestGpuTimeMs: 0,
      qualityPreset: 'high',
      worldTime,
    })
  })

  it('keeps a zero frame delta while leaving FPS unavailable', () => {
    const snapshot: DebugOverlaySnapshot = {
      ...emptySnapshot(),
      frame: frame(0),
    }

    expect(debugOverlayModel(snapshot)).toMatchObject({
      fps: null,
      coordinates: { worldX: 0, worldY: 64, worldZ: -0.5 },
      frameDeltaSecs: 0,
    })
  })

  it('keeps FPS unavailable when a positive frame delta has no finite reciprocal', () => {
    const snapshot: DebugOverlaySnapshot = {
      ...emptySnapshot(),
      frame: frame(Number.MIN_VALUE),
    }

    expect(debugOverlayModel(snapshot)).toMatchObject({
      fps: null,
      frameDeltaSecs: Number.MIN_VALUE,
    })
  })

  it('keeps independent values when another public API value is unavailable', () => {
    const snapshot: DebugOverlaySnapshot = {
      ...emptySnapshot(),
      frame: frame(0.25),
      gpuTimingSupported: true,
      qualityPreset: 'medium',
    }

    expect(debugOverlayModel(snapshot)).toMatchObject({
      fps: 4,
      facing: null,
      dimension: null,
      gpuTimingSupported: true,
      qualityPreset: 'medium',
    })
  })
})
