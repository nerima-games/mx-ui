import { Result, Schema } from 'effect'
import {
  BREWING_TIME_SECS,
  BrewingStateSchema,
  itemStack as makeItemStack,
  type BrewingState,
} from '@nerima-games/mc-sim'
import { createAnvilView } from '../../../src/application/anvil-view'
import { createBrewingView } from '../../../src/application/brewing-view'
import { createChestStorageView } from '../../../src/application/chest-storage-view'
import { createEnchantingTableView } from '../../../src/application/enchanting-table-view'
import { createFurnaceView } from '../../../src/application/furnace-view'
import { createTradeView } from '../../../src/application/trade-view'
import { anvilViewModel, type AnvilSnapshot, type AnvilSlotSnapshot } from '../../../src/domain/anvil-view-model'
import { brewingViewModel } from '../../../src/domain/brewing-view-model'
import {
  CHEST_STORAGE_SLOT_COUNT,
  chestStorageViewModel,
  type ChestStorageSnapshot,
  type ChestStorageStackSnapshot,
} from '../../../src/domain/chest-storage-view-model'
import {
  enchantingTableViewModel,
  type EnchantingOfferSnapshot,
  type EnchantingTableSnapshot,
} from '../../../src/domain/enchanting-table-view-model'
import { furnaceViewModel, type FurnaceSnapshot, type FurnaceSlotSnapshot } from '../../../src/domain/furnace-view-model'
import { decodeTradeSnapshot, type TradeSnapshot } from '../../../src/domain/trade-snapshot'
import { tradeViewModel } from '../../../src/domain/trade-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from '../scenario-types'
import { HARNESS_ITEM_DISPLAY_NAME_OPTIONS } from './inventory'

const noTime = (): void => undefined

const definition = (
  screen: string,
  id: string,
  title: string,
  surface: string,
  isDefault: boolean,
  mount: (context: ScenarioContext) => ScenarioMount,
): ScenarioDefinition => ({ screen, id, title, surface, isDefault, mount })

const furnaceSlot = (itemId: string, count: number): FurnaceSlotSnapshot => ({ itemId, count })

const mountFurnace = (
  context: ScenarioContext,
  snapshot: FurnaceSnapshot,
  status: string,
): ScenarioMount => {
  const view = createFurnaceView(context.factory, context.host)
  const model = furnaceViewModel(snapshot, HARNESS_ITEM_DISPLAY_NAME_OPTIONS)
  view.render(model, { focusedSlot: 'input', status })
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const EMPTY_FURNACE: FurnaceSnapshot = {
  input: undefined,
  fuel: undefined,
  output: undefined,
  cookProgress: 0,
  burnProgress: 0,
}

const FURNACE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('furnace', 'empty', 'Empty', 'Furnace', true, (context) =>
    mountFurnace(context, EMPTY_FURNACE, 'Furnace empty'),
  ),
  definition('furnace', 'fuel-only', 'Fuel only', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      { ...EMPTY_FURNACE, fuel: furnaceSlot('minecraft:coal', 1) },
      'Fuel loaded; input empty',
    ),
  ),
  definition('furnace', 'input-ready', 'Input ready', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      { ...EMPTY_FURNACE, input: furnaceSlot('minecraft:raw_iron', 4), fuel: furnaceSlot('minecraft:coal', 2) },
      'Input and fuel loaded',
    ),
  ),
  definition('furnace', 'insufficient-fuel', 'Input loaded, no fuel', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      { ...EMPTY_FURNACE, input: furnaceSlot('minecraft:raw_iron', 1) },
      'Input loaded; fuel slot empty',
    ),
  ),
  definition('furnace', 'in-progress', 'Smelting in progress', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      {
        ...EMPTY_FURNACE,
        input: furnaceSlot('minecraft:raw_iron', 4),
        fuel: furnaceSlot('minecraft:coal', 2),
        cookProgress: 0.6,
        burnProgress: 0.35,
      },
      'Smelting in progress',
    ),
  ),
  definition('furnace', 'output-ready', 'Output ready (completed fixture)', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      {
        ...EMPTY_FURNACE,
        output: furnaceSlot('minecraft:iron_ingot', 4),
        cookProgress: 1,
      },
      'Output ready; completed state shown by output and progress',
    ),
  ),
  definition('furnace', 'progress-clamped', 'Progress below zero and above one', 'Furnace', false, (context) =>
    mountFurnace(context, { ...EMPTY_FURNACE, cookProgress: -0.5, burnProgress: 1.5 }, 'Progress inputs clamp to 0% and 100%'),
  ),
  definition('furnace', 'non-finite-progress', 'Non-finite progress', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      { ...EMPTY_FURNACE, cookProgress: Number.NaN, burnProgress: Number.POSITIVE_INFINITY },
      'Non-finite progress inputs normalize to 0%',
    ),
  ),
  definition('furnace', 'stack-count-boundaries', 'Stack counts 64, 99, and 100', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      {
        ...EMPTY_FURNACE,
        input: furnaceSlot('minecraft:stone', 64),
        fuel: furnaceSlot('minecraft:coal', 99),
        output: furnaceSlot('minecraft:stone', 100),
      },
      'Input count 64, fuel count 99, output count 100',
    ),
  ),
  definition('furnace', 'zero-stack-count', 'Zero count normalizes separately from an empty slot', 'Furnace', false, (context) =>
    mountFurnace(
      context,
      { ...EMPTY_FURNACE, input: furnaceSlot('minecraft:stone', 0) },
      'Input count 0 normalizes to empty; fuel and output are undefined',
    ),
  ),
]

