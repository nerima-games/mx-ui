import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import type { ItemDisplayNameOptions, ItemDisplayNameResolver } from '../domain/item-display-name.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type Recipe,
  type RecipeId,
} from '@nerima-games/mc-kernel'
import {
  type RecipeBookEntry,
  type RecipeBookViewModel,
  type RecipeGridWidth,
  type RecipePlacementOperation,
  recipePlacementOperationOf,
} from '../domain/recipe-book-view-model.js'
import { attributeCell, textCell, writeHidden, writeText } from './dom-write.js'
import { inheritUiLanguage, setLocalizedAttribute, uiLanguageForElement, writeLocalizedText } from './ui-localization.js'
import { Result } from 'effect'
import { applyUiScale } from './ui-scale.js'
import { itemDisplayNameText } from './item-display-name.js'
import { slotView } from '../domain/hud-view-model.js'

export type RecipeBookViewActions = Readonly<{
  readonly onPlaceRecipe?: (operation: RecipePlacementOperation) => void
}>

export type RecipeBookViewOptions = Readonly<{
  readonly displayNameResolver?: ItemDisplayNameResolver
}>

export type RecipeBookView = Readonly<{
  readonly root: DomElement
  readonly render: (model: RecipeBookViewModel) => void
  readonly setUiScale: (input: unknown) => ReturnType<typeof applyUiScale>
}>

type RecipeSection = 'craftable' | 'uncraftable'

type RecipeFocusTarget = Readonly<{ recipeId: RecipeId; gridWidth: RecipeGridWidth }>

type RecipeFocusState = { current: RecipeFocusTarget | null }

type RecipeCard = Readonly<{
  readonly root: DomElement
  readonly hidden: ReturnType<typeof attributeCell>
  readonly placementButtons: ReadonlyMap<RecipeGridWidth, DomInteractiveElement>
}>

type RecipeCardShell = Omit<RecipeCard, 'placementButtons'>

type RecipeCards = Readonly<{
  readonly craftable: RecipeCard
  readonly uncraftable: RecipeCard
}>

type RecipeList = Readonly<{
  readonly root: DomElement
  readonly cards: DomElement
}>

type RecipeBookElements = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly craftable: RecipeList
  readonly uncraftable: RecipeList
  readonly actions: RecipeBookViewActions | undefined
  readonly options: RecipeBookViewOptions | undefined
  readonly focusState: RecipeFocusState
}>

type RecipeCardInput = Readonly<{
  readonly factory: DomElementFactory
  readonly list: DomElement
  readonly entry: RecipeBookEntry
  readonly section: RecipeSection
  readonly index: number
  readonly root: DomElement
  readonly options: RecipeBookViewOptions | undefined
  readonly actions: RecipeBookViewActions | undefined
  readonly focusState: RecipeFocusState
}>

type GridButtonInput = Readonly<{
  readonly factory: DomElementFactory
  readonly card: DomElement
  readonly recipe: Recipe
  readonly gridWidth: RecipeGridWidth
  readonly itemName: string
  readonly section: RecipeSection
  readonly focusIndex: number
  readonly actions: RecipeBookViewActions | undefined
  readonly focusState: RecipeFocusState
}>

const FIRST_INDEX = 0
const NO_SELECTION = -1
const NO_ITEMS = 0
const ONE_ITEM = 1
const TWO_COLUMNS = 2
const GRID_WIDTH_THREE = 3

const GRID_WIDTH_LABEL: Readonly<Record<RecipeGridWidth, string>> = {
  2: '2 × 2',
  3: '3 × 3',
}

const sectionFor = (section: RecipeSection): Readonly<{ key: 'recipe-book.craftable' | 'recipe-book.un-craftable'; group: string }> => {
  if (section === 'craftable') {
    return { group: 'recipe-book-craftable', key: 'recipe-book.craftable' }
  }
  return { group: 'recipe-book-uncraftable', key: 'recipe-book.un-craftable' }
}

const createRecipeBookRoot = (factory: DomElementFactory, parent: DomElement): DomElement => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'recipe-book')
  inheritUiLanguage(parent, root)
  declarePalette(root)
  root.style.setProperty('background-color', PALETTE_VAR.surface)
  root.style.setProperty('color', PALETTE_VAR.ink)
  setLocalizedAttribute(root, 'aria-label', 'recipe-book.title')
  parent.appendChild(root)
  return root
}

const createRecipeBookTitle = (factory: DomElementFactory, root: DomElement): void => {
  const title = factory.createElement('h2')
  title.setAttribute('data-mx-ui', 'recipe-book-title')
  inheritUiLanguage(root, title)
  writeLocalizedText(textCell(title), 'recipe-book.title')
  root.appendChild(title)
}

