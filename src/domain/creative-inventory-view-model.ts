import { type Brand, Option, Result, Schema } from 'effect'
import {
  type DisplayNames,
  ITEM_DISPLAY_NAMES,
  ITEM_TYPES,
  type ItemType,
  isItemType,
} from '@nerima-games/mc-kernel'
import { type ItemDisplayNameResolver, resolveItemDisplayName } from './item-display-name.js'

export const CREATIVE_ITEM_CATEGORIES = [
  'building',
  'combat',
  'equipment',
  'food',
  'materials',
  'miscellaneous',
  'nature',
  'redstone',
  'transportation',
] as const

export type CreativeItemCategory = (typeof CREATIVE_ITEM_CATEGORIES)[number]
export type CreativeItemCategoryFilter = CreativeItemCategory | 'all'

export type CreativeSearchQuery = string & Brand.Brand<'CreativeSearchQuery'>
export const CreativeSearchQuerySchema: Schema.Codec<CreativeSearchQuery, string> =
  Schema.String.pipe(Schema.brand('CreativeSearchQuery'))
export type CreativeSearchQueryFailure = Readonly<{ readonly _tag: 'InvalidCreativeSearchQuery' }>

export const creativeSearchQueryOf = (
  input: unknown,
): Result.Result<CreativeSearchQuery, CreativeSearchQueryFailure> => {
  const decoded = Schema.decodeUnknownResult(CreativeSearchQuerySchema)(input)
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: 'InvalidCreativeSearchQuery' })
  }
  return Result.succeed(decoded.success)
}

export type CreativeInventoryItem = Readonly<{
  readonly itemId: ItemType
  readonly category: CreativeItemCategory
  readonly displayNames: DisplayNames
}>

export type CreativeInventoryCategoryView = Readonly<{
  readonly category: CreativeItemCategory
  readonly items: ReadonlyArray<CreativeInventoryItem>
}>

export type CreativeInventoryViewModel = Readonly<{
  readonly query: CreativeSearchQuery
  readonly category: CreativeItemCategoryFilter
  readonly categories: ReadonlyArray<CreativeInventoryCategoryView>
  readonly items: ReadonlyArray<CreativeInventoryItem>
}>

export type CreativeTakeItemOperation = Readonly<{
  readonly kind: 'take-item'
  readonly itemId: ItemType
}>

export type CreativeTakeItemFailure = Readonly<{ readonly _tag: 'InvalidItemId' }>