const brewingItemStack = (
  item: Parameters<typeof makeItemStack>[0],
  count: number,
): NonNullable<BrewingState['ingredient']> => {
  const result = makeItemStack(item, count)
  if (Result.isFailure(result)) {
    throw result.failure
  }
  return result.success
}

const brewingState = (input: unknown): BrewingState => Schema.decodeUnknownSync(BrewingStateSchema)(input)

const mountBrewing = (context: ScenarioContext, snapshot: BrewingState): ScenarioMount => {
  const view = createBrewingView(context.factory, context.host, { onIntent: context.emitIntent })
  const model = brewingViewModel(snapshot)
  view.render(model)
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const EMPTY_BREWING = brewingState({
  bottles: [undefined, undefined, undefined],
  ingredient: undefined,
  fuel: undefined,
  fuelCharges: 0,
  brewProgressSecs: 0,
})

const BREWING_WITH_BOTTLES = brewingState({
  bottles: [
    brewingItemStack('water_bottle', 1),
    brewingItemStack('water_bottle', 1),
    brewingItemStack('water_bottle', 1),
  ],
  ingredient: brewingItemStack('nether_wart', 1),
  fuel: brewingItemStack('blaze_powder', 1),
  fuelCharges: 3,
  brewProgressSecs: 0,
})

const BREWING_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('brewing', 'empty', 'Empty and idle', 'Brewing stand', true, (context) =>
    mountBrewing(context, EMPTY_BREWING),
  ),
  definition('brewing', 'ready', 'Ready to brew', 'Brewing stand', false, (context) =>
    mountBrewing(context, BREWING_WITH_BOTTLES),
  ),
  definition('brewing', 'in-progress', 'Brewing in progress', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [
          brewingItemStack('water_bottle', 1),
          brewingItemStack('water_bottle', 1),
          brewingItemStack('water_bottle', 1),
        ],
        ingredient: brewingItemStack('nether_wart', 2),
        fuel: brewingItemStack('blaze_powder', 1),
        fuelCharges: 3,
        brewProgressSecs: BREWING_TIME_SECS / 2,
      }),
    ),
  ),
  definition('brewing', 'completed-output', 'Output ready (completed fixture)', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [brewingItemStack('potion_of_swiftness', 1), undefined, undefined],
        ingredient: undefined,
        fuel: undefined,
        fuelCharges: 0,
        brewProgressSecs: 0,
      }),
    ),
  ),
  definition('brewing', 'no-fuel', 'No fuel charges', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [brewingItemStack('water_bottle', 1), undefined, undefined],
        ingredient: brewingItemStack('nether_wart', 1),
        fuel: undefined,
        fuelCharges: 0,
        brewProgressSecs: 0,
      }),
    ),
  ),
  definition('brewing', 'one-bottle', 'One bottle loaded', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [brewingItemStack('water_bottle', 1), undefined, undefined],
        ingredient: undefined,
        fuel: undefined,
        fuelCharges: 0,
        brewProgressSecs: 0,
      }),
    ),
  ),
  definition('brewing', 'three-bottles', 'Three bottles loaded', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [
          brewingItemStack('water_bottle', 1),
          brewingItemStack('water_bottle', 1),
          brewingItemStack('water_bottle', 1),
        ],
        ingredient: undefined,
        fuel: undefined,
        fuelCharges: 0,
        brewProgressSecs: 0,
      }),
    ),
  ),
  definition('brewing', 'max-fuel-and-stack', 'Maximum fuel charges and ingredient stack', 'Brewing stand', false, (context) =>
    mountBrewing(
      context,
      brewingState({
        bottles: [undefined, undefined, undefined],
        ingredient: brewingItemStack('nether_wart', 64),
        fuel: brewingItemStack('blaze_powder', 64),
        fuelCharges: 20,
        brewProgressSecs: 0,
      }),
    ),
  ),
]

