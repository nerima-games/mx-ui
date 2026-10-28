import { Schema, type Brand, type Effect } from 'effect'
import type { PlayerServiceApi, TimeServiceApi } from '@nerima-games/mc-sim'
import type { ProductionFrame } from '@nerima-games/mc-render'
import type { BrowserWorldRuntime } from '@nerima-games/mc-render/browser'

export type FramesPerSecond = number & Brand.Brand<'FramesPerSecond'>
export const FramesPerSecondSchema: Schema.Codec<FramesPerSecond, number> = Schema.Finite.pipe(
  Schema.brand('FramesPerSecond'),
)

type EffectValue<T> = T extends Effect.Effect<infer TValue, infer _Error, infer _Requirements>
  ? TValue
  : never

export type DebugOverlaySnapshot = Readonly<{
  cameraPose: EffectValue<PlayerServiceApi['cameraPose']> | undefined
  dimension: EffectValue<PlayerServiceApi['dimension']> | undefined
  worldTime: EffectValue<TimeServiceApi['snapshot']> | undefined
  frame: ProductionFrame | undefined
  gpuTimingSupported: BrowserWorldRuntime['gpuTimingSupported'] | undefined
  latestGpuTimeMs: BrowserWorldRuntime['latestGpuTimeMs']
  qualityPreset: BrowserWorldRuntime['qualityPreset']
}>

export type DebugOverlayModel = Readonly<{
  fps: FramesPerSecond | undefined
  coordinates: ProductionFrame['cameraPosition'] | undefined
  chunk: undefined
  facing:
    | Readonly<{
        yawRadians: NonNullable<DebugOverlaySnapshot['cameraPose']>['yawRadians']
        pitchRadians: NonNullable<DebugOverlaySnapshot['cameraPose']>['pitchRadians']
      }>
    | undefined
  dimension: DebugOverlaySnapshot['dimension']
  biome: undefined
  worldTime: DebugOverlaySnapshot['worldTime']
  frameDeltaSecs: ProductionFrame['deltaSecs'] | undefined
  gpuTimingSupported: DebugOverlaySnapshot['gpuTimingSupported']
  latestGpuTimeMs: DebugOverlaySnapshot['latestGpuTimeMs']
  qualityPreset: DebugOverlaySnapshot['qualityPreset']
}>

const framesPerSecondFromDelta = (
  frameDeltaSecs: ProductionFrame['deltaSecs'] | undefined,
): FramesPerSecond | undefined => {
  if (frameDeltaSecs === undefined || frameDeltaSecs === 0) {
    return undefined
  }

  const framesPerSecond = 1 / frameDeltaSecs
  if (!Number.isFinite(framesPerSecond)) {
    return undefined
  }

  return Schema.decodeUnknownSync(FramesPerSecondSchema)(framesPerSecond)
}

export const debugOverlayModel = (snapshot: DebugOverlaySnapshot): DebugOverlayModel => {
  const frameDeltaSecs = snapshot.frame?.deltaSecs

  return {
    fps: framesPerSecondFromDelta(frameDeltaSecs),
    coordinates: snapshot.frame?.cameraPosition,
    chunk: undefined,
    facing:
      snapshot.cameraPose === undefined
        ? undefined
        : {
            yawRadians: snapshot.cameraPose.yawRadians,
            pitchRadians: snapshot.cameraPose.pitchRadians,
          },
    dimension: snapshot.dimension,
    biome: undefined,
    worldTime: snapshot.worldTime,
    frameDeltaSecs,
    gpuTimingSupported: snapshot.gpuTimingSupported,
    latestGpuTimeMs: snapshot.latestGpuTimeMs,
    qualityPreset: snapshot.qualityPreset,
  }
}
