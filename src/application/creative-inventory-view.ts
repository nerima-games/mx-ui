import {
  CREATIVE_ITEM_CATEGORIES,
  type CreativeInventoryItem,
  type CreativeInventoryViewModel,
  type CreativeItemCategoryFilter,
  type CreativeSearchQuery,
  CreativeSearchQuerySchema,
  type CreativeTakeItemOperation,
  creativeInventoryViewModel,
  creativeSearchQueryOf,
  creativeTakeOperationOf,
} from '../domain/creative-inventory-view-model.js'
import type { DomElement, DomElementFactory, DomInputElement, DomInteractiveElement } from './dom-surface.js'
import {
  type ItemDisplayNameOptions,
  type ItemDisplayNameResolver,
  resolveItemDisplayName,
} from '../domain/item-display-name.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type SlotElement,
  createSlotElement,
  setSlotButtonView,
  setSlotFocusTarget,
  setSlotHidden,
  setSlotKeyboardFocus,
  updateSlotElement,
} from './slot-element.js'
import { type UiLanguage, type UiMessageKey } from '../domain/ui-language.js'
import {
  attributeCell,
  styleCell,
  textCell,
  writeAttribute,
  writeHidden,
  writeStyle,
  writeText,
} from './dom-write.js'
import {
  inheritUiLanguage,
  setLocalizedAttribute,
  uiLanguageForElement,
  writeLocalizedText,
} from './ui-localization.js'
import type { ItemIconResolver } from '../domain/item-icon.js'
import { Result } from 'effect'
import { applyUiScale } from './ui-scale.js'
import { itemDisplayNameText } from './item-display-name.js'
import { slotView } from '../domain/hud-view-model.js'

export type CreativeInventoryViewActions = Readonly<{
  readonly onSearchChange?: (query: CreativeSearchQuery) => void
  readonly onCategoryChange?: (category: CreativeItemCategoryFilter) => void
  readonly onTake?: (operation: CreativeTakeItemOperation) => void
}>

export type CreativeInventoryViewOptions = Readonly<{
  readonly displayNameResolver?: ItemDisplayNameResolver
  readonly iconResolver?: ItemIconResolver
}>

export type CreativeInventoryView = Readonly<{
  readonly root: DomElement
  readonly render: (model: CreativeInventoryViewModel) => void
  readonly setUiScale: (input: unknown) => ReturnType<typeof applyUiScale>
}>

type CategoryButton = Readonly<{
  readonly category: CreativeItemCategoryFilter
  readonly root: DomInteractiveElement
  readonly pressed: ReturnType<typeof attributeCell>
  readonly borderColor: ReturnType<typeof styleCell>
  readonly borderWidth: ReturnType<typeof styleCell>
}>

type ItemButton = Readonly<{
  readonly index: number
  readonly item: CreativeInventoryItem
  readonly slot: SlotElement
}>

const ALL_CATEGORY = 'all' as const
const ITEM_GRID_COLUMNS = 9
const EMPTY_ITEM_COUNT = 0
const FIRST_ARRAY_INDEX = 0
const ICONLESS_LABEL_MAX_CODE_POINTS = 6
const ICONLESS_LABEL_PREFIX_CODE_POINTS = 5
const ICONLESS_LABEL_ELLIPSIS = '…'
const CATEGORY_BORDER_WIDTH = '1px'
const CATEGORY_SELECTED_BORDER_WIDTH = '3px'

const CATEGORY_MESSAGE_KEY: Readonly<Record<CreativeItemCategoryFilter, UiMessageKey>> = {
  all: 'creative.category.all',
  building: 'creative.category.building',
  combat: 'creative.category.combat',
  equipment: 'creative.category.equipment',
  food: 'creative.category.food',
  materials: 'creative.category.materials',
  miscellaneous: 'creative.category.miscellaneous',
  nature: 'creative.category.nature',
  redstone: 'creative.category.redstone',
  transportation: 'creative.category.transportation',
}

const createCreativeRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'creative-inventory')
  inheritUiLanguage(parent, root)
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  setLocalizedAttribute(root, 'aria-label', 'creative.title')
  parent.appendChild(root)
  return root
}