const anvilSlot = (itemId: string, count: number, durability?: number): AnvilSlotSnapshot => ({
  itemId,
  count,
  ...(durability === undefined ? {} : { durability }),
})

const mountAnvil = (context: ScenarioContext, snapshot: AnvilSnapshot, status: string): ScenarioMount => {
  const view = createAnvilView(context.factory, context.host)
  const model = anvilViewModel(snapshot, HARNESS_ITEM_DISPLAY_NAME_OPTIONS)
  view.render(model, { focusedTarget: 'primary-input', status })
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const EMPTY_ANVIL: AnvilSnapshot = {
  primaryInput: undefined,
  secondaryInput: undefined,
  output: undefined,
  name: '',
  levelCost: 0,
  rejectionReason: undefined,
}

const ANVIL_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('anvil', 'empty', 'Empty', 'Anvil', true, (context) => mountAnvil(context, EMPTY_ANVIL, 'Anvil empty')),
  definition('anvil', 'repairable', 'Repairable item', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      {
        ...EMPTY_ANVIL,
        primaryInput: anvilSlot('minecraft:diamond_sword', 1, 0.5),
        secondaryInput: anvilSlot('minecraft:diamond', 2),
        output: anvilSlot('minecraft:diamond_sword', 1, 0.85),
        levelCost: 7,
      },
      'Repair result available',
    ),
  ),
  definition('anvil', 'rename', 'Rename item', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      { ...EMPTY_ANVIL, primaryInput: anvilSlot('minecraft:iron_pickaxe', 1, 0.75), name: 'Cave Finder', levelCost: 2 },
      'Rename input ready',
    ),
  ),
  definition('anvil', 'one-character-rename', 'One-character rename', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      { ...EMPTY_ANVIL, primaryInput: anvilSlot('minecraft:iron_pickaxe', 1), name: 'A', levelCost: 1 },
      'One-character rename input',
    ),
  ),
  definition(
    'anvil',
    'name-text-boundaries',
    'Long multiline name with emoji, RTL, mixed-width, and control text',
    'Anvil',
    false,
    (context) =>
      mountAnvil(
        context,
        {
          ...EMPTY_ANVIL,
          primaryInput: anvilSlot('minecraft:iron_pickaxe', 1),
          name: `${'LongName'.repeat(12)}\n😀 مرحبا עברית Ａbc１２3\u0001`,
          levelCost: 1,
        },
        'Boundary rename value is assigned to the name input',
      ),
  ),
  definition('anvil', 'output-ready', 'Output ready (completed fixture)', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      {
        ...EMPTY_ANVIL,
        primaryInput: anvilSlot('minecraft:iron_sword', 1, 0.5),
        output: anvilSlot('minecraft:iron_sword', 1, 0.8),
        name: 'Iron Sword',
        levelCost: 3,
      },
      'Output slot contains the completed result',
    ),
  ),
  definition('anvil', 'rejected-too-expensive', 'Rejected: too expensive message', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      {
        ...EMPTY_ANVIL,
        primaryInput: anvilSlot('minecraft:diamond_sword', 1, 0.4),
        secondaryInput: anvilSlot('minecraft:diamond', 1),
        levelCost: 40,
        rejectionReason: 'Too expensive',
      },
      'Too expensive rejection message shown',
    ),
  ),
  definition('anvil', 'negative-cost-normalized', 'Negative fractional cost normalizes to zero', 'Anvil', false, (context) =>
    mountAnvil(context, { ...EMPTY_ANVIL, levelCost: -3.7 }, 'Negative fractional cost input normalizes to zero'),
  ),
  definition('anvil', 'large-stack-count', 'Large stack count', 'Anvil', false, (context) =>
    mountAnvil(
      context,
      { ...EMPTY_ANVIL, primaryInput: anvilSlot('minecraft:iron_ingot', 100) },
      'Primary input count 100',
    ),
  ),
]

