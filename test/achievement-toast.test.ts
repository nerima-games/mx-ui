// Vanilla Java advancement IDs, titles, and icons: the 26.3-snapshot-1 assets.
import { DomainEventSchema } from '@nerima-games/mc-kernel'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AchievementToastIconSchema,
  AchievementToastSchema,
  AchievementToastTitleSchema,
  achievementToastFromEvent,
} from '../src/domain/achievement-toast'
import { achievementEventFromLegacySim } from './helpers/achievement-event'

describe('achievement toast projection', () => {
  it('uses the vanilla advancement title and item icon', () => {
    const event = achievementEventFromLegacySim('minecraft:story/mine_stone')
    const toast = Effect.runSync(Effect.orDie(achievementToastFromEvent(event)))

    expect(
      Schema.decodeUnknownSync(AchievementToastSchema, { onExcessProperty: 'error' })(toast),
    ).toStrictEqual({
      achievement: event.achievement,
      icon: 'minecraft:wooden_pickaxe',
      player: event.player,
      tick: event.tick,
      title: 'Stone Age',
    })
  })

  it('returns a typed schema failure for an ID outside the kernel catalog', () => {
    const event = achievementEventFromLegacySim('example:custom/achievement')
    const result = Effect.runSync(Effect.result(achievementToastFromEvent(event)))

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(Schema.SchemaError)
    }
  })

  it('ignores non-achievement domain events', () => {
    const event = Schema.decodeUnknownSync(DomainEventSchema)({
      _tag: 'LevelUp',
      tick: 7,
      entity: 'player:one',
      position: { dimension: 'overworld', x: 0, y: 64, z: 0 },
      level: 1,
    })
    if (event['_tag'] !== 'LevelUp') {
      throw new Error('expected a level-up event')
    }

    expect(Effect.runSync(Effect.orDie(achievementToastFromEvent(event)))).toBeNull()
  })

  it('rejects empty, null, and missing toast display values', () => {
    expect(() => Schema.decodeUnknownSync(AchievementToastIconSchema)('')).toThrow(
      Schema.SchemaError,
    )
    expect(() => Schema.decodeUnknownSync(AchievementToastIconSchema)(null)).toThrow(
      Schema.SchemaError,
    )
    expect(() => Schema.decodeUnknownSync(AchievementToastTitleSchema)('')).toThrow(
      Schema.SchemaError,
    )
    expect(() => Schema.decodeUnknownSync(AchievementToastTitleSchema)(null)).toThrow(
      Schema.SchemaError,
    )
    expect(() =>
      Schema.decodeUnknownSync(AchievementToastSchema, { onExcessProperty: 'error' })({
        achievement: 'minecraft:story/mine_stone',
        icon: 'minecraft:wooden_pickaxe',
        player: 'player:one',
        title: 'Stone Age',
      }),
    ).toThrow(Schema.SchemaError)
  })

  it('rejects null fields and excess fields in strict toast decoding', () => {
    const strictDecode = Schema.decodeUnknownSync(AchievementToastSchema, {
      onExcessProperty: 'error',
    })
    expect(() => strictDecode(null)).toThrow(Schema.SchemaError)
    expect(() =>
      strictDecode({
        achievement: 'minecraft:story/mine_stone',
        icon: 'minecraft:wooden_pickaxe',
        player: 'player:one',
        tick: null,
        title: 'Stone Age',
      }),
    ).toThrow(Schema.SchemaError)
    expect(() =>
      strictDecode({
        achievement: 'minecraft:story/mine_stone',
        icon: 'minecraft:wooden_pickaxe',
        player: 'player:one',
        tick: 7,
        title: 'Stone Age',
        unexpected: true,
      }),
    ).toThrow(Schema.SchemaError)
  })

  it('rejects unknown domain event tags at the event schema boundary', () => {
    expect(() =>
      Schema.decodeUnknownSync(DomainEventSchema)({ _tag: 'UnknownAchievement', tick: 1 }),
    ).toThrow(Schema.SchemaError)
  })
})