const addTitle = (factory: DomElementFactory, root: DomElement): void => {
  const title = factory.createElement('h2')
  title.setAttribute('data-mx-ui', 'creative-title')
  inheritUiLanguage(root, title)
  root.appendChild(title)
  writeLocalizedText(textCell(title), 'creative.title')
}

const setSearchIdentity = (search: DomInputElement): void => {
  search.setAttribute('type', 'search')
  search.setAttribute('data-mx-ui', 'creative-search')
  search.setAttribute('data-focus-group', 'creative-search')
  search.setAttribute('data-focus-index', '0')
  search.setAttribute('data-focus-columns', '1')
}

const setSearchAppearance = (search: DomInputElement): void => {
  search.style.setProperty('min-height', '24px')
  search.style.setProperty('color', PALETTE_VAR.ink)
  search.style.setProperty('background-color', PALETTE_VAR.surfaceRaised)
}

const setSearchLanguage = (root: DomElement, search: DomInputElement): void => {
  inheritUiLanguage(root, search)
  setLocalizedAttribute(search, 'aria-label', 'creative.search')
  setLocalizedAttribute(search, 'placeholder', 'creative.search')
}

const configureSearch = (root: DomElement, search: DomInputElement): void => {
  setSearchIdentity(search)
  setSearchAppearance(search)
  setSearchLanguage(root, search)
}

const addSearch = (factory: DomElementFactory, root: DomElement): DomInputElement => {
  const search = factory.createElement('input')
  configureSearch(root, search)
  root.appendChild(search)
  return search
}

type CategoryButtonOptions = Readonly<{
  readonly factory: DomElementFactory
  readonly bar: DomElement
  readonly category: CreativeItemCategoryFilter
  readonly index: number
  readonly columnCount: number
}>

const setCategoryButtonIdentity = (
  input: Readonly<{
    readonly button: DomInteractiveElement
    readonly category: CreativeItemCategoryFilter
    readonly index: number
    readonly columnCount: number
  }>,
): void => {
  const { button, category, index, columnCount } = input
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'creative-category')
  button.setAttribute('data-category', category)
  button.setAttribute('data-focus-group', 'creative-categories')
  button.setAttribute('data-focus-index', String(index))
  button.setAttribute('data-focus-columns', String(columnCount))
}

const setCategoryButtonAppearance = (button: DomInteractiveElement): void => {
  button.style.setProperty('min-height', '24px')
  button.style.setProperty('color', PALETTE_VAR.ink)
  button.style.setProperty('background-color', PALETTE_VAR.slotFill)
  button.style.setProperty('border-style', 'solid')
  button.style.setProperty('border-width', CATEGORY_BORDER_WIDTH)
  button.style.setProperty('border-color', PALETTE_VAR.slotBorder)
}

const configureCategoryButton = (input: Readonly<Omit<CategoryButtonOptions, 'factory'> & { readonly button: DomInteractiveElement }>): void => {
  const { bar, button, category, index, columnCount } = input
  setCategoryButtonIdentity({ button, category, columnCount, index })
  setCategoryButtonAppearance(button)
  inheritUiLanguage(bar, button)
  writeLocalizedText(textCell(button), CATEGORY_MESSAGE_KEY[category])
}

const createCategoryButton = ({ factory, bar, category, index, columnCount }: CategoryButtonOptions): CategoryButton => {
  const button: DomInteractiveElement = factory.createElement('button')
  configureCategoryButton({ bar, button, category, columnCount, index })
  const pressed = attributeCell(button, 'aria-pressed')
  const borderColor = styleCell(button, 'border-color')
  const borderWidth = styleCell(button, 'border-width')
  borderColor.previous = PALETTE_VAR.slotBorder
  borderWidth.previous = CATEGORY_BORDER_WIDTH
  bar.appendChild(button)
  return { borderColor, borderWidth, category, pressed, root: button }
}