const enchantingOffer = (
  enchantmentId: string,
  enchantmentLevel: number,
  levelCost: number,
  lapisCost: number,
  rejectionReason?: string,
): EnchantingOfferSnapshot => ({
  enchantmentId,
  enchantmentLevel,
  levelCost,
  lapisCost,
  rejectionReason,
})

const mountEnchanting = (context: ScenarioContext, snapshot: EnchantingTableSnapshot, status: string): ScenarioMount => {
  const view = createEnchantingTableView(context.factory, context.host, { onActivate: context.emitIntent })
  const model = enchantingTableViewModel(snapshot, HARNESS_ITEM_DISPLAY_NAME_OPTIONS)
  view.render(model, { focusedTarget: 'offer-1', status })
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const EMPTY_ENCHANTING: EnchantingTableSnapshot = {
  item: undefined,
  lapis: undefined,
  offers: [undefined, undefined, undefined],
}

const ENCHANTING_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('enchanting-table', 'empty', 'Empty', 'Enchanting table', true, (context) =>
    mountEnchanting(context, EMPTY_ENCHANTING, 'Enchanting table empty'),
  ),
  definition('enchanting-table', 'three-offers', 'Three available offers', 'Enchanting table', false, (context) =>
    mountEnchanting(
      context,
      {
        item: { itemId: 'minecraft:diamond_sword', count: 1, durability: 0.75 },
        lapis: { itemId: 'minecraft:lapis_lazuli', count: 12 },
        offers: [
          enchantingOffer('minecraft:sharpness', 3, 12, 1),
          enchantingOffer('minecraft:unbreaking', 2, 18, 2),
          enchantingOffer('minecraft:efficiency', 4, 30, 3),
        ],
      },
      'Three offers available',
    ),
  ),
  definition('enchanting-table', 'lapis-rejection-message', 'Rejected offer: insufficient lapis message', 'Enchanting table', false, (context) =>
    mountEnchanting(
      context,
      {
        item: { itemId: 'minecraft:diamond_sword', count: 1 },
        lapis: { itemId: 'minecraft:lapis_lazuli', count: 1 },
        offers: [
          enchantingOffer('minecraft:sharpness', 3, 12, 3, 'Insufficient lapis'),
          undefined,
          undefined,
        ],
      },
      'Free-form insufficient lapis rejection message shown',
    ),
  ),
  definition('enchanting-table', 'experience-rejection-message', 'Rejected offer: insufficient experience message', 'Enchanting table', false, (context) =>
    mountEnchanting(
      context,
      {
        item: { itemId: 'minecraft:diamond_sword', count: 1 },
        lapis: { itemId: 'minecraft:lapis_lazuli', count: 12 },
        offers: [
          enchantingOffer('minecraft:sharpness', 3, 18, 3, 'Insufficient experience'),
          undefined,
          undefined,
        ],
      },
      'Free-form insufficient experience rejection message shown',
    ),
  ),
  definition('enchanting-table', 'cost-normalization', 'Negative and non-finite costs normalize to zero', 'Enchanting table', false, (context) =>
    mountEnchanting(
      context,
      {
        item: { itemId: 'minecraft:book', count: 1 },
        lapis: { itemId: 'minecraft:lapis_lazuli', count: 0 },
        offers: [
          enchantingOffer('minecraft:sharpness', Number.NaN, -2.7, Number.POSITIVE_INFINITY),
          undefined,
          undefined,
        ],
      },
      'Negative and non-finite offer costs normalize to zero',
    ),
  ),
  definition('enchanting-table', 'stack-count-boundaries', 'Slot stack counts 64 and 100', 'Enchanting table', false, (context) =>
    mountEnchanting(
      context,
      {
        item: { itemId: 'minecraft:book', count: 64 },
        lapis: { itemId: 'minecraft:lapis_lazuli', count: 100 },
        offers: [
          enchantingOffer('minecraft:sharpness', 1, 1, 1),
          undefined,
          undefined,
        ],
      },
      'Item count 64 and lapis count 100',
    ),
  ),
]

