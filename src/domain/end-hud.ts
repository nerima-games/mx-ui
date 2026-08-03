/* eslint-disable no-undefined -- Optional HUD notifications follow the existing public API convention. */

export const ENDER_DRAGON_DEFAULT_NAME = 'Ender Dragon'

const ZERO = 0
const FULL_PERCENT = 100
const HALF_ROTATION_DEGREES = 180
const FULL_ROTATION_DEGREES = 360

export type EnderDragonBossPhase = 'circling' | 'perching' | 'charging' | 'dead'

export interface BossHealthSnapshot {
  readonly name: string
  readonly current: number
  readonly max: number
  readonly phase: EnderDragonBossPhase
}

export interface BossHealthBarViewModel {
  readonly name: string
  readonly current: number
  readonly max: number
  readonly phase: EnderDragonBossPhase
  readonly progressPercent: number
  readonly hidden: boolean
  readonly accessibleLabel: string
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

const finiteOrZero = (value: number): number => {
  if (Number.isFinite(value)) {
    return value
  }
  return ZERO
}

export const bossHealthBarViewModel = (snapshot: BossHealthSnapshot): BossHealthBarViewModel => {
  const name = snapshot.name.trim() || ENDER_DRAGON_DEFAULT_NAME
  const max = Math.max(ZERO, finiteOrZero(snapshot.max))
  const current = clamp(finiteOrZero(snapshot.current), ZERO, max)
  const hidden = snapshot.phase === 'dead' || max === ZERO || current === ZERO
  let progressPercent = ZERO
  if (max > ZERO) {
    progressPercent = Math.floor((current / max) * FULL_PERCENT)
  }

  return {
    accessibleLabel: `${name}: ${current} of ${max} health, ${snapshot.phase}.`,
    current,
    hidden,
    max,
    name,
    phase: snapshot.phase,
    progressPercent,
  }
}

export type StrongholdLocatorSnapshot =
  | {
      readonly status: 'tracking'
      readonly relativeBearingDegrees: number
      readonly distanceBlocks: number
    }
  | { readonly status: 'unknown' }
  | { readonly status: 'lost' }

export type StrongholdLocatorViewModel =
  | {
      readonly status: 'tracking'
      readonly relativeBearingDegrees: number
      readonly distanceBlocks: number
      readonly accessibleLabel: string
    }
  | { readonly status: 'unknown'; readonly accessibleLabel: string }
  | { readonly status: 'lost'; readonly accessibleLabel: string }

const normalizeRelativeBearing = (degrees: number): number => {
  const wrapped =
    ((degrees + HALF_ROTATION_DEGREES) % FULL_ROTATION_DEGREES + FULL_ROTATION_DEGREES) %
      FULL_ROTATION_DEGREES -
    HALF_ROTATION_DEGREES
  if (wrapped === ZERO) {
    return ZERO
  }
  if (wrapped === -HALF_ROTATION_DEGREES) {
    return HALF_ROTATION_DEGREES
  }
  return wrapped
}

const describeRelativeBearing = (degrees: number): string => {
  const rounded = Math.round(degrees)
  if (rounded === ZERO) {
    return 'ahead'
  }
  if (Math.abs(rounded) === HALF_ROTATION_DEGREES) {
    return 'behind'
  }
  let direction = 'left'
  if (rounded > ZERO) {
    direction = 'right'
  }
  return `${Math.abs(rounded)} degrees ${direction}`
}

export const strongholdLocatorViewModel = (snapshot: StrongholdLocatorSnapshot): StrongholdLocatorViewModel => {
  if (snapshot.status === 'unknown') {
    return { accessibleLabel: 'Stronghold location unknown.', status: 'unknown' }
  }
  if (snapshot.status === 'lost') {
    return { accessibleLabel: 'Eye of Ender signal lost.', status: 'lost' }
  }
  if (!Number.isFinite(snapshot.relativeBearingDegrees) || !Number.isFinite(snapshot.distanceBlocks)) {
    return { accessibleLabel: 'Stronghold location unknown.', status: 'unknown' }
  }

  const relativeBearingDegrees = normalizeRelativeBearing(snapshot.relativeBearingDegrees)
  const distanceBlocks = Math.max(ZERO, snapshot.distanceBlocks)
  const roundedDistance = Math.round(distanceBlocks)

  return {
    accessibleLabel: `Stronghold: ${roundedDistance} blocks away, ${describeRelativeBearing(relativeBearingDegrees)}.`,
    distanceBlocks,
    relativeBearingDegrees,
    status: 'tracking',
  }
}

export const PORTAL_EYE_SLOT_COUNT = 12

export interface PortalEyeProgressViewModel {
  readonly inserted: number
  readonly total: typeof PORTAL_EYE_SLOT_COUNT
  readonly progressPercent: number
  readonly complete: boolean
  readonly accessibleLabel: string
}

export const portalEyeProgressViewModel = (inserted: number): PortalEyeProgressViewModel => {
  let whole = ZERO
  if (!Number.isNaN(inserted)) {
    whole = Math.floor(inserted)
  }
  const clamped = clamp(whole, ZERO, PORTAL_EYE_SLOT_COUNT)

  return {
    accessibleLabel: `${clamped} of ${PORTAL_EYE_SLOT_COUNT} portal eyes inserted.`,
    complete: clamped === PORTAL_EYE_SLOT_COUNT,
    inserted: clamped,
    progressPercent: Math.floor((clamped / PORTAL_EYE_SLOT_COUNT) * FULL_PERCENT),
    total: PORTAL_EYE_SLOT_COUNT,
  }
}

export interface DragonDefeatRewardSnapshot {
  /** Stable identity from the gameplay event or persisted encounter record. */
  readonly eventId: string
  readonly experiencePoints: number
}

export interface DragonDefeatRewardNotification {
  readonly presentationKey: string
  readonly title: string
  readonly experiencePoints: number
  readonly message: string
  readonly accessibleLabel: string
}

export const dragonDefeatPresentationKey = (eventId: string): string | undefined => {
  const normalized = eventId.trim()
  if (normalized.length === ZERO) {
    return undefined
  }
  return `end-hud:dragon-defeat:${normalized}`
}

export const dragonDefeatRewardNotification = (
  snapshot: DragonDefeatRewardSnapshot,
): DragonDefeatRewardNotification | undefined => {
  const presentationKey = dragonDefeatPresentationKey(snapshot.eventId)
  if (presentationKey === undefined) {
    return undefined
  }

  const experiencePoints = clamp(
    Math.floor(finiteOrZero(snapshot.experiencePoints)),
    ZERO,
    Number.MAX_SAFE_INTEGER,
  )
  const message = `${experiencePoints} XP awarded.`

  return {
    accessibleLabel: `Ender Dragon defeated. ${message}`,
    experiencePoints,
    message,
    presentationKey,
    title: 'Ender Dragon defeated',
  }
}