const createRecipeSectionHeading = (
  factory: DomElementFactory,
  element: DomElement,
  key: 'recipe-book.craftable' | 'recipe-book.un-craftable',
): DomElement => {
  const heading = factory.createElement('h3')
  heading.setAttribute('data-mx-ui', 'recipe-book-section-title')
  inheritUiLanguage(element, heading)
  writeLocalizedText(textCell(heading), key)
  return heading
}

const createRecipeSectionCards = (factory: DomElementFactory, element: DomElement): DomElement => {
  const cards = factory.createElement('div')
  cards.setAttribute('data-mx-ui', 'recipe-book-list')
  cards.style.setProperty('display', 'grid')
  cards.style.setProperty('gap', '4px')
  inheritUiLanguage(element, cards)
  return cards
}

const createRecipeSection = (
  factory: DomElementFactory,
  root: DomElement,
  section: RecipeSection,
): RecipeList => {
  const { key } = sectionFor(section)
  const element = factory.createElement('section')
  element.setAttribute('data-mx-ui', `recipe-book-${section}`)
  inheritUiLanguage(root, element)
  const heading = createRecipeSectionHeading(factory, element, key)
  const cards = createRecipeSectionCards(factory, element)
  element.appendChild(heading)
  element.appendChild(cards)
  root.appendChild(element)
  return { cards, root: element }
}

const displayNameOptionsFor = (
  language: ReturnType<typeof uiLanguageForElement>,
  options: RecipeBookViewOptions | undefined,
): ItemDisplayNameOptions => {
  const resolver = options?.displayNameResolver
  if (typeof resolver === 'undefined') {
    return { language }
  }
  return { language, resolver }
}

type OutputNameInput = Readonly<{
  readonly recipe: Recipe
  readonly index: number
  readonly options: ItemDisplayNameOptions
}>

const outputNameOf = ({ recipe, index, options }: OutputNameInput): string => {
  const view = slotView(
    { count: recipe.output.count, itemId: recipe.output.item },
    index,
    { itemDisplayNameOptions: options, selectedIndex: NO_SELECTION },
  )
  return itemDisplayNameText(view, options.language)
}

const writeGridButtonAttributes = (button: DomInteractiveElement, input: GridButtonInput): void => {
  button.setAttribute('type', 'button')
  button.setAttribute('data-mx-ui', 'recipe-book-place')
  button.setAttribute('data-grid-width', String(input.gridWidth))
  button.setAttribute('data-focus-group', sectionFor(input.section).group)
  button.setAttribute('data-focus-index', String(input.focusIndex))
  button.setAttribute('data-focus-columns', String(TWO_COLUMNS))
}

const writeGridButtonPresentation = (button: DomInteractiveElement, input: GridButtonInput): void => {
  button.style.setProperty('min-height', '24px')
  button.style.setProperty('color', PALETTE_VAR.ink)
  button.style.setProperty('background-color', PALETTE_VAR.slotFill)
  setLocalizedAttribute(button, 'aria-label', 'recipe-book.place', { item: input.itemName })
  writeText(textCell(button), GRID_WIDTH_LABEL[input.gridWidth])
}

const attachGridButtonAction = (button: DomInteractiveElement, input: GridButtonInput): void => {
  if (typeof input.actions?.onPlaceRecipe === 'function') {
    button.addEventListener('click', () => {
      const operation = recipePlacementOperationOf(input.recipe, input.gridWidth)
      if (Result.isSuccess(operation)) {
        input.actions?.onPlaceRecipe?.(operation.success)
      }
    })
  } else {
    button.setAttribute('disabled', '')
    button.setAttribute('aria-disabled', 'true')
  }
}

const sameRecipeFocusTarget = (left: RecipeFocusTarget | null, right: RecipeFocusTarget): boolean =>
  left !== null && left.recipeId === right.recipeId && left.gridWidth === right.gridWidth

const attachGridButtonFocus = (button: DomInteractiveElement, input: GridButtonInput): void => {
  const target: RecipeFocusTarget = { gridWidth: input.gridWidth, recipeId: input.recipe.id }
  button.addEventListener('focus', () => {
    input.focusState.current = target
  })
  button.addEventListener('blur', () => {
    if (sameRecipeFocusTarget(input.focusState.current, target)) {
      input.focusState.current = null
    }
  })
}

const createGridButton = (input: GridButtonInput): DomInteractiveElement => {
  const button: DomInteractiveElement = input.factory.createElement('button')
  writeGridButtonAttributes(button, input)
  writeGridButtonPresentation(button, input)
  attachGridButtonFocus(button, input)
  attachGridButtonAction(button, input)
  input.card.appendChild(button)
  return button
}

type OutputElementInput = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly entry: RecipeBookEntry
  readonly index: number
  readonly options: RecipeBookViewOptions | undefined
}>

