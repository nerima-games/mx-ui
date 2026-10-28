import { EntityIdSchema, SimulationTickSchema } from '@nerima-games/mc-kernel'
import type { DomainEvent } from '@nerima-games/mc-sim'
import { Schema } from 'effect'

type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>

const LegacyAchievementIdSchema = Schema.NonEmptyString.pipe(Schema.brand('AchievementId'))
const LegacyAchievementUnlockedEventSchema = Schema.TaggedStruct('AchievementUnlocked', {
  achievement: LegacyAchievementIdSchema,
  player: EntityIdSchema,
  tick: SimulationTickSchema,
})

export const achievementEventFromLegacySim = (achievement: string): AchievementUnlockedEvent =>
  Schema.decodeUnknownSync(LegacyAchievementUnlockedEventSchema)({
    _tag: 'AchievementUnlocked',
    achievement,
    player: 'player:one',
    tick: 7,
  })
