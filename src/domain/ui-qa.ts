import {
  type AchievementToast,
  AchievementToastSchema,
} from './achievement-toast.js'
import {
  AngleRadians,
  DeltaTimeSecs,
  DimensionIdSchema,
} from '@nerima-games/mc-kernel'
import {
  type DebugOverlayModel,
  FramesPerSecondSchema,
  GpuTimeMillisecondsSchema,
} from './debug-overlay.js'
import { Result, Schema } from 'effect'

const literals = Schema.Literals
const nullOr = Schema.NullOr
const record = Schema.Record
const struct = Schema.Struct

const MaybeBooleanSchema: Schema.Codec<boolean | null, unknown> = nullOr(Schema.Boolean)
const MaybeGpuTimeMillisecondsSchema: Schema.Codec<
  Exclude<DebugOverlayModel['latestGpuTimeMs'], null> | null,
  unknown
> = nullOr(GpuTimeMillisecondsSchema)
const MaybeDimensionSchema: Schema.Codec<
  Schema.Schema.Type<typeof DimensionIdSchema> | null,
  unknown
> = nullOr(DimensionIdSchema)
const MaybeQualityPresetSchema: Schema.Codec<
  Exclude<DebugOverlayModel['qualityPreset'], undefined> | null,
  unknown
> = nullOr(literals(['low', 'medium', 'high', 'ultra']))

const DebugCoordinatesSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['coordinates']>,
  unknown
> = struct({
  worldX: Schema.Finite,
  worldY: Schema.Finite,
  worldZ: Schema.Finite,
})

const MaybeDebugCoordinatesSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['coordinates']> | null,
  unknown
> = nullOr(DebugCoordinatesSchema)

const DebugFacingSchema: Schema.Codec<NonNullable<DebugOverlayModel['facing']>, unknown> = struct({
  pitchRadians: Schema.fromBrand('AngleRadians', AngleRadians)(Schema.Finite),
  yawRadians: Schema.fromBrand('AngleRadians', AngleRadians)(Schema.Finite),
})

const MaybeDebugFacingSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['facing']> | null,
  unknown
> = nullOr(DebugFacingSchema)

const DebugWorldTimeSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['worldTime']>,
  unknown
> = struct({
  dayLengthTicks: Schema.Finite,
  ticks: Schema.Finite,
})

const MaybeDebugWorldTimeSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['worldTime']> | null,
  unknown
> = nullOr(DebugWorldTimeSchema)

const DebugDeltaTimeSecsSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['frameDeltaSecs']>,
  number
> = Schema.fromBrand('DeltaTimeSecs', DeltaTimeSecs)(Schema.Finite)
const MaybeDebugDeltaTimeSecsSchema: Schema.Codec<
  NonNullable<DebugOverlayModel['frameDeltaSecs']> | null,
  unknown
> = nullOr(DebugDeltaTimeSecsSchema)

type NullWhenUnavailable<Value> = Exclude<Value, undefined> | null

export type UiQaDebugOverlayState = Readonly<{
  [Key in keyof DebugOverlayModel]: NullWhenUnavailable<DebugOverlayModel[Key]>
}>

const DebugOverlayStateSchema: Schema.Codec<UiQaDebugOverlayState, unknown> = struct({
  biome: Schema.Null,
  chunk: Schema.Null,
  coordinates: MaybeDebugCoordinatesSchema,
  dimension: MaybeDimensionSchema,
  facing: MaybeDebugFacingSchema,
  fps: nullOr(FramesPerSecondSchema),
  frameDeltaSecs: MaybeDebugDeltaTimeSecsSchema,
  gpuTimingSupported: MaybeBooleanSchema,
  latestGpuTimeMs: MaybeGpuTimeMillisecondsSchema,
  qualityPreset: MaybeQualityPresetSchema,
  worldTime: MaybeDebugWorldTimeSchema,
})

export type UiQaSnapshot = Readonly<{
  achievementToast?: AchievementToast
  debugOverlay?: DebugOverlayModel
}>

export type UiQaState = Readonly<{
  achievementToast: AchievementToast | null
  debugOverlay: UiQaDebugOverlayState | null
}>

export const UiQaStateInputSchema: Schema.Codec<Readonly<Record<string, never>>, unknown> =
  record(Schema.String, Schema.Never)