const chestStack = (
  item: string,
  count: number,
  durability?: number,
): ChestStorageStackSnapshot => ({
  item,
  count,
  durability,
})

const chestSnapshot = (
  chest: ChestStorageSnapshot['chest'] = [],
  playerInventory: ChestStorageSnapshot['playerInventory'] = [],
  cursor: ChestStorageStackSnapshot | undefined = undefined,
  selectedSlot: ChestStorageSnapshot['selectedSlot'] = undefined,
): ChestStorageSnapshot => ({
  chest,
  chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
  playerInventory,
  cursor,
  selectedSlot,
})

const mountChest = (
  context: ScenarioContext,
  snapshot: ChestStorageSnapshot,
  status: string,
  focusedSlot: { readonly region: 'chest' | 'player'; readonly slot: number } = { region: 'chest', slot: 0 },
): ScenarioMount => {
  const view = createChestStorageView(context.factory, context.host)
  const model = chestStorageViewModel(snapshot, HARNESS_ITEM_DISPLAY_NAME_OPTIONS)
  view.render(model, { focusedSlot, status })
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const CHEST_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('chest-storage', 'empty', 'Empty chest and player inventory', 'Chest storage', true, (context) =>
    mountChest(context, chestSnapshot(), 'Chest and player inventory empty'),
  ),
  definition('chest-storage', 'populated-regions', 'Chest and player regions populated', 'Chest storage', false, (context) =>
    mountChest(
      context,
      chestSnapshot(
        [chestStack('minecraft:stone', 64), chestStack('minecraft:torch', 16)],
        [chestStack('minecraft:bread', 3), chestStack('minecraft:iron_pickaxe', 1, 0.65)],
        undefined,
        { region: 'player', slot: 0 },
      ),
      'Chest and player regions contain items',
      { region: 'player', slot: 0 },
    ),
  ),
  definition('chest-storage', 'full', 'Full chest', 'Chest storage', false, (context) =>
    mountChest(
      context,
      chestSnapshot(Array.from({ length: CHEST_STORAGE_SLOT_COUNT }, () => chestStack('minecraft:stone', 64))),
      'All chest slots filled',
    ),
  ),
  definition('chest-storage', 'cursor-holds-item', 'Cursor holds an item', 'Chest storage', false, (context) =>
    mountChest(
      context,
      chestSnapshot(
        [chestStack('minecraft:oak_planks', 12)],
        [chestStack('minecraft:stick', 4)],
        chestStack('minecraft:diamond', 3),
      ),
      'Cursor carries three diamonds',
    ),
  ),
  definition('chest-storage', 'stack-count-boundaries', 'Stack counts zero, one, 64, 99, and 100', 'Chest storage', false, (context) =>
    mountChest(
      context,
      chestSnapshot([
        chestStack('minecraft:stone', 0),
        chestStack('minecraft:stone', 1),
        chestStack('minecraft:stone', 64),
        chestStack('minecraft:stone', 99),
        chestStack('minecraft:stone', 100),
      ]),
      'Zero count projects empty; positive counts remain visible',
    ),
  ),
  definition('chest-storage', 'slot-capacity-boundary', 'Five-slot container', 'Chest storage', false, (context) => {
    const snapshot = chestSnapshot([chestStack('minecraft:chest', 1)])
    return mountChest(context, { ...snapshot, chestSlotCount: 5 }, 'Five-slot container capacity')
  }),
]

const tradeOffer = (
  id: string,
  available: boolean,
  inputItem: string,
  inputCount: number,
  outputItem: string,
  outputCount: number,
  uses: number,
  maxUses: number,
) => ({
  available,
  id,
  input: { count: inputCount, item: inputItem },
  output: { count: outputCount, item: outputItem },
  uses,
  maxUses,
})

const tradeSnapshot = (
  profession: 'farmer' | 'toolsmith',
  offers: ReadonlyArray<ReturnType<typeof tradeOffer>>,
  status: string,
): TradeSnapshot => {
  const result = decodeTradeSnapshot({ actor: 'player-1', villager: 'villager-1', profession, offers, status })
  if (Result.isFailure(result)) {
    throw result.failure
  }
  return result.success
}

