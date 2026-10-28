import {
  AngleRadians,
  DeltaTimeSecs,
  DimensionIdSchema,
} from '@nerima-games/mc-kernel'
import { Schema } from 'effect'
import {
  AchievementToastSchema,
  type AchievementToast,
} from './achievement-toast.js'
import type { DebugOverlayModel } from './debug-overlay.js'
import { FramesPerSecondSchema } from './debug-overlay.js'

const MaybeFiniteSchema: Schema.Codec<number | null, unknown> = Schema.NullOr(Schema.Finite)
const MaybeBooleanSchema: Schema.Codec<boolean | null, unknown> = Schema.NullOr(Schema.Boolean)
const MaybeDimensionSchema: Schema.Codec<
  Schema.Schema.Type<typeof DimensionIdSchema> | null,
  unknown
> = Schema.NullOr(DimensionIdSchema)
const MaybeQualityPresetSchema: Schema.Codec<
  Exclude<DebugOverlayModel['qualityPreset'], undefined> | null,
  unknown
> = Schema.NullOr(Schema.Literals(['low', 'medium', 'high', 'ultra']))

const DebugCoordinatesSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['coordinates']>,
  unknown
> = Schema.Struct({
  worldX: Schema.Finite,
  worldY: Schema.Finite,
  worldZ: Schema.Finite,
})

const MaybeDebugCoordinatesSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['coordinates']> | null,
  unknown
> = Schema.NullOr(DebugCoordinatesSchema)

const DebugFacingSchema: Schema.Codec<NonNullable<DebugOverlayModel['facing']>, unknown> = Schema.Struct({
  yawRadians: Schema.fromBrand('AngleRadians', AngleRadians)(Schema.Finite),
  pitchRadians: Schema.fromBrand('AngleRadians', AngleRadians)(Schema.Finite),
})

const MaybeDebugFacingSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['facing']> | null,
  unknown
> = Schema.NullOr(DebugFacingSchema)

const DebugWorldTimeSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['worldTime']>,
  unknown
> = Schema.Struct({
  dayLengthTicks: Schema.Finite,
  ticks: Schema.Finite,
})

const MaybeDebugWorldTimeSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['worldTime']> | null,
  unknown
> = Schema.NullOr(DebugWorldTimeSchema)

const DebugDeltaTimeSecsSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['frameDeltaSecs']>,
  number
> = Schema.fromBrand('DeltaTimeSecs', DeltaTimeSecs)(Schema.Finite)
const MaybeDebugDeltaTimeSecsSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['frameDeltaSecs']> | null,
  unknown
> = Schema.NullOr(DebugDeltaTimeSecsSchema)

type NullWhenUnavailable<Value> = Exclude<Value, undefined> | null

export type UiQaDebugOverlayState = Readonly<{
  [Key in keyof DebugOverlayModel]: NullWhenUnavailable<DebugOverlayModel[Key]>
}>

const DebugOverlayStateSchema: Schema.Codec<UiQaDebugOverlayState, unknown> = Schema.Struct({
  biome: Schema.Null,
  chunk: Schema.Null,
  coordinates: MaybeDebugCoordinatesSchema,
  dimension: MaybeDimensionSchema,
  facing: MaybeDebugFacingSchema,
  fps: Schema.NullOr(FramesPerSecondSchema),
  frameDeltaSecs: MaybeDebugDeltaTimeSecsSchema,
  gpuTimingSupported: MaybeBooleanSchema,
  latestGpuTimeMs: MaybeFiniteSchema,
  qualityPreset: MaybeQualityPresetSchema,
  worldTime: MaybeDebugWorldTimeSchema,
})

export type UiQaSnapshot = Readonly<{
  achievementToast: AchievementToast | undefined
  debugOverlay: DebugOverlayModel | undefined
}>

export type UiQaState = Readonly<{
  achievementToast: AchievementToast | null
  debugOverlay: UiQaDebugOverlayState | null
}>

export const UiQaStateInputSchema: Schema.Codec<Readonly<Record<string, never>>, unknown> =
  Schema.Record(Schema.String, Schema.Never)

export const UiQaStateSchema: Schema.Codec<UiQaState, unknown> = Schema.Struct({
  achievementToast: Schema.NullOr(AchievementToastSchema),
  debugOverlay: Schema.NullOr(DebugOverlayStateSchema),
})

const nullable = <A>(value: A | undefined): A | null => value ?? null

const debugOverlayStateFromModel = (model: DebugOverlayModel): UiQaDebugOverlayState => ({
  biome: null,
  chunk: null,
  coordinates: nullable(model.coordinates),
  dimension: nullable(model.dimension),
  facing: nullable(model.facing),
  fps: nullable(model.fps),
  frameDeltaSecs: nullable(model.frameDeltaSecs),
  gpuTimingSupported: nullable(model.gpuTimingSupported),
  latestGpuTimeMs: nullable(model.latestGpuTimeMs),
  qualityPreset: nullable(model.qualityPreset),
  worldTime: nullable(model.worldTime),
})

export const uiQaStateFromSnapshot = (snapshot: UiQaSnapshot): UiQaState => ({
  achievementToast: nullable(snapshot.achievementToast),
  debugOverlay:
    typeof snapshot.debugOverlay === 'undefined'
      ? null
      : debugOverlayStateFromModel(snapshot.debugOverlay),
})