export const UiQaStateSchema: Schema.Codec<UiQaState, unknown> = struct({
  achievementToast: nullOr(AchievementToastSchema),
  debugOverlay: nullOr(DebugOverlayStateSchema),
})

const nullable = <Value>(value: Value | undefined): Value | null => value ?? null

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

const debugOverlayStateFromOptionalModel = (
  model: DebugOverlayModel | undefined,
): UiQaDebugOverlayState | null => {
  if (typeof model === 'undefined') {
    return null
  }

  return debugOverlayStateFromModel(model)
}

type InvalidUiQaSnapshot = Readonly<{
  readonly _tag: 'InvalidUiQaSnapshot'
  readonly field: string
}>

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const hasOnlyFields = (input: unknown, fields: ReadonlyArray<string>): input is Record<string, unknown> =>
  isRecord(input) && Object.keys(input).every((field) => fields.includes(field))

const isExactAchievementToast = (input: unknown): input is AchievementToast =>
  hasOnlyFields(input, ['achievement', 'icon', 'player', 'tick', 'title']) &&
  Schema.is(AchievementToastSchema)(input)

const isExactDebugOverlayState = (input: unknown): input is UiQaDebugOverlayState => {
  if (
    !hasOnlyFields(input, [
      'biome',
      'chunk',
      'coordinates',
      'dimension',
      'facing',
      'fps',
      'frameDeltaSecs',
      'gpuTimingSupported',
      'latestGpuTimeMs',
      'qualityPreset',
      'worldTime',
    ]) ||
    !Schema.is(DebugOverlayStateSchema)(input)
  ) {
    return false
  }

  const { coordinates, facing, worldTime } = input
  return (coordinates === null || hasOnlyFields(coordinates, ['worldX', 'worldY', 'worldZ'])) &&
    (facing === null || hasOnlyFields(facing, ['pitchRadians', 'yawRadians'])) &&
    (worldTime === null || hasOnlyFields(worldTime, ['dayLengthTicks', 'ticks']))
}

const invalidUiQaSnapshotField = (input: unknown): string | undefined => {
  if (!isRecord(input)) {
    return 'snapshot'
  }

  if (!hasOnlyFields(input, ['achievementToast', 'debugOverlay'])) {
    return 'snapshot'
  }

  const { achievementToast, debugOverlay } = input
  if (achievementToast === null || (typeof achievementToast !== 'undefined' && !isExactAchievementToast(achievementToast))) {
    return 'achievementToast'
  }
  if (debugOverlay === null || (typeof debugOverlay !== 'undefined' && !isExactDebugOverlayState(debugOverlay))) {
    return 'debugOverlay'
  }
  return
}

const isUiQaSnapshot = (input: unknown): input is UiQaSnapshot => {
  if (!hasOnlyFields(input, ['achievementToast', 'debugOverlay'])) {
    return false
  }
  const { achievementToast, debugOverlay } = input
  if (typeof achievementToast !== 'undefined' && !isExactAchievementToast(achievementToast)) {
    return false
  }
  if (typeof debugOverlay !== 'undefined' && !isExactDebugOverlayState(debugOverlay)) {
    return false
  }
  return true
}

const invalidUiQaSnapshot = (field: string): Result.Result<UiQaState, InvalidUiQaSnapshot> =>
  Result.fail({ _tag: 'InvalidUiQaSnapshot', field })

export function uiQaStateFromSnapshot(snapshot: null): Result.Result<UiQaState, InvalidUiQaSnapshot>
export function uiQaStateFromSnapshot(snapshot: UiQaSnapshot): UiQaState
export function uiQaStateFromSnapshot(
  snapshot: unknown,
): UiQaState | Result.Result<UiQaState, InvalidUiQaSnapshot>
export function uiQaStateFromSnapshot(
  snapshot: unknown,
): UiQaState | Result.Result<UiQaState, InvalidUiQaSnapshot> {
  if (!isUiQaSnapshot(snapshot)) {
    return invalidUiQaSnapshot(invalidUiQaSnapshotField(snapshot) ?? 'snapshot')
  }

  return {
    achievementToast: nullable(snapshot.achievementToast),
    debugOverlay: debugOverlayStateFromOptionalModel(snapshot.debugOverlay),
  }
}
