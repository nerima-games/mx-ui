import {
  AchievementIdSchema,
  type DomainEvent,
  type DomainEventAchievementId,
  EntityIdSchema,
  SimulationTickSchema,
} from '@nerima-games/mc-kernel'
import { type Brand, Schema } from 'effect'

const { decodeUnknownSync, Struct: struct } = Schema

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

export const AchievementToastSchema: Schema.Codec<AchievementToast, unknown> = struct({
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

const toastIcon = decodeUnknownSync(AchievementToastIconSchema)
const toastTitle = decodeUnknownSync(AchievementToastTitleSchema)
const advancementDisplay = (icon: string, title: string): AdvancementDisplay => ({
  icon: toastIcon(icon),
  title: toastTitle(title),
})

// Keep this partial until mc-kernel publishes its finite AchievementId catalog.
const VANILLA_ADVANCEMENT_DISPLAY: Readonly<Partial<Record<string, AdvancementDisplay>>> = {
  'minecraft:adventure/kill_a_mob': advancementDisplay('minecraft:iron_sword', 'Monster Hunter'),
  'minecraft:adventure/root': advancementDisplay('minecraft:map', 'Adventure'),
  'minecraft:end/dragon_egg': advancementDisplay('minecraft:dragon_egg', 'The Next Generation'),
  'minecraft:end/elytra': advancementDisplay('minecraft:elytra', "Sky's the Limit"),
  'minecraft:end/kill_dragon': advancementDisplay('minecraft:dragon_head', 'Free the End'),
  'minecraft:end/root': advancementDisplay('minecraft:end_stone', 'The End'),
  'minecraft:husbandry/plant_seed': advancementDisplay('minecraft:wheat_seeds', 'A Seedy Place'),
  'minecraft:husbandry/root': advancementDisplay('minecraft:hay_block', 'Husbandry'),
  'minecraft:nether/brew_potion': advancementDisplay('minecraft:potion', 'Local Brewery'),
  'minecraft:nether/fast_travel': advancementDisplay('minecraft:map', 'Subspace Bubble'),
  'minecraft:nether/find_bastion': advancementDisplay('minecraft:chiseled_polished_blackstone', 'Those Were the Days'),
  'minecraft:nether/find_fortress': advancementDisplay('minecraft:nether_bricks', 'A Terrible Fortress'),
  'minecraft:nether/get_wither_skull': advancementDisplay('minecraft:wither_skeleton_skull', 'Spooky Scary Skeleton'),
  'minecraft:nether/loot_bastion': advancementDisplay('minecraft:gold_ingot', 'War Pigs'),
  'minecraft:nether/netherite_armor': advancementDisplay('minecraft:netherite_chestplate', 'Cover Me in Debris'),
  'minecraft:nether/obtain_ancient_debris': advancementDisplay('minecraft:ancient_debris', 'Hidden in the Depths'),
  'minecraft:nether/obtain_blaze_rod': advancementDisplay('minecraft:blaze_rod', 'Into Fire'),
  'minecraft:nether/return_to_sender': advancementDisplay('minecraft:fire_charge', 'Return to Sender'),
  'minecraft:nether/root': advancementDisplay('minecraft:netherrack', 'Nether'),
  'minecraft:story/cure_zombie_villager': advancementDisplay('minecraft:golden_apple', 'Zombie Doctor'),
  'minecraft:story/deflect_arrow': advancementDisplay('minecraft:shield', 'Not Today, Thank You'),
  'minecraft:story/enchant_item': advancementDisplay('minecraft:enchanted_book', 'Enchanter'),
  'minecraft:story/enter_the_end': advancementDisplay('minecraft:end_portal_frame', 'The End?'),
  'minecraft:story/enter_the_nether': advancementDisplay('minecraft:flint_and_steel', 'We Need to Go Deeper'),
  'minecraft:story/follow_ender_eye': advancementDisplay('minecraft:ender_eye', 'Eye Spy'),
  'minecraft:story/form_obsidian': advancementDisplay('minecraft:obsidian', 'Ice Bucket Challenge'),
  'minecraft:story/iron_tools': advancementDisplay('minecraft:iron_pickaxe', "Isn't It Iron Pick?"),
  'minecraft:story/lava_bucket': advancementDisplay('minecraft:lava_bucket', 'Hot Stuff'),
  'minecraft:story/mine_diamond': advancementDisplay('minecraft:diamond', 'Diamonds!'),
  'minecraft:story/mine_stone': advancementDisplay('minecraft:wooden_pickaxe', 'Stone Age'),
  'minecraft:story/obtain_armor': advancementDisplay('minecraft:iron_chestplate', 'Suit Up'),
  'minecraft:story/root': advancementDisplay('minecraft:crafting_table', 'Minecraft'),
  'minecraft:story/shiny_gear': advancementDisplay('minecraft:diamond_chestplate', 'Cover Me with Diamonds'),
  'minecraft:story/smelt_iron': advancementDisplay('minecraft:iron_ingot', 'Acquire Hardware'),
  'minecraft:story/upgrade_tools': advancementDisplay('minecraft:stone_pickaxe', 'Getting an Upgrade'),
}

export const achievementToastFromEvent = (event: DomainEvent): AchievementToast | null => {
  if (event['_tag'] !== 'AchievementUnlocked') {
    return null
  }

  const display = VANILLA_ADVANCEMENT_DISPLAY[event.achievement]
  if (typeof display === 'undefined') {
    return null
  }

  return {
    achievement: event.achievement,
    icon: display.icon,
    player: event.player,
    tick: event.tick,
    title: display.title,
  }
}