const createRecipeOutput = (input: OutputElementInput): Readonly<{ element: DomElement; itemName: string }> => {
  const output = input.factory.createElement('h4')
  output.setAttribute('data-mx-ui', 'recipe-book-output')
  inheritUiLanguage(input.root, output)
  const language = uiLanguageForElement(input.root)
  const itemName = outputNameOf({
    index: input.index,
    options: displayNameOptionsFor(language, input.options),
    recipe: input.entry.recipe,
  })
  writeText(textCell(output), `${itemName} × ${String(input.entry.recipe.output.count)}`)
  return { element: output, itemName }
}

type GridSizeNotesInput = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly card: DomElement
  readonly entry: RecipeBookEntry
}>

type RecipeNoteInput = Readonly<{
  readonly factory: DomElementFactory
  readonly root: DomElement
  readonly card: DomElement
}>

const appendNoGridFitNote = ({ factory, root, card }: RecipeNoteInput): void => {
  const note = factory.createElement('p')
  note.setAttribute('data-mx-ui', 'recipe-book-no-grid-fit')
  inheritUiLanguage(root, note)
  writeLocalizedText(textCell(note), 'recipe-book.no-grid-fit')
  card.appendChild(note)
}

const appendRequiresTableNote = ({ factory, root, card }: RecipeNoteInput): void => {
  const note = factory.createElement('p')
  note.setAttribute('data-mx-ui', 'recipe-book-requires-table')
  inheritUiLanguage(root, note)
  writeLocalizedText(textCell(note), 'recipe-book.requires-table')
  card.appendChild(note)
}

const createGridSizeNotes = ({ factory, root, card, entry }: GridSizeNotesInput): void => {
  if (entry.gridWidths.length === NO_ITEMS) {
    appendNoGridFitNote({ card, factory, root })
    return
  }
  if (entry.gridWidths.length === ONE_ITEM && entry.gridWidths[FIRST_INDEX] === GRID_WIDTH_THREE) {
    appendRequiresTableNote({ card, factory, root })
  }
}

const appendGridButtons = (
  input: RecipeCardInput,
  card: DomElement,
  itemName: string,
): ReadonlyMap<RecipeGridWidth, DomInteractiveElement> => {
  const buttons = new Map<RecipeGridWidth, DomInteractiveElement>()
  for (const [buttonIndex, gridWidth] of input.entry.gridWidths.entries()) {
    const button = createGridButton({
      actions: input.actions,
      card,
      factory: input.factory,
      focusIndex: input.index * TWO_COLUMNS + buttonIndex,
      focusState: input.focusState,
      gridWidth,
      itemName,
      recipe: input.entry.recipe,
      section: input.section,
    })
    buttons.set(gridWidth, button)
  }
  return buttons
}

const createRecipeCardShell = (input: RecipeCardInput): RecipeCardShell => {
  const card = input.factory.createElement('article')
  card.setAttribute('data-mx-ui', 'recipe-book-entry')
  card.setAttribute('data-recipe-id', input.entry.recipe.id)
  card.setAttribute('data-recipe-state', input.section)
  card.setAttribute('hidden', '')
  card.style.setProperty('color', PALETTE_VAR.ink)
  const hidden = attributeCell(card, 'hidden')
  hidden.previous = ''
  return { hidden, root: card }
}

const createRecipeCard = (input: RecipeCardInput): RecipeCard => {
  const card = createRecipeCardShell(input)
  const output = createRecipeOutput({
    entry: input.entry,
    factory: input.factory,
    index: input.index,
    options: input.options,
    root: input.root,
  })
  card.root.appendChild(output.element)
  createGridSizeNotes({ card: card.root, entry: input.entry, factory: input.factory, root: input.root })
  const placementButtons = appendGridButtons(input, card.root, output.itemName)
  input.list.appendChild(card.root)
  return { ...card, placementButtons }
}

type RecipeCardCopiesInput = Readonly<{
  readonly elements: RecipeBookElements
  readonly entry: RecipeBookEntry
  readonly index: number
}>

const createRecipeCardCopies = ({ elements, entry, index }: RecipeCardCopiesInput): RecipeCards => ({
  craftable: createRecipeCard({
    actions: elements.actions,
    entry,
    factory: elements.factory,
    focusState: elements.focusState,
    index,
    list: elements.craftable.cards,
    options: elements.options,
    root: elements.root,
    section: 'craftable',
  }),
  uncraftable: createRecipeCard({
    actions: elements.actions,
    entry,
    factory: elements.factory,
    focusState: elements.focusState,
    index,
    list: elements.uncraftable.cards,
    options: elements.options,
    root: elements.root,
    section: 'uncraftable',
  }),
})

type EnsureRecipeCards = (entry: RecipeBookEntry, index: number) => RecipeCards