const createCategoryBarElement = (factory: DomElementFactory, root: DomElement): DomElement => {
  const bar = factory.createElement('nav')
  bar.setAttribute('data-mx-ui', 'creative-categories')
  setLocalizedAttribute(bar, 'aria-label', 'creative.title')
  bar.style.setProperty('display', 'flex')
  bar.style.setProperty('flex-wrap', 'wrap')
  bar.style.setProperty('gap', '4px')
  inheritUiLanguage(root, bar)
  root.appendChild(bar)
  return bar
}

const createCategoryBar = (
  factory: DomElementFactory,
  root: DomElement,
): Readonly<{ element: DomElement; buttons: ReadonlyArray<CategoryButton> }> => {
  const bar = createCategoryBarElement(factory, root)
  const categoryIds: ReadonlyArray<CreativeItemCategoryFilter> = [ALL_CATEGORY, ...CREATIVE_ITEM_CATEGORIES]
  const buttons = categoryIds.map((category, index) =>
    createCategoryButton({ bar, category, columnCount: categoryIds.length, factory, index }),
  )
  return { buttons, element: bar }
}

const addNoResults = (factory: DomElementFactory, root: DomElement): Readonly<{
  element: DomElement
  hidden: ReturnType<typeof attributeCell>
  text: ReturnType<typeof textCell>
}> => {
  const message = factory.createElement('p')
  message.setAttribute('data-mx-ui', 'creative-no-results')
  message.setAttribute('hidden', '')
  inheritUiLanguage(root, message)
  root.appendChild(message)
  const hidden = attributeCell(message, 'hidden')
  hidden.previous = ''
  return { element: message, hidden, text: textCell(message) }
}

const createItemGrid = (factory: DomElementFactory, root: DomElement): DomElement => {
  const grid = factory.createElement('div')
  grid.setAttribute('data-mx-ui', 'creative-items')
  grid.style.setProperty('display', 'grid')
  grid.style.setProperty('grid-template-columns', `repeat(${String(ITEM_GRID_COLUMNS)}, minmax(0, 1fr))`)
  grid.style.setProperty('gap', '4px')
  inheritUiLanguage(root, grid)
  root.appendChild(grid)
  return grid
}

const displayNameOptionsFor = (
  language: UiLanguage,
  options: CreativeInventoryViewOptions | undefined,
): ItemDisplayNameOptions => {
  const displayNameOptions: { language: UiLanguage; resolver?: ItemDisplayNameResolver; iconResolver?: ItemIconResolver } = {
    language,
  }
  if (typeof options?.displayNameResolver !== 'undefined') {
    displayNameOptions.resolver = options.displayNameResolver
  }
  if (typeof options?.iconResolver !== 'undefined') {
    displayNameOptions.iconResolver = options.iconResolver
  }
  return displayNameOptions
}

const searchResolverFor = (resolver: ItemDisplayNameResolver | undefined): ItemDisplayNameResolver | undefined => {
  if (typeof resolver === 'undefined') {
    return
  }
  return (itemId, language) => {
    const resolved = resolveItemDisplayName(itemId, language, resolver)
    if (Result.isSuccess(resolved)) {
      return Result.succeed(resolved.success)
    }
    return Result.fail({ _tag: 'ItemDisplayNameUnavailable' })
  }
}

type CreateItemButtonsOptions = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly grid: DomElement
  readonly actions: CreativeInventoryViewActions | undefined
  readonly options: CreativeInventoryViewOptions | undefined
}>

type CreateItemButtonOptions = CreateItemButtonsOptions & Readonly<{
  readonly item: CreativeInventoryItem
  readonly index: number
}>

const connectItemActions = (
  slot: SlotElement,
  item: CreativeInventoryItem,
  actions: CreativeInventoryViewActions | undefined,
): void => {
  slot.root.addEventListener('click', () => {
    const operation = creativeTakeOperationOf(item.itemId)
    if (Result.isSuccess(operation)) {
      actions?.onTake?.(operation.success)
    }
  })
  slot.root.addEventListener('focus', () => setSlotKeyboardFocus(slot, true))
  slot.root.addEventListener('blur', () => setSlotKeyboardFocus(slot, false))
}

