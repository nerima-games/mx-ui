import {
  AchievementIdSchema,
  EntityIdSchema,
  SimulationTickSchema,
  type DomainEvent,
  type DomainEventAchievementId,
} from '@nerima-games/mc-kernel'
import { Schema, type Brand } from 'effect'

export type AchievementToastIcon = string & Brand.Brand<'AchievementToastIcon'>
export const AchievementToastIconSchema: Schema.Codec<AchievementToastIcon, string> = Schema.NonEmptyString.pipe(
  Schema.brand('AchievementToastIcon'),
)

export type AchievementToastTitle = string & Brand.Brand<'AchievementToastTitle'>
export const AchievementToastTitleSchema: Schema.Codec<AchievementToastTitle, string> = Schema.NonEmptyString.pipe(
  Schema.brand('AchievementToastTitle'),
)

type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>

export type AchievementToast = Readonly<{
  achievement: DomainEventAchievementId
  icon: AchievementToastIcon
  player: AchievementUnlockedEvent['player']
  tick: AchievementUnlockedEvent['tick']
  title: AchievementToastTitle
}>

export const AchievementToastSchema: Schema.Codec<AchievementToast, unknown> = Schema.Struct({
  achievement: AchievementIdSchema,
  icon: AchievementToastIconSchema,
  player: EntityIdSchema,
  tick: SimulationTickSchema,
  title: AchievementToastTitleSchema,
})

type AdvancementDisplay = Readonly<{
  icon: AchievementToastIcon
  title: AchievementToastTitle
}>

const toastIcon = Schema.decodeUnknownSync(AchievementToastIconSchema)
const toastTitle = Schema.decodeUnknownSync(AchievementToastTitleSchema)
const advancementDisplay = (icon: string, title: string): AdvancementDisplay => ({
  icon: toastIcon(icon),
  title: toastTitle(title),
})

// The kernel exposes AchievementId as a branded string, so this local vanilla
// lookup is partial and preserves unknown IDs instead of claiming exhaustiveness.
const VANILLA_ADVANCEMENT_DISPLAY: Readonly<Record<string, AdvancementDisplay>> = {
  'minecraft:story/root': advancementDisplay('minecraft:crafting_table', 'Minecraft'),
  'minecraft:story/mine_stone': advancementDisplay('minecraft:wooden_pickaxe', 'Stone Age'),
  'minecraft:story/upgrade_tools': advancementDisplay('minecraft:stone_pickaxe', 'Getting an Upgrade'),
  'minecraft:story/smelt_iron': advancementDisplay('minecraft:iron_ingot', 'Acquire Hardware'),
  'minecraft:story/obtain_armor': advancementDisplay('minecraft:iron_chestplate', 'Suit Up'),
  'minecraft:story/lava_bucket': advancementDisplay('minecraft:lava_bucket', 'Hot Stuff'),
  'minecraft:story/iron_tools': advancementDisplay('minecraft:iron_pickaxe', "Isn't It Iron Pick?"),
  'minecraft:story/deflect_arrow': advancementDisplay('minecraft:shield', 'Not Today, Thank You'),
  'minecraft:story/obtain_obsidian': advancementDisplay('minecraft:obsidian', 'Ice Bucket Challenge'),
  'minecraft:story/mine_diamond': advancementDisplay('minecraft:diamond', 'Diamonds!'),
  'minecraft:story/enter_the_nether': advancementDisplay('minecraft:flint_and_steel', 'We Need to Go Deeper'),
  'minecraft:story/shiny_gear': advancementDisplay('minecraft:diamond_chestplate', 'Cover Me with Diamonds'),
  'minecraft:story/enchant_item': advancementDisplay('minecraft:enchanted_book', 'Enchanter'),
  'minecraft:story/cure_zombie_villager': advancementDisplay('minecraft:golden_apple', 'Zombie Doctor'),
  'minecraft:story/follow_ender_eye': advancementDisplay('minecraft:ender_eye', 'Eye Spy'),
  'minecraft:story/enter_the_end': advancementDisplay('minecraft:end_portal_frame', 'The End?'),
  'minecraft:nether/root': advancementDisplay('minecraft:netherrack', 'Nether'),
  'minecraft:nether/return_to_sender': advancementDisplay('minecraft:fire_charge', 'Return to Sender'),
  'minecraft:nether/find_bastion': advancementDisplay('minecraft:chiseled_polished_blackstone', 'Those Were the Days'),
  'minecraft:nether/obtain_ancient_debris': advancementDisplay('minecraft:ancient_debris', 'Hidden in the Depths'),
  'minecraft:nether/fast_travel': advancementDisplay('minecraft:map', 'Subspace Bubble'),
  'minecraft:nether/find_fortress': advancementDisplay('minecraft:nether_bricks', 'A Terrible Fortress'),
  'minecraft:nether/loot_bastion': advancementDisplay('minecraft:gold_ingot', 'War Pigs'),
  'minecraft:nether/netherite_armor': advancementDisplay('minecraft:netherite_chestplate', 'Cover Me in Debris'),
  'minecraft:nether/get_wither_skull': advancementDisplay('minecraft:wither_skeleton_skull', 'Spooky Scary Skeleton'),
  'minecraft:nether/obtain_blaze_rod': advancementDisplay('minecraft:blaze_rod', 'Into Fire'),
  'minecraft:nether/brew_potion': advancementDisplay('minecraft:potion', 'Local Brewery'),
  'minecraft:end/root': advancementDisplay('minecraft:end_stone', 'The End'),
  'minecraft:end/kill_dragon': advancementDisplay('minecraft:dragon_head', 'Free the End'),
  'minecraft:end/dragon_egg': advancementDisplay('minecraft:dragon_egg', 'The Next Generation'),
  'minecraft:end/elytra': advancementDisplay('minecraft:elytra', "Sky's the Limit"),
  'minecraft:adventure/root': advancementDisplay('minecraft:map', 'Adventure'),
  'minecraft:adventure/kill_a_mob': advancementDisplay('minecraft:iron_sword', 'Monster Hunter'),
  'minecraft:husbandry/root': advancementDisplay('minecraft:hay_block', 'Husbandry'),
  'minecraft:husbandry/plant_seed': advancementDisplay('minecraft:wheat_seeds', 'A Seedy Place'),
}

const UNKNOWN_ADVANCEMENT_ICON = toastIcon('minecraft:nether_star')

export const achievementToastFromEvent = (event: DomainEvent): AchievementToast | undefined => {
  if (event._tag !== 'AchievementUnlocked') {
    return undefined
  }

  const display = VANILLA_ADVANCEMENT_DISPLAY[event.achievement]

  return {
    achievement: event.achievement,
    icon: display?.icon ?? UNKNOWN_ADVANCEMENT_ICON,
    player: event.player,
    tick: event.tick,
    title: display?.title ?? toastTitle(event.achievement),
  }
}
