export const FURNACE_MAX_STACK_COUNT = 64

export type FurnaceStack = {
  readonly itemId: string
  readonly count: number
}

export type FurnaceRecipe = {
  readonly inputItemId: string
  readonly outputItemId: string
  readonly outputCount: number
  readonly cookTimeSecs: number
  readonly experience: number
}

export type FurnaceFuel = {
  readonly itemId: string
  readonly burnTimeSecs: number
}

export type FurnaceRules = {
  readonly recipes: ReadonlyArray<FurnaceRecipe>
  readonly fuels: ReadonlyArray<FurnaceFuel>
  readonly maxStackCount?: number
}

export type FurnaceState = {
  readonly input: FurnaceStack | undefined
  readonly fuel: FurnaceStack | undefined
  readonly output: FurnaceStack | undefined
  readonly burnRemainingSecs: number
  readonly burnTotalSecs: number
  readonly cookProgressSecs: number
  readonly storedExperience: number
}

export type FurnaceOutputTake = {
  readonly state: FurnaceState
  readonly stack: FurnaceStack | undefined
  readonly experience: number
}

/**
 * The value every "nothing here" field carries. These fields are typed
 * `X | undefined` rather than optional, so the value itself has to come from
 * somewhere: an identity function whose argument nobody supplies returns
 * exactly what a caller with nothing to report would return — nothing.
 */
const unknownValue = <TValue,>(value?: TValue): TValue | undefined => value

/** The floor a generic numeric quantity (elapsed time, experience) clamps to. */
const MIN_VALUE = 0

/** Stack count of a slot with nothing in it, or the threshold a count must clear. */
const EMPTY_COUNT = 0

/** The zero furnace-time comparisons (burn time, cook time, remaining slice) share. */
const ZERO_SECONDS = 0

/** A single remaining unit of a stack. */
const SINGLE_ITEM_COUNT = 1

export const emptyFurnaceState = (): FurnaceState => ({
  burnRemainingSecs: 0,
  burnTotalSecs: 0,
  cookProgressSecs: 0,
  fuel: unknownValue(),
  input: unknownValue(),
  output: unknownValue(),
  storedExperience: 0,
})

const positive = (value: number): number => {
  if (Number.isFinite(value)) {
    return Math.max(MIN_VALUE, value)
  }
  return MIN_VALUE
}

const wholeCount = (value: number): number => Math.trunc(positive(value))

const normalizedStack = (stack: FurnaceStack | undefined): FurnaceStack | undefined => {
  const count = wholeCount(stack?.count ?? EMPTY_COUNT)
  if (typeof stack === 'undefined' || count === EMPTY_COUNT) {
    return
  }
  return { count, itemId: stack.itemId }
}

export const putFurnaceInput = (state: FurnaceState, stack: FurnaceStack | undefined): FurnaceState => ({
  ...state,
  input: normalizedStack(stack),
})

export const putFurnaceFuel = (state: FurnaceState, stack: FurnaceStack | undefined): FurnaceState => ({
  ...state,
  fuel: normalizedStack(stack),
})

const recipeFor = (rules: FurnaceRules, state: FurnaceState): FurnaceRecipe | undefined =>
  rules.recipes.find((recipe) => recipe.inputItemId === state.input?.itemId)

const hasOutputRoom = (
  state: FurnaceState,
  recipe: FurnaceRecipe,
  maxStackCount: number,
): boolean =>
  recipe.outputCount > EMPTY_COUNT &&
  recipe.outputCount <= maxStackCount &&
  (typeof state.output === 'undefined' ||
    (state.output.itemId === recipe.outputItemId &&
      state.output.count + recipe.outputCount <= maxStackCount))

const remainingFuelStack = (fuel: FurnaceStack): FurnaceStack | undefined => {
  if (fuel.count === SINGLE_ITEM_COUNT) {
    return
  }
  return { count: fuel.count - SINGLE_ITEM_COUNT, itemId: fuel.itemId }
}

const consumeFuel = (rules: FurnaceRules, state: FurnaceState): FurnaceState => {
  const fuel = rules.fuels.find((candidate) => candidate.itemId === state.fuel?.itemId)
  if (
    typeof fuel === 'undefined' ||
    fuel.burnTimeSecs <= ZERO_SECONDS ||
    typeof state.fuel === 'undefined'
  ) {
    return state
  }
  return {
    ...state,
    burnRemainingSecs: fuel.burnTimeSecs,
    burnTotalSecs: fuel.burnTimeSecs,
    fuel: remainingFuelStack(state.fuel),
  }
}

const remainingInputStack = (input: FurnaceStack | undefined): FurnaceStack | undefined => {
  if (typeof input === 'undefined' || input.count <= SINGLE_ITEM_COUNT) {
    return
  }
  return { count: input.count - SINGLE_ITEM_COUNT, itemId: input.itemId }
}

const completeRecipe = (state: FurnaceState, recipe: FurnaceRecipe): FurnaceState => ({
  ...state,
  cookProgressSecs: 0,
  input: remainingInputStack(state.input),
  output: {
    count: (state.output?.count ?? EMPTY_COUNT) + recipe.outputCount,
    itemId: recipe.outputItemId,
  },
  storedExperience: state.storedExperience + positive(recipe.experience),
})

