import { type Brand, type Effect, Result, Schema } from 'effect'
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

type InvalidDebugOverlaySnapshot = Readonly<{
  readonly _tag: 'InvalidDebugOverlaySnapshot'
  readonly field: string
}>

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const isFiniteNumber = (input: unknown): input is number =>
  typeof input === 'number' && Number.isFinite(input)

const invalidCameraPoseField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined') {
    return
  }
  if (!isRecord(input)) {
    return 'cameraPose'
  }
  const { pitchRadians, yawRadians } = input
  if (!isFiniteNumber(pitchRadians) || !isFiniteNumber(yawRadians)) {
    return 'cameraPose'
  }
  return
}

const invalidDimensionField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined' || typeof input === 'string') {
    return
  }
  return 'dimension'
}

const invalidWorldTimeField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined' || isRecord(input)) {
    return
  }
  return 'worldTime'
}

const isValidFrameCameraPosition = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const { worldX, worldY, worldZ } = input
  return isFiniteNumber(worldX) && isFiniteNumber(worldY) && isFiniteNumber(worldZ)
}

const invalidFrameField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined') {
    return
  }
  if (!isRecord(input)) {
    return 'frame'
  }
  const { cameraPosition, deltaSecs } = input
  if (!isValidFrameCameraPosition(cameraPosition)) {
    return 'frame.cameraPosition'
  }
  if (!isFiniteNumber(deltaSecs)) {
    return 'frame.deltaSecs'
  }
  return
}

const invalidGpuTimingSupportedField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined' || typeof input === 'boolean') {
    return
  }
  return 'gpuTimingSupported'
}

const invalidLatestGpuTimeField = (input: unknown): string | undefined => {
  if (typeof input === 'undefined' || isFiniteNumber(input)) {
    return
  }
  return 'latestGpuTimeMs'
}

const invalidQualityPresetField = (input: unknown): string | undefined => {
  if (
    typeof input === 'undefined' ||
    input === 'low' ||
    input === 'medium' ||
    input === 'high' ||
    input === 'ultra'
  ) {
    return
  }
  return 'qualityPreset'
}

const invalidSnapshotField = (snapshot: unknown): string | undefined => {
  if (!isRecord(snapshot)) {
    return 'snapshot'
  }
  const { cameraPose, dimension, worldTime, frame, gpuTimingSupported, latestGpuTimeMs, qualityPreset } = snapshot
  return invalidCameraPoseField(cameraPose) ??
    invalidDimensionField(dimension) ??
    invalidWorldTimeField(worldTime) ??
    invalidFrameField(frame) ??
    invalidGpuTimingSupportedField(gpuTimingSupported) ??
    invalidLatestGpuTimeField(latestGpuTimeMs) ??
    invalidQualityPresetField(qualityPreset)
}

const isDebugOverlaySnapshot = (input: unknown): input is DebugOverlaySnapshot =>
  typeof invalidSnapshotField(input) === 'undefined'

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

export function debugOverlayModel(snapshot: null): Result.Result<DebugOverlayModel, InvalidDebugOverlaySnapshot>
export function debugOverlayModel(snapshot: DebugOverlaySnapshot): DebugOverlayModel
export function debugOverlayModel(
  snapshot: unknown,
): DebugOverlayModel | Result.Result<DebugOverlayModel, InvalidDebugOverlaySnapshot>
export function debugOverlayModel(snapshot: DebugOverlaySnapshot): DebugOverlayModel
export function debugOverlayModel(
  snapshot: unknown,
): DebugOverlayModel | Result.Result<DebugOverlayModel, InvalidDebugOverlaySnapshot> {
  const invalidField = invalidSnapshotField(snapshot)
  if (typeof invalidField !== 'undefined' || !isDebugOverlaySnapshot(snapshot)) {
    return Result.fail({ _tag: 'InvalidDebugOverlaySnapshot', field: invalidField ?? 'snapshot' })
  }
  return {
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
  }
}