const createRecipeCardCache = (elements: RecipeBookElements): EnsureRecipeCards => {
  const cards = new Map<RecipeId, RecipeCards>()
  const ensureCards = (entry: RecipeBookEntry, index: number): RecipeCards => {
    const existing = cards.get(entry.recipe.id)
    if (typeof existing !== 'undefined') {
      return existing
    }
    const created = createRecipeCardCopies({ elements, entry, index })
    cards.set(entry.recipe.id, created)
    return created
  }
  return ensureCards
}

const renderCraftableEntries = (
  entries: ReadonlyArray<RecipeBookEntry>,
  ensureCards: EnsureRecipeCards,
): number => {
  let index = FIRST_INDEX
  for (const entry of entries) {
    const card = ensureCards(entry, index)
    writeHidden(card.craftable.hidden, false)
    writeHidden(card.uncraftable.hidden, true)
    index += ONE_ITEM
  }
  return index
}

type UncraftableEntriesInput = Readonly<{
  readonly entries: ReadonlyArray<RecipeBookEntry>
  readonly craftableIds: ReadonlySet<RecipeId>
  readonly uncraftableIds: ReadonlySet<RecipeId>
  readonly ensureCards: EnsureRecipeCards
  readonly startingIndex: number
}>

type PlacementButtonForSectionInput = Readonly<{
  readonly entries: ReadonlyArray<RecipeBookEntry>
  readonly ensureCards: EnsureRecipeCards
  readonly indexOffset: number
  readonly section: RecipeSection
  readonly target: RecipeFocusTarget
}>

const placementButtonForSection = ({
  entries,
  ensureCards,
  indexOffset,
  section,
  target,
}: PlacementButtonForSectionInput): DomInteractiveElement | undefined => {
  const entryIndex = entries.findIndex(({ recipe }) => recipe.id === target.recipeId)
  if (entryIndex < FIRST_INDEX) {
    return
  }
  const entry = entries[entryIndex]
  if (typeof entry === 'undefined') {
    return
  }
  return ensureCards(entry, entryIndex + indexOffset)[section].placementButtons.get(target.gridWidth)
}

const placementButtonFor = (
  model: RecipeBookViewModel,
  target: RecipeFocusTarget,
  ensureCards: EnsureRecipeCards,
): DomInteractiveElement | undefined =>
  placementButtonForSection({
    ensureCards,
    entries: model.craftable,
    indexOffset: FIRST_INDEX,
    section: 'craftable',
    target,
  }) ??
  placementButtonForSection({
    ensureCards,
    entries: model.uncraftable,
    indexOffset: model.craftable.length,
    section: 'uncraftable',
    target,
  })

const renderUncraftableEntries = ({
  entries,
  craftableIds,
  uncraftableIds,
  ensureCards,
  startingIndex,
}: UncraftableEntriesInput): void => {
  let index = startingIndex
  for (const entry of entries) {
    const card = ensureCards(entry, index)
    writeHidden(card.craftable.hidden, !craftableIds.has(entry.recipe.id))
    writeHidden(card.uncraftable.hidden, !uncraftableIds.has(entry.recipe.id))
    index += ONE_ITEM
  }
}

const renderRecipeBookModel = (
  model: RecipeBookViewModel,
  ensureCards: EnsureRecipeCards,
  focusState: RecipeFocusState,
): void => {
  const focusTarget = focusState.current
  const craftableIds = new Set(model.craftable.map(({ recipe }) => recipe.id))
  const uncraftableIds = new Set(model.uncraftable.map(({ recipe }) => recipe.id))
  const startingIndex = renderCraftableEntries(model.craftable, ensureCards)
  renderUncraftableEntries({ craftableIds, ensureCards, entries: model.uncraftable, startingIndex, uncraftableIds })
  if (focusTarget !== null) {
    placementButtonFor(model, focusTarget, ensureCards)?.focus()
  }
}

export const createRecipeBookView = (
  factory: DomElementFactory,
  parent: DomElement,
  ...viewOptions: readonly [RecipeBookViewActions?, RecipeBookViewOptions?]
): RecipeBookView => {
  const [actions, options] = viewOptions
  const root = createRecipeBookRoot(factory, parent)
  createRecipeBookTitle(factory, root)
  const craftable = createRecipeSection(factory, root, 'craftable')
  const uncraftable = createRecipeSection(factory, root, 'uncraftable')
  const focusState: RecipeFocusState = { current: null }
  const elements: RecipeBookElements = { actions, craftable, factory, focusState, options, root, uncraftable }
  const ensureCards = createRecipeCardCache(elements)
  const render = (model: RecipeBookViewModel): void => renderRecipeBookModel(model, ensureCards, focusState)
  return { render, root, setUiScale: (input) => applyUiScale(root.style, input) }
}