type FurnaceStep =
  | { readonly kind: 'stopped'; readonly state: FurnaceState }
  | { readonly kind: 'advanced'; readonly state: FurnaceState; readonly remaining: number }

const stalledState = (state: FurnaceState, remaining: number): FurnaceState => ({
  ...state,
  burnRemainingSecs: Math.max(ZERO_SECONDS, state.burnRemainingSecs - remaining),
  cookProgressSecs: 0,
})

const litState = (rules: FurnaceRules, state: FurnaceState): FurnaceState | undefined => {
  if (state.burnRemainingSecs > ZERO_SECONDS) {
    return state
  }
  const lit = consumeFuel(rules, state)
  if (lit === state) {
    return
  }
  return lit
}

type CookAttempt =
  | { readonly kind: 'ready'; readonly recipe: FurnaceRecipe; readonly state: FurnaceState }
  | { readonly kind: 'no-recipe' }
  | { readonly kind: 'unlit' }

const attemptToCook = (
  rules: FurnaceRules,
  state: FurnaceState,
  maxStackCount: number,
): CookAttempt => {
  const recipe = recipeFor(rules, state)
  const canCook = typeof recipe !== 'undefined' && hasOutputRoom(state, recipe, maxStackCount)
  if (!canCook || typeof recipe === 'undefined' || recipe.cookTimeSecs <= ZERO_SECONDS) {
    return { kind: 'no-recipe' }
  }
  const lit = litState(rules, state)
  if (typeof lit === 'undefined') {
    return { kind: 'unlit' }
  }
  return { kind: 'ready', recipe, state: lit }
}

const cookSlice = (recipe: FurnaceRecipe, state: FurnaceState, remaining: number): FurnaceStep => {
  const untilCooked = recipe.cookTimeSecs - state.cookProgressSecs
  const slice = Math.min(remaining, state.burnRemainingSecs, untilCooked)
  if (slice <= ZERO_SECONDS) {
    return { kind: 'stopped', state }
  }
  const cooked: FurnaceState = {
    ...state,
    burnRemainingSecs: state.burnRemainingSecs - slice,
    cookProgressSecs: state.cookProgressSecs + slice,
  }
  const nextRemaining = remaining - slice
  if (cooked.cookProgressSecs >= recipe.cookTimeSecs) {
    return { kind: 'advanced', remaining: nextRemaining, state: completeRecipe(cooked, recipe) }
  }
  return { kind: 'advanced', remaining: nextRemaining, state: cooked }
}

type FurnaceContext = {
  readonly rules: FurnaceRules
  readonly maxStackCount: number
}

const advanceOnce = (context: FurnaceContext, state: FurnaceState, remaining: number): FurnaceStep => {
  const attempt = attemptToCook(context.rules, state, context.maxStackCount)
  if (attempt.kind === 'no-recipe') {
    return { kind: 'stopped', state: stalledState(state, remaining) }
  }
  if (attempt.kind === 'unlit') {
    return { kind: 'stopped', state }
  }
  return cookSlice(attempt.recipe, attempt.state, remaining)
}

/** Advances persistent furnace state. Keeping the returned state closes/reopens without pausing it. */
export const advanceFurnace = (
  previous: FurnaceState,
  elapsedSecs: number,
  rules: FurnaceRules,
): FurnaceState => {
  let state: FurnaceState = { ...previous }
  let remaining = positive(elapsedSecs)
  const maxStackCount = wholeCount(rules.maxStackCount ?? FURNACE_MAX_STACK_COUNT)

  while (remaining > ZERO_SECONDS) {
    const step = advanceOnce({ maxStackCount, rules }, state, remaining)
    if (step.kind === 'stopped') {
      return step.state
    }
    ;({ remaining, state } = step)
  }
  return state
}

const takenExperience = (state: FurnaceState): number => {
  if (typeof state.output === 'undefined') {
    return MIN_VALUE
  }
  return state.storedExperience
}

const stateAfterTakingOutput = (state: FurnaceState): FurnaceState => {
  if (typeof state.output === 'undefined') {
    return state
  }
  return { ...state, output: unknownValue(), storedExperience: 0 }
}

export const takeFurnaceOutput = (state: FurnaceState): FurnaceOutputTake => ({
  experience: takenExperience(state),
  stack: state.output,
  state: stateAfterTakingOutput(state),
})

const burnProgressOf = (state: FurnaceState): number => {
  if (state.burnTotalSecs <= ZERO_SECONDS) {
    return MIN_VALUE
  }
  return state.burnRemainingSecs / state.burnTotalSecs
}

const cookProgressOf = (state: FurnaceState, recipe: FurnaceRecipe | undefined): number => {
  if (typeof recipe === 'undefined' || recipe.cookTimeSecs <= ZERO_SECONDS) {
    return MIN_VALUE
  }
  return state.cookProgressSecs / recipe.cookTimeSecs
}

export const furnaceSnapshotOf = (state: FurnaceState, rules: FurnaceRules) => {
  const recipe = recipeFor(rules, state)
  return {
    burnProgress: burnProgressOf(state),
    cookProgress: cookProgressOf(state, recipe),
    fuel: state.fuel,
    input: state.input,
    output: state.output,
  }
}
