/* eslint-disable no-undefined -- Optional HUD notifications follow the existing public API convention. */

import {
  DEFAULT_UI_LANGUAGE,
  type UiLanguage,
  type UiMessageKey,
  translateUiMessage,
} from './ui-language.js'
import { Result } from 'effect'

export const ENDER_DRAGON_DEFAULT_NAME = 'Ender Dragon'

const ZERO = 0
const FULL_PERCENT = 100
const HALF_ROTATION_DEGREES = 180
const FULL_ROTATION_DEGREES = 360

export type EnderDragonBossPhase = 'circling' | 'perching' | 'charging' | 'dead'

const BOSS_PHASE_MESSAGE_KEY: Readonly<Record<EnderDragonBossPhase, UiMessageKey>> = {
  charging: 'end-hud.boss-phase.charging',
  circling: 'end-hud.boss-phase.circling',
  dead: 'end-hud.boss-phase.dead',
  perching: 'end-hud.boss-phase.perching',
}

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

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

type InvalidBossHealthInput = Readonly<{
  readonly _tag: 'InvalidBossHealthInput'
  readonly field: string
}>

const isBossHealthSnapshot = (input: unknown): input is BossHealthSnapshot => {
  if (!isRecord(input)) {
    return false
  }
  return typeof input['name'] === 'string' &&
    typeof input['current'] === 'number' &&
    typeof input['max'] === 'number' &&
    (input['phase'] === 'circling' ||
      input['phase'] === 'perching' ||
      input['phase'] === 'charging' ||
      input['phase'] === 'dead')
}

const bossName = (name: string, language: UiLanguage): string => {
  const trimmedName = name.trim()
  const omittedBossName = trimmedName.length === ZERO
  // Vanilla treats a whitespace-only boss name as omitted and uses the default name.
  if (omittedBossName) {
    return translateUiMessage(language, 'end-hud.boss-default-name')
  }
  return trimmedName
}

const projectBossHealthBarViewModel = (
  snapshot: BossHealthSnapshot,
  language: UiLanguage,
): BossHealthBarViewModel => {
  const name = bossName(snapshot.name, language)
  const max = Math.max(ZERO, finiteOrZero(snapshot.max))
  const current = clamp(finiteOrZero(snapshot.current), ZERO, max)
  const hidden = snapshot.phase === 'dead' || max === ZERO || current === ZERO
  let progressPercent = ZERO
  if (max > ZERO) {
    progressPercent = Math.floor((current / max) * FULL_PERCENT)
  }

  return {
    accessibleLabel: translateUiMessage(language, 'end-hud.boss-health', {
      current,
      max,
      name,
      phase: translateUiMessage(language, BOSS_PHASE_MESSAGE_KEY[snapshot.phase]),
    }),
    current,
    hidden,
    max,
    name,
    phase: snapshot.phase,
    progressPercent,
  }
}

export function bossHealthBarViewModel(
  snapshot: null,
  language?: unknown,
): Result.Result<BossHealthBarViewModel, InvalidBossHealthInput>
export function bossHealthBarViewModel(
  snapshot: BossHealthSnapshot,
  language?: UiLanguage,
): BossHealthBarViewModel
export function bossHealthBarViewModel(
  snapshot: unknown,
  language?: unknown,
): BossHealthBarViewModel | Result.Result<BossHealthBarViewModel, InvalidBossHealthInput>
export function bossHealthBarViewModel(
  snapshot: BossHealthSnapshot,
  language?: UiLanguage,
): BossHealthBarViewModel
export function bossHealthBarViewModel(
  snapshot: unknown,
  language: unknown = DEFAULT_UI_LANGUAGE,
): BossHealthBarViewModel | Result.Result<BossHealthBarViewModel, InvalidBossHealthInput> {
  if (!isBossHealthSnapshot(snapshot)) {
    return Result.fail({ _tag: 'InvalidBossHealthInput', field: 'snapshot' })
  }
  if (language !== 'en' && language !== 'ja') {
    return Result.fail({ _tag: 'InvalidBossHealthInput', field: 'language' })
  }
  return projectBossHealthBarViewModel(snapshot, language)
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

const describeRelativeBearing = (degrees: number, language: UiLanguage): string => {
  const rounded = Math.round(degrees)
  if (rounded === ZERO) {
    return translateUiMessage(language, 'end-hud.stronghold-ahead')
  }
  if (Math.abs(rounded) === HALF_ROTATION_DEGREES) {
    return translateUiMessage(language, 'end-hud.stronghold-behind')
  }
  if (rounded > ZERO) {
    return translateUiMessage(language, 'end-hud.stronghold-degrees-right', { degrees: Math.abs(rounded) })
  }
  return translateUiMessage(language, 'end-hud.stronghold-degrees-left', { degrees: Math.abs(rounded) })
}

export const strongholdLocatorViewModel = (
  snapshot: StrongholdLocatorSnapshot,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): StrongholdLocatorViewModel => {
  if (snapshot.status === 'unknown') {
    return { accessibleLabel: translateUiMessage(language, 'end-hud.stronghold-unknown'), status: 'unknown' }
  }
  if (snapshot.status === 'lost') {
    return { accessibleLabel: translateUiMessage(language, 'end-hud.stronghold-lost'), status: 'lost' }
  }
  if (!Number.isFinite(snapshot.relativeBearingDegrees) || !Number.isFinite(snapshot.distanceBlocks)) {
    return { accessibleLabel: translateUiMessage(language, 'end-hud.stronghold-unknown'), status: 'unknown' }
  }

  const relativeBearingDegrees = normalizeRelativeBearing(snapshot.relativeBearingDegrees)
  const distanceBlocks = Math.max(ZERO, snapshot.distanceBlocks)
  const roundedDistance = Math.round(distanceBlocks)

  return {
    accessibleLabel: translateUiMessage(language, 'end-hud.stronghold-tracking', {
      bearing: describeRelativeBearing(relativeBearingDegrees, language),
      distance: roundedDistance,
    }),
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

export const portalEyeProgressViewModel = (
  inserted: number,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): PortalEyeProgressViewModel => {
  let whole = ZERO
  if (!Number.isNaN(inserted)) {
    whole = Math.floor(inserted)
  }
  const clamped = clamp(whole, ZERO, PORTAL_EYE_SLOT_COUNT)

  return {
    accessibleLabel: translateUiMessage(language, 'end-hud.portal-eye-progress', {
      inserted: clamped,
      total: PORTAL_EYE_SLOT_COUNT,
    }),
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
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
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
  const title = translateUiMessage(language, 'end-hud.dragon-defeated')
  const message = translateUiMessage(language, 'end-hud.xp-awarded', { experiencePoints })

  return {
    accessibleLabel: translateUiMessage(language, 'end-hud.dragon-defeat-accessible', { message, title }),
    experiencePoints,
    message,
    presentationKey,
    title,
  }
}
