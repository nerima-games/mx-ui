import { type AchievementId, DEFAULT_UI_LANGUAGE, translateAchievementTitle } from './ui-language.js'
import {
  AchievementIdSchema,
  DomainEventSchema,
  EntityIdSchema,
  SimulationTickSchema,
} from '@nerima-games/mc-kernel'
import { type Brand, Effect, Schema } from 'effect'
import type { DomainEvent } from '@nerima-games/mc-sim'

const { decodeUnknownSync, Struct: struct } = Schema

export type AchievementToastIcon = string & Brand.Brand<'AchievementToastIcon'>
export const AchievementToastIconSchema: Schema.Codec<AchievementToastIcon, string> = Schema.NonEmptyString.pipe(
  Schema.brand('AchievementToastIcon'),
)

export type AchievementToastTitle = string & Brand.Brand<'AchievementToastTitle'>
export const AchievementToastTitleSchema: Schema.Codec<AchievementToastTitle, string> = Schema.NonEmptyString.pipe(
  Schema.brand('AchievementToastTitle'),
)

type AchievementIdValue = Schema.Schema.Type<typeof AchievementIdSchema>
type AchievementUnlockedEvent = Extract<DomainEvent, { readonly _tag: 'AchievementUnlocked' }>

export type AchievementToast = Readonly<{
  achievement: AchievementIdValue
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
}>

const toastIcon = decodeUnknownSync(AchievementToastIconSchema)
const toastTitle = decodeUnknownSync(AchievementToastTitleSchema)
const advancementDisplay = (icon: string): AdvancementDisplay => ({ icon: toastIcon(icon) })