const createItemButton = ({ factory, root, grid, actions, item, index }: CreateItemButtonOptions): ItemButton => {
  const slot = createSlotElement(factory, index)
  slot.root.setAttribute('data-mx-ui', 'creative-item')
  slot.root.setAttribute('data-item-id', item.itemId)
  slot.root.setAttribute('data-category', item.category)
  inheritUiLanguage(root, slot.root)
  setSlotFocusTarget(slot, { columns: ITEM_GRID_COLUMNS, group: 'creative-items', index })
  connectItemActions(slot, item, actions)
  grid.appendChild(slot.root)
  return { index, item, slot }
}

const createItemButtons = ({ factory, root, grid, actions, options }: CreateItemButtonsOptions): ReadonlyArray<ItemButton> => {
  const emptyQuery = CreativeSearchQuerySchema.make('')
  const allItems = creativeInventoryViewModel(emptyQuery, ALL_CATEGORY, options?.displayNameResolver).items
  return allItems.map((item, index) => createItemButton({ actions, factory, grid, index, item, options, root }))
}

const renderCategoryButtons = (
  buttons: ReadonlyArray<CategoryButton>,
  selected: CreativeItemCategoryFilter,
): void => {
  for (const { category, pressed, borderColor, borderWidth } of buttons) {
    const isSelected = category === selected
    writeAttribute(pressed, String(isSelected))
    if (isSelected) {
      writeStyle(borderColor, PALETTE_VAR.slotSelected)
      writeStyle(borderWidth, CATEGORY_SELECTED_BORDER_WIDTH)
    } else {
      writeStyle(borderColor, PALETTE_VAR.slotBorder)
      writeStyle(borderWidth, CATEGORY_BORDER_WIDTH)
    }
  }
}

const renderHiddenItem = (slot: SlotElement): void => {
  setSlotButtonView(slot, { disabled: true, focused: false, label: '', tabStop: false })
}

type RenderVisibleItemOptions = Readonly<{
  readonly slot: SlotElement
  readonly shown: CreativeInventoryItem
  readonly index: number
  readonly itemDisplayNameOptions: ItemDisplayNameOptions
  readonly language: UiLanguage
}>

const renderVisibleItem = ({ slot, shown, index, itemDisplayNameOptions, language }: RenderVisibleItemOptions): void => {
  const view = slotView(
    { count: 1, itemId: shown.itemId },
    index,
    { itemDisplayNameOptions, selectedIndex: -1 },
  )
  updateSlotElement(slot, view)
  const itemName = itemDisplayNameText(view, language)
  if (typeof view.itemIcon === 'undefined' || Result.isFailure(view.itemIcon.result)) {
    const itemNameCodePoints = Array.from(itemName)
    if (itemNameCodePoints.length > ICONLESS_LABEL_MAX_CODE_POINTS) {
      const compactName = itemNameCodePoints.slice(FIRST_ARRAY_INDEX, ICONLESS_LABEL_PREFIX_CODE_POINTS).join('')
      writeText(slot.itemText, `${compactName}${ICONLESS_LABEL_ELLIPSIS}`)
    }
  }
  setSlotButtonView(slot, {
    disabled: false,
    focused: slot.tooltipFocused,
    label: '',
    localizedLabel: { key: 'creative.take', values: { item: itemName } },
    tabStop: true,
  })
}

type RenderItemsOptions = Readonly<{
  readonly buttons: ReadonlyArray<ItemButton>
  readonly model: CreativeInventoryViewModel
  readonly root: DomElement
  readonly options: CreativeInventoryViewOptions | undefined
}>

const renderItems = ({ buttons, model, root, options }: RenderItemsOptions): number => {
  const visible = new Map(model.items.map((item) => [item.itemId, item]))
  const language = uiLanguageForElement(root)
  const itemDisplayNameOptions = displayNameOptionsFor(language, options)
  for (const { index, item, slot } of buttons) {
    const shown = visible.get(item.itemId)
    setSlotHidden(slot, typeof shown === 'undefined')
    if (typeof shown === 'undefined') {
      renderHiddenItem(slot)
    } else {
      renderVisibleItem({ index, itemDisplayNameOptions, language, shown, slot })
    }
  }
  return visible.size
}

