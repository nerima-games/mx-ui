import { AchievementIdSchema, DomainEventSchema } from '@nerima-games/mc-kernel'
import type { DomainEvent } from '@nerima-games/mc-sim'
import { Schema } from 'effect'

type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>
type AchievementId = Schema.Codec.Encoded<typeof AchievementIdSchema>

export const achievementEvent = (achievement: AchievementId): AchievementUnlockedEvent => {
  const event = Schema.decodeUnknownSync(DomainEventSchema)({
    _tag: 'AchievementUnlocked',
    achievement,
    player: 'player:one',
    tick: 7,
  })

  if (event['_tag'] !== 'AchievementUnlocked') {
    throw new Error('expected an achievement-unlocked event')
  }

  return event
}

export const untrustedAchievementEvent = (achievement: string): unknown => ({
  _tag: 'AchievementUnlocked',
  achievement,
  player: 'player:one',
  tick: 7,
})
