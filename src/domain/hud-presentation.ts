/** Strict host-owned presentation data that is not part of mc-sim Vitals. */

import { type Brand, Schema, SchemaParser } from 'effect'
import type { HudIconName } from './hud-icons.generated.js'
import type { IconState } from './hud-view-model.js'
import { TICKS_PER_SECOND } from '@nerima-games/mc-sim'
import type { UiMessageKey } from './ui-language.js'

const {
  Array: schemaArray,
  Finite: schemaFinite,
  Int: schemaInt,
  Literals: schemaLiterals,
  Struct: schemaStruct,
} = Schema

const DAY_LENGTH_SECONDS: number = 1_200
const NIGHT_START_FRACTION: number = 0.55
const NIGHT_END_FRACTION: number = 0.95
const SUNSET_WARNING_SECONDS: number = 30
const DAYBREAK_START_FRACTION: number = 0.45
const MAX_METER_POINTS: number = 400
const MAX_STATUS_EFFECTS: number = 40
const HALF_TICK: number = 0.5
const ZERO = 0
const ONE = 1
const TWO = 2
const COORDINATE_DECIMAL_PLACES = 1
const MIN_DAY_LENGTH_TICKS: number = Math.ceil(
  (SUNSET_WARNING_SECONDS * TICKS_PER_SECOND - HALF_TICK) / NIGHT_START_FRACTION,
)
const MAX_DAY_LENGTH_TICKS: number = DAY_LENGTH_SECONDS * TICKS_PER_SECOND

const NON_NEGATIVE_METER_POINTS: Schema.Codec<number, number, never, never> = schemaInt.check(
  Schema.isBetween({ maximum: MAX_METER_POINTS, minimum: ZERO }),
)
const POSITIVE_METER_POINTS: Schema.Codec<number, number, never, never> = schemaInt.check(
  Schema.isBetween({ maximum: MAX_METER_POINTS, minimum: ONE }),
)
const STATUS_EFFECT_CATEGORIES = ['positive', 'negative', 'neutral'] as const
const STATUS_EFFECT_CATEGORY: Schema.Literals<
  typeof STATUS_EFFECT_CATEGORIES
> = schemaLiterals(STATUS_EFFECT_CATEGORIES)
const DEATH_CAUSES = [
  'fall',
  'lava',
  'cactus',
  'in_fire',
  'on_fire',
  'drowning',
  'suffocation',
  'starvation',
  'mob',
  'projectile',
  'explosion',
  'void',
  'ender_pearl',
  'poison',
  'generic',
  'lightning',
] as const
const DEATH_CAUSE: Schema.Literals<typeof DEATH_CAUSES> = schemaLiterals(DEATH_CAUSES)

type StatusEffectCategory = Schema.Schema.Type<typeof STATUS_EFFECT_CATEGORY>
type DeathCause = Schema.Schema.Type<typeof DEATH_CAUSE>

type MeterInput = Readonly<{ readonly current: number; readonly max: number }>
type StatusEffectInput = Readonly<{
  readonly category: StatusEffectCategory
  readonly remainingSecs: number
}>
type TimeInput = Readonly<{ readonly dayLengthTicks: number; readonly ticks: number }>
type PositionInput = Readonly<{
  readonly xCoordinate: number
  readonly yCoordinate: number
  readonly zCoordinate: number
}>

const STATUS_EFFECT_ICON: Readonly<Record<StatusEffectCategory, HudIconName>> = {
  negative: 'effect-negative',
  neutral: 'effect-neutral',
  positive: 'effect-positive',
}

const STATUS_EFFECT_LABEL: Readonly<Record<StatusEffectCategory, UiMessageKey>> = {
  negative: 'hud.effect.negative',
  neutral: 'hud.effect.neutral',
  positive: 'hud.effect.positive',
}

const DEATH_CAUSE_LABEL: Readonly<Record<DeathCause, UiMessageKey>> = {
  cactus: 'hud.death-cause.cactus',
  drowning: 'hud.death-cause.drowning',
  ender_pearl: 'hud.death-cause.ender-pearl',
  explosion: 'hud.death-cause.explosion',
  fall: 'hud.death-cause.fall',
  generic: 'hud.death-cause.generic',
  in_fire: 'hud.death-cause.in-fire',
  lava: 'hud.death-cause.lava',
  lightning: 'hud.death-cause.lightning',
  mob: 'hud.death-cause.mob',
  on_fire: 'hud.death-cause.on-fire',
  poison: 'hud.death-cause.poison',
  projectile: 'hud.death-cause.projectile',
  starvation: 'hud.death-cause.starvation',
  suffocation: 'hud.death-cause.suffocation',
  void: 'hud.death-cause.void',
}

const meterSchema: Schema.Codec<MeterInput, MeterInput, never, never> = schemaStruct({
  current: NON_NEGATIVE_METER_POINTS,
  max: POSITIVE_METER_POINTS,
}).check(Schema.makeFilter(({ current, max }) =>
  current <= max || 'current must not exceed max',
))

