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

type AchievementId = Schema.Codec.Encoded<typeof AchievementIdSchema>
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
  title: AchievementToastTitle
}>

const toastIcon = decodeUnknownSync(AchievementToastIconSchema)
const toastTitle = decodeUnknownSync(AchievementToastTitleSchema)
const advancementDisplay = (icon: string, title: string): AdvancementDisplay => ({
  icon: toastIcon(icon),
  title: toastTitle(title),
})

const VANILLA_ADVANCEMENT_DISPLAY: Readonly<Record<AchievementId, AdvancementDisplay>> = {
  'minecraft:adventure/adventuring_time': advancementDisplay('minecraft:diamond_boots', 'Adventuring Time'),
  'minecraft:adventure/arbalistic': advancementDisplay('minecraft:crossbow', 'Arbalistic'),
  'minecraft:adventure/avoid_vibration': advancementDisplay('minecraft:sculk_sensor', 'Sneak 100'),
  'minecraft:adventure/blowback': advancementDisplay('minecraft:wind_charge', 'Blowback'),
  'minecraft:adventure/brush_armadillo': advancementDisplay('minecraft:armadillo_scute', 'Isn\'t It Scute?'),
  'minecraft:adventure/bullseye': advancementDisplay('minecraft:target', 'Bullseye'),
  'minecraft:adventure/craft_decorated_pot_using_only_sherds': advancementDisplay('minecraft:decorated_pot', 'Careful Restoration'),
  'minecraft:adventure/crafters_crafting_crafters': advancementDisplay('minecraft:crafter', 'Crafters Crafting Crafters'),
  'minecraft:adventure/fall_from_world_height': advancementDisplay('minecraft:water_bucket', 'Caves & Cliffs'),
  'minecraft:adventure/heart_transplanter': advancementDisplay('minecraft:creaking_heart', 'Heart Transplanter'),
  'minecraft:adventure/hero_of_the_village': advancementDisplay('minecraft:white_banner', 'Hero of the Village'),
  'minecraft:adventure/honey_block_slide': advancementDisplay('minecraft:honey_block', 'Sticky Situation'),
  'minecraft:adventure/kill_a_mob': advancementDisplay('minecraft:iron_sword', 'Monster Hunter'),
  'minecraft:adventure/kill_all_mobs': advancementDisplay('minecraft:diamond_sword', 'Monsters Hunted'),
  'minecraft:adventure/kill_mob_near_sculk_catalyst': advancementDisplay('minecraft:sculk_catalyst', 'It Spreads'),
  'minecraft:adventure/lighten_up': advancementDisplay('minecraft:copper_bulb', 'Lighten Up'),
  'minecraft:adventure/lightning_rod_with_villager_no_fire': advancementDisplay('minecraft:lightning_rod', 'Surge Protector'),
  'minecraft:adventure/minecraft_trials_edition': advancementDisplay('minecraft:chiseled_tuff', 'Minecraft: Trial(s) Edition'),
  'minecraft:adventure/ol_betsy': advancementDisplay('minecraft:crossbow', 'Ol\' Betsy'),
  'minecraft:adventure/overoverkill': advancementDisplay('minecraft:mace', 'Over-Overkill'),
  'minecraft:adventure/play_jukebox_in_meadows': advancementDisplay('minecraft:jukebox', 'Sound of Music'),
  'minecraft:adventure/read_power_of_chiseled_bookshelf': advancementDisplay('minecraft:chiseled_bookshelf', 'The Power of Books'),
  'minecraft:adventure/revaulting': advancementDisplay('minecraft:ominous_trial_key', 'Revaulting'),
  'minecraft:adventure/root': advancementDisplay('minecraft:map', 'Adventure'),
  'minecraft:adventure/salvage_sherd': advancementDisplay('minecraft:brush', 'Respecting the Remnants'),
  'minecraft:adventure/shoot_arrow': advancementDisplay('minecraft:bow', 'Take Aim'),
  'minecraft:adventure/sleep_in_bed': advancementDisplay('minecraft:red_bed', 'Sweet Dreams'),
  'minecraft:adventure/sniper_duel': advancementDisplay('minecraft:arrow', 'Sniper Duel'),
  'minecraft:adventure/spear_many_mobs': advancementDisplay('minecraft:iron_spear', 'Mob Kabob'),
  'minecraft:adventure/spyglass_at_dragon': advancementDisplay('minecraft:spyglass', 'Is It a Plane?'),
  'minecraft:adventure/spyglass_at_ghast': advancementDisplay('minecraft:spyglass', 'Is It a Balloon?'),
  'minecraft:adventure/spyglass_at_parrot': advancementDisplay('minecraft:spyglass', 'Is It a Bird?'),
  'minecraft:adventure/summon_iron_golem': advancementDisplay('minecraft:carved_pumpkin', 'Hired Help'),
  'minecraft:adventure/throw_trident': advancementDisplay('minecraft:trident', 'A Throwaway Joke'),
  'minecraft:adventure/totem_of_undying': advancementDisplay('minecraft:totem_of_undying', 'Postmortal'),
  'minecraft:adventure/trade': advancementDisplay('minecraft:emerald', 'What a Deal!'),
  'minecraft:adventure/trade_at_world_height': advancementDisplay('minecraft:emerald', 'Star Trader'),
  'minecraft:adventure/trim_with_all_exclusive_armor_patterns': advancementDisplay('minecraft:silence_armor_trim_smithing_template', 'Smithing with Style'),
  'minecraft:adventure/trim_with_any_armor_pattern': advancementDisplay('minecraft:dune_armor_trim_smithing_template', 'Crafting a New Look'),
  'minecraft:adventure/two_birds_one_arrow': advancementDisplay('minecraft:crossbow', 'Two Birds, One Arrow'),
  'minecraft:adventure/under_lock_and_key': advancementDisplay('minecraft:trial_key', 'Under Lock and Key'),
  'minecraft:adventure/use_lodestone': advancementDisplay('minecraft:lodestone', 'Country Lode, Take Me Home'),
  'minecraft:adventure/very_very_frightening': advancementDisplay('minecraft:trident', 'Very Very Frightening'),
  'minecraft:adventure/voluntary_exile': advancementDisplay('minecraft:white_banner', 'Voluntary Exile'),
  'minecraft:adventure/walk_on_powder_snow_with_leather_boots': advancementDisplay('minecraft:leather_boots', 'Light as a Rabbit'),
  'minecraft:adventure/who_needs_rockets': advancementDisplay('minecraft:wind_charge', 'Who Needs Rockets?'),
  'minecraft:adventure/whos_the_pillager_now': advancementDisplay('minecraft:crossbow', 'Who\'s the Pillager Now?'),
  'minecraft:end/dragon_breath': advancementDisplay('minecraft:dragon_breath', 'You Need a Mint'),
  'minecraft:end/dragon_egg': advancementDisplay('minecraft:dragon_egg', 'The Next Generation'),
  'minecraft:end/elytra': advancementDisplay('minecraft:elytra', 'Sky\'s the Limit'),
  'minecraft:end/enter_end_gateway': advancementDisplay('minecraft:ender_pearl', 'Remote Getaway'),
  'minecraft:end/find_end_city': advancementDisplay('minecraft:purpur_block', 'The City at the End of the Game'),
  'minecraft:end/kill_dragon': advancementDisplay('minecraft:dragon_head', 'Free the End'),
  'minecraft:end/levitate': advancementDisplay('minecraft:shulker_shell', 'Great View From Up Here'),
  'minecraft:end/respawn_dragon': advancementDisplay('minecraft:end_crystal', 'The End... Again...'),
  'minecraft:end/root': advancementDisplay('minecraft:end_stone', 'The End'),
  'minecraft:husbandry/allay_deliver_cake_to_note_block': advancementDisplay('minecraft:note_block', 'Birthday Song'),
  'minecraft:husbandry/allay_deliver_item_to_player': advancementDisplay('minecraft:cookie', 'You\'ve Got a Friend in Me'),
  'minecraft:husbandry/axolotl_in_a_bucket': advancementDisplay('minecraft:axolotl_bucket', 'The Cutest Predator'),
  'minecraft:husbandry/balanced_diet': advancementDisplay('minecraft:apple', 'A Balanced Diet'),
  'minecraft:husbandry/bred_all_animals': advancementDisplay('minecraft:golden_carrot', 'Two by Two'),
  'minecraft:husbandry/breed_an_animal': advancementDisplay('minecraft:wheat', 'The Parrots and the Bats'),
  'minecraft:husbandry/complete_catalogue': advancementDisplay('minecraft:cod', 'A Complete Catalogue'),
  'minecraft:husbandry/feed_snifflet': advancementDisplay('minecraft:torchflower_seeds', 'Little Sniffs'),
  'minecraft:husbandry/fishy_business': advancementDisplay('minecraft:fishing_rod', 'Fishy Business'),
  'minecraft:husbandry/froglights': advancementDisplay('minecraft:verdant_froglight', 'With Our Powers Combined!'),
  'minecraft:husbandry/kill_axolotl_target': advancementDisplay('minecraft:tropical_fish_bucket', 'The Healing Power of Friendship!'),
  'minecraft:husbandry/leash_all_frog_variants': advancementDisplay('minecraft:lead', 'When the Squad Hops into Town'),
  'minecraft:husbandry/make_a_sign_glow': advancementDisplay('minecraft:glow_ink_sac', 'Glow and Behold!'),
  'minecraft:husbandry/obtain_netherite_hoe': advancementDisplay('minecraft:netherite_hoe', 'Serious Dedication'),
  'minecraft:husbandry/obtain_sniffer_egg': advancementDisplay('minecraft:sniffer_egg', 'Smells Interesting'),
  'minecraft:husbandry/place_dried_ghast_in_water': advancementDisplay('minecraft:dried_ghast', 'Stay Hydrated!'),
  'minecraft:husbandry/plant_any_sniffer_seed': advancementDisplay('minecraft:pitcher_pod', 'Planting the Past'),
  'minecraft:husbandry/plant_seed': advancementDisplay('minecraft:wheat', 'A Seedy Place'),
  'minecraft:husbandry/remove_wolf_armor': advancementDisplay('minecraft:shears', 'Shear Brilliance'),
  'minecraft:husbandry/repair_wolf_armor': advancementDisplay('minecraft:wolf_armor', 'Good as New'),
  'minecraft:husbandry/ride_a_boat_with_a_goat': advancementDisplay('minecraft:oak_boat', 'Whatever Floats Your Goat!'),
  'minecraft:husbandry/root': advancementDisplay('minecraft:hay_block', 'Husbandry'),
  'minecraft:husbandry/safely_harvest_honey': advancementDisplay('minecraft:honey_bottle', 'Bee Our Guest'),
  'minecraft:husbandry/silk_touch_nest': advancementDisplay('minecraft:bee_nest', 'Total Beelocation'),
  'minecraft:husbandry/tactical_fishing': advancementDisplay('minecraft:pufferfish_bucket', 'Tactical Fishing'),
  'minecraft:husbandry/tadpole_in_a_bucket': advancementDisplay('minecraft:tadpole_bucket', 'Bukkit Bukkit'),
  'minecraft:husbandry/tame_an_animal': advancementDisplay('minecraft:lead', 'Best Friends Forever'),
  'minecraft:husbandry/uh_oh': advancementDisplay('minecraft:tnt', 'Uh Oh'),
  'minecraft:husbandry/wax_off': advancementDisplay('minecraft:stone_axe', 'Wax Off'),
  'minecraft:husbandry/wax_on': advancementDisplay('minecraft:honeycomb', 'Wax On'),
  'minecraft:husbandry/whole_pack': advancementDisplay('minecraft:bone', 'The Whole Pack'),
  'minecraft:nether/all_effects': advancementDisplay('minecraft:bucket', 'How Did We Get Here?'),
  'minecraft:nether/all_potions': advancementDisplay('minecraft:milk_bucket', 'A Furious Cocktail'),
  'minecraft:nether/brew_potion': advancementDisplay('minecraft:potion', 'Local Brewery'),
  'minecraft:nether/charge_respawn_anchor': advancementDisplay('minecraft:respawn_anchor', 'Not Quite "Nine" Lives'),
  'minecraft:nether/create_beacon': advancementDisplay('minecraft:beacon', 'Bring Home the Beacon'),
  'minecraft:nether/create_full_beacon': advancementDisplay('minecraft:beacon', 'Beaconator'),
  'minecraft:nether/distract_piglin': advancementDisplay('minecraft:gold_ingot', 'Oh Shiny'),
  'minecraft:nether/explore_nether': advancementDisplay('minecraft:netherite_boots', 'Hot Tourist Destinations'),
  'minecraft:nether/fast_travel': advancementDisplay('minecraft:map', 'Subspace Bubble'),
  'minecraft:nether/find_bastion': advancementDisplay('minecraft:polished_blackstone_bricks', 'Those Were the Days'),
  'minecraft:nether/find_fortress': advancementDisplay('minecraft:nether_bricks', 'A Terrible Fortress'),
  'minecraft:nether/get_wither_skull': advancementDisplay('minecraft:wither_skeleton_skull', 'Spooky Scary Skeleton'),
  'minecraft:nether/loot_bastion': advancementDisplay('minecraft:chest', 'War Pigs'),
  'minecraft:nether/netherite_armor': advancementDisplay('minecraft:netherite_chestplate', 'Cover Me in Debris'),
  'minecraft:nether/obtain_ancient_debris': advancementDisplay('minecraft:ancient_debris', 'Hidden in the Depths'),
  'minecraft:nether/obtain_blaze_rod': advancementDisplay('minecraft:blaze_rod', 'Into Fire'),
  'minecraft:nether/obtain_crying_obsidian': advancementDisplay('minecraft:crying_obsidian', 'Who is Cutting Onions?'),
  'minecraft:nether/return_to_sender': advancementDisplay('minecraft:fire_charge', 'Return to Sender'),
  'minecraft:nether/ride_strider': advancementDisplay('minecraft:warped_fungus_on_a_stick', 'This Boat Has Legs'),
  'minecraft:nether/ride_strider_in_overworld_lava': advancementDisplay('minecraft:warped_fungus_on_a_stick', 'Feels Like Home'),
  'minecraft:nether/root': advancementDisplay('minecraft:red_nether_bricks', 'Nether'),
  'minecraft:nether/summon_wither': advancementDisplay('minecraft:nether_star', 'Withering Heights'),
  'minecraft:nether/uneasy_alliance': advancementDisplay('minecraft:ghast_tear', 'Uneasy Alliance'),
  'minecraft:story/cure_zombie_villager': advancementDisplay('minecraft:golden_apple', 'Zombie Doctor'),
  'minecraft:story/deflect_arrow': advancementDisplay('minecraft:shield', 'Not Today, Thank You'),
  'minecraft:story/enchant_item': advancementDisplay('minecraft:enchanted_book', 'Enchanter'),
  'minecraft:story/enter_the_end': advancementDisplay('minecraft:end_stone', 'The End?'),
  'minecraft:story/enter_the_nether': advancementDisplay('minecraft:flint_and_steel', 'We Need to Go Deeper'),
  'minecraft:story/follow_ender_eye': advancementDisplay('minecraft:ender_eye', 'Eye Spy'),
  'minecraft:story/form_obsidian': advancementDisplay('minecraft:obsidian', 'Ice Bucket Challenge'),
  'minecraft:story/iron_tools': advancementDisplay('minecraft:iron_pickaxe', 'Isn\'t It Iron Pick'),
  'minecraft:story/lava_bucket': advancementDisplay('minecraft:lava_bucket', 'Hot Stuff'),
  'minecraft:story/mine_diamond': advancementDisplay('minecraft:diamond', 'Diamonds!'),
  'minecraft:story/mine_stone': advancementDisplay('minecraft:wooden_pickaxe', 'Stone Age'),
  'minecraft:story/obtain_armor': advancementDisplay('minecraft:iron_chestplate', 'Suit Up'),
  'minecraft:story/root': advancementDisplay('minecraft:grass_block', 'Minecraft'),
  'minecraft:story/shiny_gear': advancementDisplay('minecraft:diamond_chestplate', 'Cover Me with Diamonds'),
  'minecraft:story/smelt_iron': advancementDisplay('minecraft:iron_ingot', 'Acquire Hardware'),
  'minecraft:story/upgrade_tools': advancementDisplay('minecraft:stone_pickaxe', 'Getting an Upgrade'),
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
              title: display.title,
            }
          }),
        ),
      )
    }),
  )
