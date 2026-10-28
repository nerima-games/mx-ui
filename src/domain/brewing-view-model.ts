import { BREWING_TIME_SECS, type BrewingState } from '@nerima-games/mc-sim'

export type BrewingSnapshot = BrewingState

type BrewingStack = NonNullable<BrewingState['ingredient']>

export type BrewingStackView = Readonly<{
  readonly count: BrewingStack['count']
  readonly item: BrewingStack['item']
}>

export type BrewingBottleView = Readonly<{
  readonly label: 'Bottle 1' | 'Bottle 2' | 'Bottle 3'
  readonly stack: BrewingStackView | undefined
}>

type BrewingProgressView =
  | Readonly<{ readonly _tag: 'Idle' }>
  | Readonly<{ readonly _tag: 'Brewing'; readonly remainingSecs: number }>

export type BrewingOperation =
  | 'insert-selected-item'
  | 'collect-bottle'
  | 'drink-potion'

export type BrewingIntent =
  | Readonly<{ readonly _tag: 'InsertSelectedItem' }>
  | Readonly<{ readonly _tag: 'CollectBottle' }>
  | Readonly<{ readonly _tag: 'DrinkPotion' }>
  | Readonly<{ readonly _tag: 'Close' }>

export type BrewingViewModel = Readonly<{
  readonly bottles: readonly [BrewingBottleView, BrewingBottleView, BrewingBottleView]
  readonly fuel: BrewingStackView | undefined
  readonly fuelCharges: BrewingState['fuelCharges']
  readonly ingredient: BrewingStackView | undefined
  readonly progress: BrewingProgressView
}>

const IDLE_BREW_PROGRESS_SECS = 0

const projectStack = (stack: BrewingState['ingredient']): BrewingStackView | undefined => {
  if (!stack) {
    return
  }
  return Object.freeze({ count: stack.count, item: stack.item })
}

const projectBottle = (
  label: BrewingBottleView['label'],
  stack: BrewingState['bottles'][number],
): BrewingBottleView => Object.freeze({ label, stack: projectStack(stack) })

const projectProgress = (seconds: BrewingState['brewProgressSecs']): BrewingProgressView => {
  if (seconds === IDLE_BREW_PROGRESS_SECS) {
    return Object.freeze({ _tag: 'Idle' })
  }
  return Object.freeze({ _tag: 'Brewing', remainingSecs: BREWING_TIME_SECS - seconds })
}

export const brewingViewModel = (snapshot: BrewingSnapshot): BrewingViewModel => {
  const [firstBottle, secondBottle, thirdBottle] = snapshot.bottles
  const bottles: BrewingViewModel['bottles'] = [
    projectBottle('Bottle 1', firstBottle),
    projectBottle('Bottle 2', secondBottle),
    projectBottle('Bottle 3', thirdBottle),
  ]

  return Object.freeze({
    bottles: Object.freeze(bottles),
    fuel: projectStack(snapshot.fuel),
    fuelCharges: snapshot.fuelCharges,
    ingredient: projectStack(snapshot.ingredient),
    progress: projectProgress(snapshot.brewProgressSecs),
  })
}
