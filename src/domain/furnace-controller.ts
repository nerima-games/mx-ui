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

export const emptyFurnaceState = (): FurnaceState => ({
  burnRemainingSecs: 0,
  burnTotalSecs: 0,
  cookProgressSecs: 0,
  fuel: undefined,
  input: undefined,
  output: undefined,
  storedExperience: 0,
})

const positive = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const wholeCount = (value: number): number => Math.trunc(positive(value))

const normalizedStack = (stack: FurnaceStack | undefined): FurnaceStack | undefined => {
  const count = wholeCount(stack?.count ?? 0)
  return stack === undefined || count === 0 ? undefined : { itemId: stack.itemId, count }
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
  recipe.outputCount > 0 &&
  recipe.outputCount <= maxStackCount &&
  (state.output === undefined ||
    (state.output.itemId === recipe.outputItemId &&
      state.output.count + recipe.outputCount <= maxStackCount))

const consumeFuel = (rules: FurnaceRules, state: FurnaceState): FurnaceState => {
  const fuel = rules.fuels.find((candidate) => candidate.itemId === state.fuel?.itemId)
  if (fuel === undefined || fuel.burnTimeSecs <= 0 || state.fuel === undefined) {
    return state
  }
  return {
    ...state,
    burnRemainingSecs: fuel.burnTimeSecs,
    burnTotalSecs: fuel.burnTimeSecs,
    fuel:
      state.fuel.count === 1
        ? undefined
        : { itemId: state.fuel.itemId, count: state.fuel.count - 1 },
  }
}

const completeRecipe = (state: FurnaceState, recipe: FurnaceRecipe): FurnaceState => ({
  ...state,
  cookProgressSecs: 0,
  input:
    state.input === undefined || state.input.count <= 1
      ? undefined
      : { itemId: state.input.itemId, count: state.input.count - 1 },
  output: {
    itemId: recipe.outputItemId,
    count: (state.output?.count ?? 0) + recipe.outputCount,
  },
  storedExperience: state.storedExperience + positive(recipe.experience),
})

/** Advances persistent furnace state. Keeping the returned state closes/reopens without pausing it. */
export const advanceFurnace = (
  previous: FurnaceState,
  elapsedSecs: number,
  rules: FurnaceRules,
): FurnaceState => {
  let state: FurnaceState = { ...previous }
  let remaining = positive(elapsedSecs)
  const maxStackCount = wholeCount(rules.maxStackCount ?? FURNACE_MAX_STACK_COUNT)

  while (remaining > 0) {
    const recipe = recipeFor(rules, state)
    const canCook = recipe !== undefined && hasOutputRoom(state, recipe, maxStackCount)
    if (!canCook || recipe === undefined || recipe.cookTimeSecs <= 0) {
      return {
        ...state,
        burnRemainingSecs: Math.max(0, state.burnRemainingSecs - remaining),
        cookProgressSecs: 0,
      }
    }
    if (state.burnRemainingSecs <= 0) {
      const lit = consumeFuel(rules, state)
      if (lit === state) {
        return state
      }
      state = lit
    }
    const untilCooked = recipe.cookTimeSecs - state.cookProgressSecs
    const slice = Math.min(remaining, state.burnRemainingSecs, untilCooked)
    if (slice <= 0) {
      return state
    }
    state = {
      ...state,
      burnRemainingSecs: state.burnRemainingSecs - slice,
      cookProgressSecs: state.cookProgressSecs + slice,
    }
    remaining -= slice
    if (state.cookProgressSecs >= recipe.cookTimeSecs) {
      state = completeRecipe(state, recipe)
    }
  }
  return state
}

export const takeFurnaceOutput = (state: FurnaceState): FurnaceOutputTake => ({
  experience: state.output === undefined ? 0 : state.storedExperience,
  stack: state.output,
  state:
    state.output === undefined
      ? state
      : { ...state, output: undefined, storedExperience: 0 },
})

export const furnaceSnapshotOf = (state: FurnaceState, rules: FurnaceRules) => {
  const recipe = recipeFor(rules, state)
  return {
    burnProgress:
      state.burnTotalSecs <= 0 ? 0 : state.burnRemainingSecs / state.burnTotalSecs,
    cookProgress:
      recipe === undefined || recipe.cookTimeSecs <= 0
        ? 0
        : state.cookProgressSecs / recipe.cookTimeSecs,
    fuel: state.fuel,
    input: state.input,
    output: state.output,
  }
}