const effectSchema: Schema.Codec<StatusEffectInput, StatusEffectInput, never, never> = schemaStruct({
  category: STATUS_EFFECT_CATEGORY,
  remainingSecs: schemaFinite.check(Schema.isGreaterThan(ZERO)),
})

const timeSchema: Schema.Codec<TimeInput, TimeInput, never, never> = schemaStruct({
  dayLengthTicks: schemaInt.check(
    Schema.isBetween({ maximum: MAX_DAY_LENGTH_TICKS, minimum: MIN_DAY_LENGTH_TICKS }),
  ),
  ticks: schemaInt.check(Schema.isBetween({ maximum: Number.MAX_SAFE_INTEGER, minimum: ZERO })),
})

const positionSchema: Schema.Codec<PositionInput, PositionInput, never, never> = schemaStruct({
  xCoordinate: schemaFinite,
  yCoordinate: schemaFinite,
  zCoordinate: schemaFinite,
})

const healthConditionSchema: Schema.Literals<readonly ['poison', 'wither']> = schemaLiterals([
  'poison',
  'wither',
] as const)
const statusEffectsSchema: Schema.Codec<
  ReadonlyArray<StatusEffectInput>,
  ReadonlyArray<StatusEffectInput>,
  never,
  never
> = schemaArray(effectSchema).check(Schema.isMaxLength(MAX_STATUS_EFFECTS))

type HudPresentationFieldMap = Readonly<{
  readonly absorptionPoints: Schema.optional<typeof POSITIVE_METER_POINTS>
  readonly armor: Schema.optional<typeof meterSchema>
  readonly deathCause: Schema.optional<typeof DEATH_CAUSE>
  readonly healthCondition: Schema.optional<typeof healthConditionSchema>
  readonly oxygen: Schema.optional<typeof meterSchema>
  readonly position: Schema.optional<typeof positionSchema>
  readonly statusEffects: Schema.optional<typeof statusEffectsSchema>
  readonly time: Schema.optional<typeof timeSchema>
}>

const hudPresentationFields: HudPresentationFieldMap = {
  absorptionPoints: Schema.optional(POSITIVE_METER_POINTS),
  armor: Schema.optional(meterSchema),
  deathCause: Schema.optional(DEATH_CAUSE),
  healthCondition: Schema.optional(healthConditionSchema),
  oxygen: Schema.optional(meterSchema),
  position: Schema.optional(positionSchema),
  statusEffects: Schema.optional(statusEffectsSchema),
  time: Schema.optional(timeSchema),
}

type HudPresentationSnapshotFields = Schema.Struct.Type<typeof hudPresentationFields>
type HudPresentationSnapshotEncoded = Schema.Struct.Encoded<typeof hudPresentationFields>
export type HudPresentationSnapshot = HudPresentationSnapshotFields &
  Brand.Brand<'HudPresentationSnapshot'>

const hudPresentationSchemaImpl: Schema.Codec<
  HudPresentationSnapshot,
  HudPresentationSnapshotEncoded,
  never,
  never
> = schemaStruct(hudPresentationFields).pipe(Schema.brand('HudPresentationSnapshot'))

const decodeStrictHudPresentation = SchemaParser.decodeUnknownEffect(hudPresentationSchemaImpl)

/** Reject unknown fields as well as malformed values at the host adapter seam. */
export const HudPresentationSnapshotSchema: Schema.Codec<
  HudPresentationSnapshot,
  unknown,
  never,
  never
> = Schema.declareConstructor<HudPresentationSnapshot, unknown>()(
  [],
  () => (input, _ast, options) =>
    decodeStrictHudPresentation(input, { ...options, onExcessProperty: 'error' }),
  )

type MeterView = Readonly<{
  readonly states: ReadonlyArray<IconState>
  readonly current: number
  readonly max: number
}>

type StatusEffectView = Readonly<{
  readonly icon: HudIconName
  readonly label: UiMessageKey
  readonly remainingSeconds: number
  readonly category: 'positive' | 'negative' | 'neutral'
}>

type HudPresentationView = Readonly<{
  readonly absorption?: MeterView
  readonly armor?: MeterView
  readonly coordinates?: string
  readonly deathCause?: UiMessageKey
  readonly effects?: ReadonlyArray<StatusEffectView>
  readonly healthCondition?: 'poison' | 'wither'
  readonly oxygen?: MeterView
  readonly sunsetWarning?: boolean
  readonly sunsetWarningSeconds?: number
  readonly timeIcon?: HudIconName
  readonly timeLabel?: UiMessageKey
}>

type MutableHudPresentationView = {
  absorption?: MeterView
  armor?: MeterView
  coordinates?: string
  deathCause?: UiMessageKey
  effects?: ReadonlyArray<StatusEffectView>
  healthCondition?: 'poison' | 'wither'
  oxygen?: MeterView
  sunsetWarning?: boolean
  sunsetWarningSeconds?: number
  timeIcon?: HudIconName
  timeLabel?: UiMessageKey
}