const VANILLA_ADVANCEMENT_DISPLAY: Readonly<Record<AchievementId, AdvancementDisplay>> = {
  'minecraft:adventure/adventuring_time': advancementDisplay('minecraft:diamond_boots'),
  'minecraft:adventure/arbalistic': advancementDisplay('minecraft:crossbow'),
  'minecraft:adventure/avoid_vibration': advancementDisplay('minecraft:sculk_sensor'),
  'minecraft:adventure/blowback': advancementDisplay('minecraft:wind_charge'),
  'minecraft:adventure/brush_armadillo': advancementDisplay('minecraft:armadillo_scute'),
  'minecraft:adventure/bullseye': advancementDisplay('minecraft:target'),
  'minecraft:adventure/craft_decorated_pot_using_only_sherds': advancementDisplay('minecraft:decorated_pot'),
  'minecraft:adventure/crafters_crafting_crafters': advancementDisplay('minecraft:crafter'),
  'minecraft:adventure/fall_from_world_height': advancementDisplay('minecraft:water_bucket'),
  'minecraft:adventure/heart_transplanter': advancementDisplay('minecraft:creaking_heart'),
  'minecraft:adventure/hero_of_the_village': advancementDisplay('minecraft:white_banner'),
  'minecraft:adventure/honey_block_slide': advancementDisplay('minecraft:honey_block'),
  'minecraft:adventure/kill_a_mob': advancementDisplay('minecraft:iron_sword'),
  'minecraft:adventure/kill_all_mobs': advancementDisplay('minecraft:diamond_sword'),
  'minecraft:adventure/kill_mob_near_sculk_catalyst': advancementDisplay('minecraft:sculk_catalyst'),
  'minecraft:adventure/lighten_up': advancementDisplay('minecraft:copper_bulb'),
  'minecraft:adventure/lightning_rod_with_villager_no_fire': advancementDisplay('minecraft:lightning_rod'),
  'minecraft:adventure/minecraft_trials_edition': advancementDisplay('minecraft:chiseled_tuff'),
  'minecraft:adventure/ol_betsy': advancementDisplay('minecraft:crossbow'),
  'minecraft:adventure/overoverkill': advancementDisplay('minecraft:mace'),
  'minecraft:adventure/play_jukebox_in_meadows': advancementDisplay('minecraft:jukebox'),
  'minecraft:adventure/read_power_of_chiseled_bookshelf': advancementDisplay('minecraft:chiseled_bookshelf'),
  'minecraft:adventure/revaulting': advancementDisplay('minecraft:ominous_trial_key'),
  'minecraft:adventure/root': advancementDisplay('minecraft:map'),
  'minecraft:adventure/salvage_sherd': advancementDisplay('minecraft:brush'),
  'minecraft:adventure/shoot_arrow': advancementDisplay('minecraft:bow'),
  'minecraft:adventure/sleep_in_bed': advancementDisplay('minecraft:red_bed'),
  'minecraft:adventure/sniper_duel': advancementDisplay('minecraft:arrow'),
  'minecraft:adventure/spear_many_mobs': advancementDisplay('minecraft:iron_spear'),
  'minecraft:adventure/spyglass_at_dragon': advancementDisplay('minecraft:spyglass'),
  'minecraft:adventure/spyglass_at_ghast': advancementDisplay('minecraft:spyglass'),
  'minecraft:adventure/spyglass_at_parrot': advancementDisplay('minecraft:spyglass'),
  'minecraft:adventure/summon_iron_golem': advancementDisplay('minecraft:carved_pumpkin'),
  'minecraft:adventure/throw_trident': advancementDisplay('minecraft:trident'),
  'minecraft:adventure/totem_of_undying': advancementDisplay('minecraft:totem_of_undying'),
  'minecraft:adventure/trade': advancementDisplay('minecraft:emerald'),
  'minecraft:adventure/trade_at_world_height': advancementDisplay('minecraft:emerald'),
  'minecraft:adventure/trim_with_all_exclusive_armor_patterns': advancementDisplay('minecraft:silence_armor_trim_smithing_template'),
  'minecraft:adventure/trim_with_any_armor_pattern': advancementDisplay('minecraft:dune_armor_trim_smithing_template'),
  'minecraft:adventure/two_birds_one_arrow': advancementDisplay('minecraft:crossbow'),
  'minecraft:adventure/under_lock_and_key': advancementDisplay('minecraft:trial_key'),
  'minecraft:adventure/use_lodestone': advancementDisplay('minecraft:lodestone'),
  'minecraft:adventure/very_very_frightening': advancementDisplay('minecraft:trident'),
  'minecraft:adventure/voluntary_exile': advancementDisplay('minecraft:white_banner'),
  'minecraft:adventure/walk_on_powder_snow_with_leather_boots': advancementDisplay('minecraft:leather_boots'),
  'minecraft:adventure/who_needs_rockets': advancementDisplay('minecraft:wind_charge'),
  'minecraft:adventure/whos_the_pillager_now': advancementDisplay('minecraft:crossbow'),
  'minecraft:end/dragon_breath': advancementDisplay('minecraft:dragon_breath'),
  'minecraft:end/dragon_egg': advancementDisplay('minecraft:dragon_egg'),
  'minecraft:end/elytra': advancementDisplay('minecraft:elytra'),
  'minecraft:end/enter_end_gateway': advancementDisplay('minecraft:ender_pearl'),
  'minecraft:end/find_end_city': advancementDisplay('minecraft:purpur_block'),
  'minecraft:end/kill_dragon': advancementDisplay('minecraft:dragon_head'),
  'minecraft:end/levitate': advancementDisplay('minecraft:shulker_shell'),
  'minecraft:end/respawn_dragon': advancementDisplay('minecraft:end_crystal'),
  'minecraft:end/root': advancementDisplay('minecraft:end_stone'),
  'minecraft:husbandry/allay_deliver_cake_to_note_block': advancementDisplay('minecraft:note_block'),
  'minecraft:husbandry/allay_deliver_item_to_player': advancementDisplay('minecraft:cookie'),
  'minecraft:husbandry/axolotl_in_a_bucket': advancementDisplay('minecraft:axolotl_bucket'),
  'minecraft:husbandry/balanced_diet': advancementDisplay('minecraft:apple'),
  'minecraft:husbandry/bred_all_animals': advancementDisplay('minecraft:golden_carrot'),
  'minecraft:husbandry/breed_an_animal': advancementDisplay('minecraft:wheat'),
  'minecraft:husbandry/complete_catalogue': advancementDisplay('minecraft:cod'),
  'minecraft:husbandry/feed_snifflet': advancementDisplay('minecraft:torchflower_seeds'),
  'minecraft:husbandry/fishy_business': advancementDisplay('minecraft:fishing_rod'),
  'minecraft:husbandry/froglights': advancementDisplay('minecraft:verdant_froglight'),
  'minecraft:husbandry/kill_axolotl_target': advancementDisplay('minecraft:tropical_fish_bucket'),
  'minecraft:husbandry/leash_all_frog_variants': advancementDisplay('minecraft:lead'),
  'minecraft:husbandry/make_a_sign_glow': advancementDisplay('minecraft:glow_ink_sac'),
  'minecraft:husbandry/obtain_netherite_hoe': advancementDisplay('minecraft:netherite_hoe'),
  'minecraft:husbandry/obtain_sniffer_egg': advancementDisplay('minecraft:sniffer_egg'),
  'minecraft:husbandry/place_dried_ghast_in_water': advancementDisplay('minecraft:dried_ghast'),
  'minecraft:husbandry/plant_any_sniffer_seed': advancementDisplay('minecraft:pitcher_pod'),
  'minecraft:husbandry/plant_seed': advancementDisplay('minecraft:wheat'),
  'minecraft:husbandry/remove_wolf_armor': advancementDisplay('minecraft:shears'),
  'minecraft:husbandry/repair_wolf_armor': advancementDisplay('minecraft:wolf_armor'),
  'minecraft:husbandry/ride_a_boat_with_a_goat': advancementDisplay('minecraft:oak_boat'),
  'minecraft:husbandry/root': advancementDisplay('minecraft:hay_block'),
  'minecraft:husbandry/safely_harvest_honey': advancementDisplay('minecraft:honey_bottle'),
  'minecraft:husbandry/silk_touch_nest': advancementDisplay('minecraft:bee_nest'),
  'minecraft:husbandry/tactical_fishing': advancementDisplay('minecraft:pufferfish_bucket'),
  'minecraft:husbandry/tadpole_in_a_bucket': advancementDisplay('minecraft:tadpole_bucket'),
  'minecraft:husbandry/tame_an_animal': advancementDisplay('minecraft:lead'),
  'minecraft:husbandry/uh_oh': advancementDisplay('minecraft:tnt'),
  'minecraft:husbandry/wax_off': advancementDisplay('minecraft:stone_axe'),
  'minecraft:husbandry/wax_on': advancementDisplay('minecraft:honeycomb'),
  'minecraft:husbandry/whole_pack': advancementDisplay('minecraft:bone'),
  'minecraft:nether/all_effects': advancementDisplay('minecraft:bucket'),
  'minecraft:nether/all_potions': advancementDisplay('minecraft:milk_bucket'),
  'minecraft:nether/brew_potion': advancementDisplay('minecraft:potion'),
  'minecraft:nether/charge_respawn_anchor': advancementDisplay('minecraft:respawn_anchor'),
  'minecraft:nether/create_beacon': advancementDisplay('minecraft:beacon'),
  'minecraft:nether/create_full_beacon': advancementDisplay('minecraft:beacon'),
  'minecraft:nether/distract_piglin': advancementDisplay('minecraft:gold_ingot'),
  'minecraft:nether/explore_nether': advancementDisplay('minecraft:netherite_boots'),
  'minecraft:nether/fast_travel': advancementDisplay('minecraft:map'),
  'minecraft:nether/find_bastion': advancementDisplay('minecraft:polished_blackstone_bricks'),
  'minecraft:nether/find_fortress': advancementDisplay('minecraft:nether_bricks'),
  'minecraft:nether/get_wither_skull': advancementDisplay('minecraft:wither_skeleton_skull'),
  'minecraft:nether/loot_bastion': advancementDisplay('minecraft:chest'),
  'minecraft:nether/netherite_armor': advancementDisplay('minecraft:netherite_chestplate'),
  'minecraft:nether/obtain_ancient_debris': advancementDisplay('minecraft:ancient_debris'),
  'minecraft:nether/obtain_blaze_rod': advancementDisplay('minecraft:blaze_rod'),
  'minecraft:nether/obtain_crying_obsidian': advancementDisplay('minecraft:crying_obsidian'),
  'minecraft:nether/return_to_sender': advancementDisplay('minecraft:fire_charge'),
  'minecraft:nether/ride_strider': advancementDisplay('minecraft:warped_fungus_on_a_stick'),
  'minecraft:nether/ride_strider_in_overworld_lava': advancementDisplay('minecraft:warped_fungus_on_a_stick'),
  'minecraft:nether/root': advancementDisplay('minecraft:red_nether_bricks'),
  'minecraft:nether/summon_wither': advancementDisplay('minecraft:nether_star'),
  'minecraft:nether/uneasy_alliance': advancementDisplay('minecraft:ghast_tear'),
  'minecraft:story/cure_zombie_villager': advancementDisplay('minecraft:golden_apple'),
  'minecraft:story/deflect_arrow': advancementDisplay('minecraft:shield'),
  'minecraft:story/enchant_item': advancementDisplay('minecraft:enchanted_book'),
  'minecraft:story/enter_the_end': advancementDisplay('minecraft:end_stone'),
  'minecraft:story/enter_the_nether': advancementDisplay('minecraft:flint_and_steel'),
  'minecraft:story/follow_ender_eye': advancementDisplay('minecraft:ender_eye'),
  'minecraft:story/form_obsidian': advancementDisplay('minecraft:obsidian'),
  'minecraft:story/iron_tools': advancementDisplay('minecraft:iron_pickaxe'),
  'minecraft:story/lava_bucket': advancementDisplay('minecraft:lava_bucket'),
  'minecraft:story/mine_diamond': advancementDisplay('minecraft:diamond'),
  'minecraft:story/mine_stone': advancementDisplay('minecraft:wooden_pickaxe'),
  'minecraft:story/obtain_armor': advancementDisplay('minecraft:iron_chestplate'),
  'minecraft:story/root': advancementDisplay('minecraft:grass_block'),
  'minecraft:story/shiny_gear': advancementDisplay('minecraft:diamond_chestplate'),
  'minecraft:story/smelt_iron': advancementDisplay('minecraft:iron_ingot'),
  'minecraft:story/upgrade_tools': advancementDisplay('minecraft:stone_pickaxe'),
}

export const achievementToastFromEvent = (
  event: unknown,
): Effect.Effect<AchievementToast | null, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(DomainEventSchema)(event).pipe(
    Effect.flatMap((decodedEvent) => {
      if (decodedEvent['_tag'] !== 'AchievementUnlocked') {
        return Effect.succeed(null)
      }

      return Schema.decodeUnknownEffect(AchievementIdSchema)(decodedEvent.achievement).pipe(
        Effect.flatMap((achievement) =>
          Effect.map(Schema.encodeUnknownEffect(AchievementIdSchema)(achievement), (achievementId) => {
            const display = VANILLA_ADVANCEMENT_DISPLAY[achievementId]

            return {
              achievement,
              icon: display.icon,
              player: decodedEvent.player,
              tick: decodedEvent.tick,
              title: toastTitle(translateAchievementTitle(DEFAULT_UI_LANGUAGE, achievementId)),
            }
          }),
        ),
      )
    }),
  )