type CreativeViewParts = Readonly<{
  readonly categoryButtons: ReadonlyArray<CategoryButton>
  readonly grid: DomElement
  readonly noResults: ReturnType<typeof addNoResults>
  readonly root: DomElement
  readonly search: DomInputElement
}>

const createCreativeViewParts = (factory: DomElementFactory, parent: DomElement): CreativeViewParts => {
  const root = createCreativeRoot(factory, parent)
  addTitle(factory, root)
  const search = addSearch(factory, root)
  const categoryBar = createCategoryBar(factory, root)
  const noResults = addNoResults(factory, root)
  const grid = createItemGrid(factory, root)
  return { categoryButtons: categoryBar.buttons, grid, noResults, root, search }
}

type CreativeRenderState = {
  readonly parts: CreativeViewParts
  readonly itemButtons: ReadonlyArray<ItemButton>
  readonly options: CreativeInventoryViewOptions | undefined
  currentModel: CreativeInventoryViewModel
}

const renderCreativeModel = (state: CreativeRenderState, model: CreativeInventoryViewModel): void => {
  state.currentModel = model
  state.parts.search.value = model.query
  renderCategoryButtons(state.parts.categoryButtons, model.category)
  const count = renderItems({ buttons: state.itemButtons, model, options: state.options, root: state.parts.root })
  writeHidden(state.parts.noResults.hidden, count !== EMPTY_ITEM_COUNT)
  if (count === EMPTY_ITEM_COUNT) {
    writeLocalizedText(state.parts.noResults.text, 'creative.no-results')
  }
}

const connectSearch = (
  state: CreativeRenderState,
  searchResolver: ItemDisplayNameResolver | undefined,
  actions: CreativeInventoryViewActions | undefined,
): void => {
  state.parts.search.addEventListener('input', () => {
    const parsedQuery = creativeSearchQueryOf(state.parts.search.value)
    if (Result.isFailure(parsedQuery)) {
      return
    }
    const query = parsedQuery.success
    const next = creativeInventoryViewModel(query, state.currentModel.category, searchResolver)
    renderCreativeModel(state, next)
    actions?.onSearchChange?.(query)
  })
}

const connectCategoryButtons = (
  state: CreativeRenderState,
  searchResolver: ItemDisplayNameResolver | undefined,
  actions: CreativeInventoryViewActions | undefined,
): void => {
  for (const { category, root: button } of state.parts.categoryButtons) {
    button.addEventListener('click', () => {
      const parsedQuery = creativeSearchQueryOf(state.parts.search.value)
      if (Result.isFailure(parsedQuery)) {
        return
      }
      const next = creativeInventoryViewModel(parsedQuery.success, category, searchResolver)
      renderCreativeModel(state, next)
      actions?.onCategoryChange?.(category)
    })
  }
}

export const createCreativeInventoryView = (
  factory: DomElementFactory,
  parent: DomElement,
  ...viewOptions: readonly [actions?: CreativeInventoryViewActions, options?: CreativeInventoryViewOptions]
): CreativeInventoryView => {
  const [actions, options] = viewOptions
  const parts = createCreativeViewParts(factory, parent)
  const searchResolver = searchResolverFor(options?.displayNameResolver)
  const itemButtons = createItemButtons({
    actions,
    factory,
    grid: parts.grid,
    options,
    root: parts.root,
  })
  const state: CreativeRenderState = {
    currentModel: creativeInventoryViewModel(CreativeSearchQuerySchema.make(''), ALL_CATEGORY, searchResolver),
    itemButtons,
    options,
    parts,
  }
  const render = (model: CreativeInventoryViewModel): void => renderCreativeModel(state, model)
  connectSearch(state, searchResolver, actions)
  connectCategoryButtons(state, searchResolver, actions)
  render(state.currentModel)

  return {
    render,
    root: parts.root,
    setUiScale: (input) => applyUiScale(parts.root.style, input),
  }
}