type TimeCue = Pick<HudPresentationView, 'timeIcon' | 'timeLabel'>

const POINTS_PER_ICON: number = TWO

const iconStates = (current: number, max: number): MeterView => {
  const iconCount = Math.ceil(max / POINTS_PER_ICON)
  return {
    current,
    max,
    states: Array.from({ length: iconCount }, (_item, index): IconState => {
      const remaining = current - index * POINTS_PER_ICON
      if (remaining >= POINTS_PER_ICON) {
        return 'full'
      }
      if (remaining === ONE) {
        return 'half'
      }
      return 'empty'
    }),
  }
}

const effectView = (
  category: StatusEffectCategory,
  remainingSecs: number,
): StatusEffectView => ({
  category,
  icon: STATUS_EFFECT_ICON[category],
  label: STATUS_EFFECT_LABEL[category],
  remainingSeconds: Math.ceil(remainingSecs),
})

const deathCauseKey = (cause: DeathCause): UiMessageKey => DEATH_CAUSE_LABEL[cause]

const timeCue = (tickInDay: number, dayLengthTicks: number, nightStartTick: number): TimeCue => {
  if (tickInDay >= nightStartTick && tickInDay < Math.round(dayLengthTicks * NIGHT_END_FRACTION)) {
    return { timeIcon: 'time-night', timeLabel: 'hud.time.night' }
  }
  if (
    tickInDay >= Math.round(dayLengthTicks * DAYBREAK_START_FRACTION) &&
    tickInDay < nightStartTick
  ) {
    return { timeIcon: 'time-dusk', timeLabel: 'hud.time.dusk' }
  }
  return { timeIcon: 'time-day', timeLabel: 'hud.time.day' }
}

const timeView = (
  ticks: number,
  dayLengthTicks: number,
): Pick<HudPresentationView, 'sunsetWarning' | 'sunsetWarningSeconds' | 'timeIcon' | 'timeLabel'> => {
  const tickInDay = ticks % dayLengthTicks
  const nightStartTick = Math.round(dayLengthTicks * NIGHT_START_FRACTION)
  const warningStartTick = nightStartTick - SUNSET_WARNING_SECONDS * TICKS_PER_SECOND
  const warning = tickInDay >= warningStartTick && tickInDay < nightStartTick
  const warningView: { sunsetWarningSeconds?: number } = {}
  if (warning) {
    warningView.sunsetWarningSeconds = Math.ceil((nightStartTick - tickInDay) / TICKS_PER_SECOND)
  }
  return { ...timeCue(tickInDay, dayLengthTicks, nightStartTick), sunsetWarning: warning, ...warningView }
}

const addMeterViews = (view: MutableHudPresentationView, snapshot: HudPresentationSnapshot): void => {
  if (typeof snapshot.absorptionPoints !== 'undefined') {
    view.absorption = iconStates(snapshot.absorptionPoints, snapshot.absorptionPoints)
  }
  if (typeof snapshot.armor !== 'undefined') {
    view.armor = iconStates(snapshot.armor.current, snapshot.armor.max)
  }
  if (typeof snapshot.oxygen !== 'undefined') {
    view.oxygen = iconStates(snapshot.oxygen.current, snapshot.oxygen.max)
  }
}

const addDeathAndEffectViews = (view: MutableHudPresentationView, snapshot: HudPresentationSnapshot): void => {
  if (typeof snapshot.deathCause !== 'undefined') {
    view.deathCause = deathCauseKey(snapshot.deathCause)
  }
  if (typeof snapshot.healthCondition !== 'undefined') {
    view.healthCondition = snapshot.healthCondition
  }
  if (typeof snapshot.statusEffects !== 'undefined') {
    view.effects = snapshot.statusEffects.map(({ category, remainingSecs }) =>
      effectView(category, remainingSecs),
    )
  }
}

const addCoordinates = (view: MutableHudPresentationView, position: PositionInput): void => {
  const { xCoordinate, yCoordinate, zCoordinate } = position
  view.coordinates = [xCoordinate, yCoordinate, zCoordinate]
    .map((coordinate) => coordinate.toFixed(COORDINATE_DECIMAL_PLACES))
    .join(' / ')
}

/** Project only values the host supplied; omitted presentation data stays absent. */
export const hudPresentationView = (snapshot: HudPresentationSnapshot): HudPresentationView => {
  const view: MutableHudPresentationView = {}
  addMeterViews(view, snapshot)
  addDeathAndEffectViews(view, snapshot)
  if (typeof snapshot.position !== 'undefined') {
    addCoordinates(view, snapshot.position)
  }
  if (typeof snapshot.time !== 'undefined') {
    Object.assign(view, timeView(snapshot.time.ticks, snapshot.time.dayLengthTicks))
  }

  return view
}