const CREATIVE_ITEM_CATEGORY_BY_ID = {
  'amethyst_block': 'building',
  'amethyst_shard': 'materials',
  'andesite': 'building',
  'anvil': 'building',
  'apple': 'food',
  'arrow': 'combat',
  'awkward_potion': 'miscellaneous',
  'baked_potato': 'food',
  'bed': 'building',
  'beef': 'food',
  'beetroot': 'food',
  'beetroot_soup': 'food',
  'black_banner': 'miscellaneous',
  'black_dye': 'materials',
  'blaze_powder': 'materials',
  'blaze_rod': 'materials',
  'blue_banner': 'miscellaneous',
  'blue_dye': 'materials',
  'bone': 'materials',
  'bone_meal': 'materials',
  'book': 'equipment',
  'bow': 'combat',
  'bowl': 'miscellaneous',
  'bread': 'food',
  'brewing_stand': 'building',
  'brick': 'materials',
  'brown_banner': 'miscellaneous',
  'brown_dye': 'materials',
  'brown_mushroom': 'nature',
  'bucket': 'equipment',
  'cactus': 'nature',
  'calcite': 'building',
  'carrot': 'food',
  'cauldron': 'building',
  'charcoal': 'materials',
  'chest': 'building',
  'chicken': 'food',
  'chorus_flower': 'nature',
  'chorus_fruit': 'food',
  'chorus_plant': 'nature',
  'clock': 'equipment',
  'coal': 'materials',
  'coal_block': 'building',
  'coal_ore': 'materials',
  'cobblestone': 'building',
  'cod': 'food',
  'comparator': 'redstone',
  'compass': 'equipment',
  'cooked_beef': 'food',
  'cooked_chicken': 'food',
  'cooked_cod': 'food',
  'cooked_mutton': 'food',
  'cooked_porkchop': 'food',
  'cooked_rabbit': 'food',
  'cooked_salmon': 'food',
  'cookie': 'food',
  'copper_ingot': 'materials',
  'copper_ore': 'materials',
  'crafting_table': 'building',
  'cyan_banner': 'miscellaneous',
  'cyan_dye': 'materials',
  'dandelion': 'nature',
  'decorated_pot': 'miscellaneous',
  'deepslate': 'building',
  'deepslate_coal_ore': 'materials',
  'deepslate_copper_ore': 'materials',
  'deepslate_diamond_ore': 'materials',
  'deepslate_emerald_ore': 'materials',
  'deepslate_gold_ore': 'materials',
  'deepslate_iron_ore': 'materials',
  'deepslate_lapis_ore': 'materials',
  'deepslate_redstone_ore': 'redstone',
  'diamond': 'materials',
  'diamond_axe': 'equipment',
  'diamond_block': 'building',
  'diamond_boots': 'combat',
  'diamond_chestplate': 'combat',
  'diamond_helmet': 'combat',
  'diamond_hoe': 'equipment',
  'diamond_leggings': 'combat',
  'diamond_ore': 'materials',
  'diamond_pickaxe': 'equipment',
  'diamond_shovel': 'equipment',
  'diamond_sword': 'combat',
  'diorite': 'building',
  'dirt': 'building',
  'dispenser': 'redstone',
  'door': 'building',
  'dragon_breath': 'materials',
  'dragon_egg': 'nature',
  'dried_kelp': 'food',
  'dropper': 'redstone',
  'elytra': 'equipment',
  'emerald': 'materials',
  'emerald_block': 'building',
  'emerald_ore': 'materials',
  'enchanted_book': 'equipment',
  'enchanted_golden_apple': 'food',
  'enchanting_table': 'building',
  'end_crystal': 'nature',
  'end_portal_frame': 'building',
  'end_portal_frame_filled': 'building',
  'end_rod': 'nature',
  'end_stone': 'building',
  'end_stone_bricks': 'building',
  'ender_chest': 'miscellaneous',
  'ender_pearl': 'materials',
  'eye_of_ender': 'miscellaneous',
  'feather': 'materials',
  'fern': 'nature',
  'filled_map': 'equipment',
  'fire_charge': 'combat',
  'firework_rocket': 'equipment',
  'firework_star': 'combat',
  'fishing_rod': 'equipment',
  'flint': 'materials',
  'flint_and_steel': 'equipment',
  'furnace': 'building',
  'ghast_tear': 'miscellaneous',
  'glass': 'building',
  'glass_bottle': 'equipment',
  'glistering_melon_slice': 'materials',
  'glow_berries': 'miscellaneous',
  'glowstone': 'building',
  'glowstone_dust': 'miscellaneous',
  'gold_axe': 'equipment',
  'gold_block': 'building',
  'gold_boots': 'combat',
  'gold_chestplate': 'combat',
  'gold_helmet': 'combat',
  'gold_hoe': 'equipment',
  'gold_ingot': 'materials',
  'gold_leggings': 'combat',
  'gold_nugget': 'materials',
  'gold_ore': 'materials',
  'gold_pickaxe': 'equipment',
  'gold_shovel': 'equipment',
  'gold_sword': 'combat',
  'golden_apple': 'food',
  'golden_carrot': 'food',
  'granite': 'building',
  'grass_block': 'building',
  'gravel': 'building',
  'gray_banner': 'miscellaneous',
  'gray_dye': 'materials',
  'green_banner': 'miscellaneous',
  'green_dye': 'materials',
  'gunpowder': 'materials',
  'honey_bottle': 'food',
  'hopper': 'redstone',
  'ink_sac': 'materials',
  'iron_axe': 'equipment',
  'iron_block': 'building',
  'iron_boots': 'combat',
  'iron_chestplate': 'combat',
  'iron_helmet': 'combat',
  'iron_hoe': 'equipment',
  'iron_ingot': 'materials',
  'iron_leggings': 'combat',
  'iron_ore': 'materials',
  'iron_pickaxe': 'equipment',
  'iron_shovel': 'equipment',
  'iron_sword': 'combat',
  'kelp': 'nature',
  'ladder': 'building',
  'lapis_block': 'building',
  'lapis_lazuli': 'materials',
  'lapis_ore': 'materials',
  'lava_bucket': 'equipment',
  'leather': 'materials',
  'leather_boots': 'combat',
  'leather_chestplate': 'combat',
  'leather_helmet': 'combat',
  'leather_leggings': 'combat',
  'lever': 'redstone',
  'light_blue_banner': 'miscellaneous',
  'light_blue_dye': 'materials',
  'light_gray_banner': 'miscellaneous',
  'light_gray_dye': 'materials',
  'lily_pad': 'nature',
  'lime_banner': 'miscellaneous',
  'lime_dye': 'materials',
  'magenta_banner': 'miscellaneous',
  'magenta_dye': 'materials',
  'melon_slice': 'food',
  'minecart': 'transportation',
  'mushroom_stew': 'food',
  'mutton': 'food',
  'name_tag': 'equipment',
  'nether_brick': 'building',
  'nether_star': 'materials',
  'nether_wart': 'nature',
  'netherite_axe': 'equipment',
  'netherite_boots': 'combat',
  'netherite_chestplate': 'combat',
  'netherite_helmet': 'combat',
  'netherite_hoe': 'equipment',
  'netherite_ingot': 'materials',
  'netherite_leggings': 'combat',
  'netherite_pickaxe': 'equipment',
  'netherite_scrap': 'materials',
  'netherite_shovel': 'equipment',
  'netherite_sword': 'combat',
  'netherite_upgrade_smithing_template': 'materials',
  'netherrack': 'building',
  'oak_boat': 'transportation',
  'oak_leaves': 'nature',
  'oak_log': 'building',
  'oak_planks': 'building',
  'oak_stairs': 'building',
  'observer': 'redstone',
  'obsidian': 'building',
  'orange_banner': 'miscellaneous',
  'orange_dye': 'materials',
  'paper': 'materials',
  'pink_banner': 'miscellaneous',
  'pink_dye': 'materials',
  'piston': 'redstone',
  'poisonous_potato': 'food',
  'popped_chorus_fruit': 'materials',
  'poppy': 'nature',
  'porkchop': 'food',
  'potato': 'food',
  'potion_of_healing': 'miscellaneous',
  'potion_of_healing_ii': 'miscellaneous',
  'potion_of_poison': 'combat',
  'potion_of_regeneration': 'miscellaneous',
  'potion_of_swiftness': 'miscellaneous',
  'potion_of_swiftness_ii': 'miscellaneous',
  'potion_of_swiftness_long': 'miscellaneous',
  'powered_rail': 'transportation',
  'pressure_plate': 'redstone',
  'prismarine': 'building',
  'prismarine_shard': 'materials',
  'pufferfish': 'food',
  'pumpkin_pie': 'food',
  'purple_banner': 'miscellaneous',
  'purple_dye': 'materials',
  'purpur_block': 'building',
  'purpur_pillar': 'building',
  'purpur_slab': 'building',
  'purpur_stairs': 'building',
  'rabbit': 'food',
  'rabbit_stew': 'food',
  'rail': 'transportation',
  'raw_copper': 'materials',
  'raw_gold': 'materials',
  'raw_iron': 'materials',
  'red_banner': 'miscellaneous',
  'red_dye': 'materials',
  'red_mushroom': 'nature',
  'redstone_block': 'redstone',
  'redstone_dust': 'redstone',
  'redstone_lamp': 'redstone',
  'redstone_ore': 'redstone',
  'redstone_torch': 'redstone',
  'repeater': 'redstone',
  'rotten_flesh': 'food',
  'saddle': 'equipment',
  'salmon': 'food',
  'sand': 'building',
  'sandstone': 'building',
  'sapling': 'nature',
  'seagrass': 'nature',
  'shears': 'equipment',
  'shield': 'combat',
  'shulker_box': 'building',
  'shulker_shell': 'materials',
  'smooth_basalt': 'building',
  'snowball': 'miscellaneous',
  'soul_sand': 'building',
  'soul_soil': 'materials',
  'spider_eye': 'miscellaneous',
  'spyglass': 'equipment',
  'stick': 'materials',
  'stone': 'building',
  'stone_axe': 'equipment',
  'stone_button': 'redstone',
  'stone_hoe': 'equipment',
  'stone_pickaxe': 'equipment',
  'stone_shovel': 'equipment',
  'stone_slab': 'building',
  'stone_sword': 'combat',
  'string': 'materials',
  'sugar': 'materials',
  'sugar_cane': 'nature',
  'sweet_berries': 'food',
  'tall_grass': 'nature',
  'tnt': 'building',
  'torch': 'building',
  'tropical_fish': 'food',
  'water_bottle': 'food',
  'water_bucket': 'equipment',
  'wheat': 'food',
  'wheat_seeds': 'nature',
  'white_banner': 'miscellaneous',
  'white_dye': 'materials',
  'wither_skeleton_skull': 'materials',
  'wooden_axe': 'equipment',
  'wooden_hoe': 'equipment',
  'wooden_pickaxe': 'equipment',
  'wooden_shovel': 'equipment',
  'wooden_sword': 'combat',
  'wool': 'nature',
  'writable_book': 'equipment',
  'written_book': 'equipment',
  'yellow_banner': 'miscellaneous',
  'yellow_dye': 'materials',
} satisfies Readonly<Record<ItemType, CreativeItemCategory>>

