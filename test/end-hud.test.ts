import {
  bossHealthBarViewModel,
  dragonDefeatPresentationKey,
  dragonDefeatRewardNotification,
  portalEyeProgressViewModel,
  strongholdLocatorViewModel,
} from '../src/domain/end-hud'
import { describe, expect, it } from 'vitest'

const BELOW_MIN_PORTAL_EYES = -2
const FRACTIONAL_PORTAL_EYES = 7.9

describe('End HUD primitives', () => {
  it('clamps boss health and hides bars for ended or invalid encounters', () => {
    expect(bossHealthBarViewModel({ current: 250, max: 200, name: '  Ender Dragon  ', phase: 'charging' })).toEqual({
      accessibleLabel: 'Ender Dragon: 200 of 200 health, charging.',
      current: 200,
      hidden: false,
      max: 200,
      name: 'Ender Dragon',
      phase: 'charging',
      progressPercent: 100,
    })
    expect(bossHealthBarViewModel({ current: 1, max: Number.NaN, name: '', phase: 'circling' }).hidden).toBe(true)
    expect(bossHealthBarViewModel({ current: 200, max: 200, name: 'Ender Dragon', phase: 'dead' }).hidden).toBe(
      true,
    )
  })

  it('normalizes stronghold bearings and supplies accessible unknown and lost states', () => {
    expect(
      strongholdLocatorViewModel({ distanceBlocks: 127.6, relativeBearingDegrees: 405, status: 'tracking' }),
    ).toEqual({
      accessibleLabel: 'Stronghold: 128 blocks away, 45 degrees right.',
      distanceBlocks: 127.6,
      relativeBearingDegrees: 45,
      status: 'tracking',
    })
    expect(strongholdLocatorViewModel({ status: 'unknown' })).toEqual({
      accessibleLabel: 'Stronghold location unknown.',
      status: 'unknown',
    })
    expect(strongholdLocatorViewModel({ status: 'lost' })).toEqual({
      accessibleLabel: 'Eye of Ender signal lost.',
      status: 'lost',
    })
    expect(
      strongholdLocatorViewModel({ distanceBlocks: 10, relativeBearingDegrees: Number.NaN, status: 'tracking' }),
    ).toEqual({ accessibleLabel: 'Stronghold location unknown.', status: 'unknown' })
  })

  it('clamps portal insertion progress to whole eyes from 0 through 12', () => {
    expect(portalEyeProgressViewModel(BELOW_MIN_PORTAL_EYES)).toMatchObject({
      complete: false,
      inserted: 0,
      progressPercent: 0,
    })
    expect(portalEyeProgressViewModel(FRACTIONAL_PORTAL_EYES)).toEqual({
      accessibleLabel: '7 of 12 portal eyes inserted.',
      complete: false,
      inserted: 7,
      progressPercent: 58,
      total: 12,
    })
    expect(portalEyeProgressViewModel(Number.POSITIVE_INFINITY)).toMatchObject({
      complete: true,
      inserted: 12,
      progressPercent: 100,
    })
  })

  it('derives an exactly-once presentation key from stable defeat event identity', () => {
    expect(dragonDefeatPresentationKey(' defeat-42 ')).toBe('end-hud:dragon-defeat:defeat-42')
    expect(dragonDefeatPresentationKey('')).toBeUndefined()

    const first = dragonDefeatRewardNotification({ eventId: 'defeat-42', experiencePoints: 12_000 })
    const replay = dragonDefeatRewardNotification({ eventId: 'defeat-42', experiencePoints: 12_000 })
    const next = dragonDefeatRewardNotification({ eventId: 'defeat-43', experiencePoints: 12_000 })

    expect(first).toEqual(replay)
    expect(first?.presentationKey).not.toBe(next?.presentationKey)
    expect(first).toMatchObject({
      accessibleLabel: 'Ender Dragon defeated. 12000 XP awarded.',
      experiencePoints: 12_000,
      message: '12000 XP awarded.',
    })
    expect(dragonDefeatRewardNotification({ eventId: '  ', experiencePoints: 12_000 })).toBeUndefined()
  })
})