const mountTrade = (context: ScenarioContext, snapshot: TradeSnapshot): ScenarioMount => {
  const view = createTradeView(context.factory, context.host, { onIntent: context.emitIntent })
  const model = tradeViewModel(snapshot)
  view.render(snapshot)
  const { root } = view
  return { root, setTime: noTime, dispose: () => { root.textContent = '' }, viewModel: () => model }
}

const TRADE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  definition('trade', 'no-offers', 'No offers', 'Trade', true, (context) =>
    mountTrade(context, tradeSnapshot('farmer', [], 'No offers available')),
  ),
  definition('trade', 'available', 'Available offer', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'farmer',
        [tradeOffer('farmer-wheat', true, 'minecraft:wheat', 20, 'minecraft:emerald', 1, 2, 16)],
        'Choose a trade',
      ),
    ),
  ),
  definition('trade', 'unavailable', 'Unavailable offer', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'farmer',
        [tradeOffer('farmer-potato', false, 'minecraft:potato', 26, 'minecraft:emerald', 1, 3, 16)],
        'Offer unavailable',
      ),
    ),
  ),
  definition('trade', 'different-profession', 'Toolsmith profession', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'toolsmith',
        [tradeOffer('toolsmith-iron', true, 'minecraft:iron_ingot', 4, 'minecraft:emerald', 1, 0, 12)],
        'Toolsmith offer available',
      ),
    ),
  ),
  definition('trade', 'out-of-stock', 'Out of stock', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'farmer',
        [tradeOffer('farmer-carrot', false, 'minecraft:carrot', 22, 'minecraft:emerald', 1, 12, 12)],
        'Out of stock (uses equal max uses)',
      ),
    ),
  ),
  definition('trade', 'multiple-offers', 'Multiple offers', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'toolsmith',
        [
          tradeOffer('toolsmith-iron', true, 'minecraft:iron_ingot', 4, 'minecraft:emerald', 1, 0, 12),
          tradeOffer('toolsmith-bell', true, 'minecraft:emerald', 36, 'minecraft:bell', 1, 1, 12),
          tradeOffer('toolsmith-pickaxe', false, 'minecraft:emerald', 20, 'minecraft:iron_pickaxe', 1, 12, 12),
        ],
        'Three offers; one unavailable',
      ),
    ),
  ),
  definition('trade', 'quantity-boundaries', 'Offer quantities zero, one, 64, 99, and 100', 'Trade', false, (context) =>
    mountTrade(
      context,
      tradeSnapshot(
        'farmer',
        [
          tradeOffer('farmer-zero', true, 'minecraft:wheat', 0, 'minecraft:emerald', 1, 0, 1),
          tradeOffer('farmer-one', true, 'minecraft:wheat', 1, 'minecraft:emerald', 1, 1, 1),
          tradeOffer('farmer-64', true, 'minecraft:wheat', 64, 'minecraft:emerald', 64, 64, 64),
          tradeOffer('farmer-99', true, 'minecraft:wheat', 99, 'minecraft:emerald', 1, 99, 99),
          tradeOffer('farmer-100', true, 'minecraft:wheat', 100, 'minecraft:emerald', 1, 100, 100),
        ],
        'Offer quantity and use-count boundaries',
      ),
    ),
  ),
  definition(
    'trade',
    'status-text-boundaries',
    'Long multiline status with emoji, RTL, mixed-width, and control text',
    'Trade',
    false,
    (context) =>
      mountTrade(
        context,
        tradeSnapshot(
          'farmer',
          [tradeOffer('farmer-boundary', true, 'minecraft:wheat', 1, 'minecraft:emerald', 1, 0, 1)],
          `${'Long trade status '.repeat(12)}\n😀 مرحبا עברית Ａbc１２3\u0001`,
        ),
      ),
  ),
]

export const STATION_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  ...FURNACE_SCENARIOS,
  ...BREWING_SCENARIOS,
  ...ANVIL_SCENARIOS,
  ...ENCHANTING_SCENARIOS,
  ...CHEST_SCENARIOS,
  ...TRADE_SCENARIOS,
]
