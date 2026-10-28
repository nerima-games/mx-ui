import { type Brand, type Effect, Schema } from 'effect'
import type { PlayerServiceApi, TimeServiceApi } from '@nerima-games/mc-sim'
import type { DeltaTimeSecs as DeltaTimeSecsType } from '@nerima-games/mc-kernel'

export type FramesPerSecond = number & Brand.Brand<'FramesPerSecond'>
export const FramesPerSecondSchema: Schema.Codec<FramesPerSecond, number> = Schema.Finite.pipe(
  Schema.brand('FramesPerSecond'),
)
export type GpuTimeMilliseconds = number & Brand.Brand<'GpuTimeMilliseconds'>
export const GpuTimeMillisecondsSchema: Schema.Codec<GpuTimeMilliseconds, number> = Schema.Finite.pipe(
  Schema.brand('GpuTimeMilliseconds'),
)

type EffectValue<EffectType> = EffectType extends Effect.Effect<
  infer Result,
  infer _ErrorType,
  infer _Requirements
>
  ? Result
  : never

type DebugOverlayCoordinates = Readonly<{
  worldX: number
  worldY: number
  worldZ: number
}>

type DebugOverlayFrame = Readonly<{
  cameraPosition: DebugOverlayCoordinates
  deltaSecs: DeltaTimeSecsType
}>

type DebugOverlayQualityPreset = 'low' | 'medium' | 'high' | 'ultra'

export type DebugOverlaySnapshot = Readonly<{
  cameraPose: EffectValue<PlayerServiceApi['cameraPose']> | undefined
  dimension: EffectValue<PlayerServiceApi['dimension']> | undefined
  worldTime: EffectValue<TimeServiceApi['snapshot']> | undefined
  frame: DebugOverlayFrame | undefined
  gpuTimingSupported: boolean | undefined
  latestGpuTimeMs: unknown
  qualityPreset: DebugOverlayQualityPreset | undefined
}>

export type DebugOverlayModel = Readonly<{
  biome: null
  chunk: null
  coordinates: Exclude<DebugOverlayFrame['cameraPosition'], undefined> | null
  dimension: Exclude<DebugOverlaySnapshot['dimension'], undefined> | null
  facing:
    | Readonly<{
        pitchRadians: NonNullable<DebugOverlaySnapshot['cameraPose']>['pitchRadians']
        yawRadians: NonNullable<DebugOverlaySnapshot['cameraPose']>['yawRadians']
      }>
    | null
  fps: FramesPerSecond | null
  frameDeltaSecs: Exclude<DebugOverlayFrame['deltaSecs'], undefined> | null
  gpuTimingSupported: boolean | null
  latestGpuTimeMs: GpuTimeMilliseconds | null
  qualityPreset: DebugOverlayQualityPreset | null
  worldTime: Exclude<DebugOverlaySnapshot['worldTime'], undefined> | null
}>

const { decodeUnknownSync } = Schema
const FRAME_RATE_NUMERATOR = 1
const ZERO_FRAME_DELTA_SECS = 0

const framesPerSecondFromDelta = (
  frameDeltaSecs: DebugOverlayFrame['deltaSecs'] | undefined,
): FramesPerSecond | null => {
  if (typeof frameDeltaSecs !== 'number' || frameDeltaSecs === ZERO_FRAME_DELTA_SECS) {
    return null
  }

  const framesPerSecond = FRAME_RATE_NUMERATOR / frameDeltaSecs
  if (!Number.isFinite(framesPerSecond)) {
    return null
  }

  return decodeUnknownSync(FramesPerSecondSchema)(framesPerSecond)
}

const gpuTimeFromUnknown = (value: unknown): GpuTimeMilliseconds | null => {
  if (typeof value === 'undefined') {
    return null
  }

  return decodeUnknownSync(GpuTimeMillisecondsSchema)(value)
}

const facingFromCameraPose = (
  cameraPose: DebugOverlaySnapshot['cameraPose'],
): DebugOverlayModel['facing'] => {
  if (!cameraPose) {
    return null
  }

  return {
    pitchRadians: cameraPose.pitchRadians,
    yawRadians: cameraPose.yawRadians,
  }
}

export const debugOverlayModel = (snapshot: DebugOverlaySnapshot): DebugOverlayModel => ({
  biome: null,
  chunk: null,
  coordinates: snapshot.frame?.cameraPosition ?? null,
  dimension: snapshot.dimension ?? null,
  facing: facingFromCameraPose(snapshot.cameraPose),
  fps: framesPerSecondFromDelta(snapshot.frame?.deltaSecs),
  frameDeltaSecs: snapshot.frame?.deltaSecs ?? null,
  gpuTimingSupported: snapshot.gpuTimingSupported ?? null,
  latestGpuTimeMs: gpuTimeFromUnknown(snapshot.latestGpuTimeMs),
  qualityPreset: snapshot.qualityPreset ?? null,
  worldTime: snapshot.worldTime ?? null,
})