const categoryOf = (itemId: ItemType): CreativeItemCategory => CREATIVE_ITEM_CATEGORY_BY_ID[itemId]

const EMPTY_QUERY_LENGTH = 0

export const creativeItemCategoryOf = (input: unknown): Result.Result<CreativeItemCategory, CreativeTakeItemFailure> => {
  if (!isItemType(input)) {
    return Result.fail({ _tag: 'InvalidItemId' })
  }
  return Result.succeed(categoryOf(input))
}

const normalizeSearchTerm = (value: string): string => value.trim().toLocaleLowerCase('en-US')

const resolvedHostName = (
  itemId: ItemType,
  language: 'en' | 'ja',
  resolver: ItemDisplayNameResolver,
): Option.Option<string> => {
  const resolved = resolveItemDisplayName(itemId, language, resolver)
  if (Result.isSuccess(resolved)) {
    return Option.some(resolved.success)
  }
  return Option.none()
}

const categoriesFor = (category: CreativeItemCategoryFilter): ReadonlyArray<CreativeItemCategory> => {
  if (category === 'all') {
    return CREATIVE_ITEM_CATEGORIES
  }
  return [category]
}

const matchesSearch = (
  itemId: ItemType,
  query: string,
  resolver?: ItemDisplayNameResolver,
): boolean => {
  if (query.length === EMPTY_QUERY_LENGTH) {
    return true
  }
  const names = new Set<string>([ITEM_DISPLAY_NAMES[itemId].en, ITEM_DISPLAY_NAMES[itemId].ja])
  if (typeof resolver !== 'undefined') {
    for (const language of ['en', 'ja'] as const) {
      const hostName = resolvedHostName(itemId, language, resolver)
      if (Option.isSome(hostName)) {
        names.add(hostName.value)
      }
    }
  }
  return [...names].some((name) => name.toLocaleLowerCase('en-US').includes(query))
}

export const creativeInventoryViewModel = (
  query: CreativeSearchQuery,
  category: CreativeItemCategoryFilter = 'all',
  resolver?: ItemDisplayNameResolver,
): CreativeInventoryViewModel => {
  const normalizedQuery = normalizeSearchTerm(query)
  const visibleCategories = categoriesFor(category)
  const categories = visibleCategories.map((categoryId) => ({
    category: categoryId,
    items: ITEM_TYPES.filter((itemId) =>
      categoryOf(itemId) === categoryId && matchesSearch(itemId, normalizedQuery, resolver),
    ).map((itemId) => ({
      category: categoryId,
      displayNames: ITEM_DISPLAY_NAMES[itemId],
      itemId,
    })),
  }))
  const items = categories.flatMap((entry) => entry.items)
  return { categories, category, items, query }
}

export const creativeTakeOperationOf = (
  itemId: unknown,
): Result.Result<CreativeTakeItemOperation, CreativeTakeItemFailure> => {
  if (!isItemType(itemId)) {
    return Result.fail({ _tag: 'InvalidItemId' })
  }
  return Result.succeed({ itemId, kind: 'take-item' })
}
