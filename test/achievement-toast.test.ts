// Vanilla Java Edition title and advancement ID reference: https://minecraft.wiki/w/Advancement
import { DomainEventSchema, type DomainEvent } from '@nerima-games/mc-kernel'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AchievementToastIconSchema,
  AchievementToastSchema,
  AchievementToastTitleSchema,
  achievementToastFromEvent,
} from '../src/domain/achievement-toast'

type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>

const achievementEvent = (achievement: string): AchievementUnlockedEvent => {
  const event = Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'AchievementUnlocked',
    tick: 7,
    player: 'player:one',
    achievement,
  })
  if (event['_tag'] !== 'AchievementUnlocked') {
    throw new Error('expected an achievement event')
  }
  return event
}

describe('achievement toast projection', () => {
  it('uses a vanilla Java advancement title and item icon', () => {
    const event = achievementEvent('minecraft:story/mine_stone')
    const toast = achievementToastFromEvent(event)

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

  it('does not produce a toast for an ID without display metadata', () => {
    const event = achievementEvent('example:custom/achievement')

    expect(achievementToastFromEvent(event)).toBeNull()
  })

  it('ignores non-achievement domain events', () => {
    const event = Schema.decodeUnknownSync(DomainEventSchema)({
      _tag: 'LevelUp',
      tick: 7,
      entity: 'player:one',
      position: { dimension: 'overworld', x: 0, y: 64, z: 0 },
      level: 1,
    })

    expect(achievementToastFromEvent(event)).toBeNull()
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
