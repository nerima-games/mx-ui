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

export type BrewingUnsupportedOperation =
  | 'insert-selected-item'
  | 'collect-bottle'
  | 'drink-potion'

type BrewingUnsupportedState<
  Operation extends BrewingUnsupportedOperation = BrewingUnsupportedOperation,
> = Readonly<{
  readonly _tag: 'Unsupported'
  readonly operation: Operation
  readonly reason: string
}>

export type BrewingIntent = Readonly<{ readonly _tag: 'Close' }>

export type BrewingViewModel = Readonly<{
  readonly bottles: readonly [BrewingBottleView, BrewingBottleView, BrewingBottleView]
  readonly fuel: BrewingStackView | undefined
  readonly fuelCharges: BrewingState['fuelCharges']
  readonly ingredient: BrewingStackView | undefined
  readonly operations: Readonly<{
    readonly collectBottle: BrewingUnsupportedState<'collect-bottle'>
    readonly drinkPotion: BrewingUnsupportedState<'drink-potion'>
    readonly insertSelectedItem: BrewingUnsupportedState<'insert-selected-item'>
  }>
  readonly progress: BrewingProgressView
}>

const IDLE_BREW_PROGRESS_SECS = 0

const INSERT_UNSUPPORTED: BrewingUnsupportedState<'insert-selected-item'> = Object.freeze({
  _tag: 'Unsupported',
  operation: 'insert-selected-item',
  reason:
    'Inserting a selected item changes player inventory and the brewing stand together. mc-sim 0.6.0 commits those service changes separately; the 0.7.0 plan-fragment API is required.',
})

const COLLECT_UNSUPPORTED: BrewingUnsupportedState<'collect-bottle'> = Object.freeze({
  _tag: 'Unsupported',
  operation: 'collect-bottle',
  reason:
    'Collecting a bottle changes the brewing stand and player inventory together. mc-sim 0.6.0 commits those service changes separately; the 0.7.0 plan-fragment API is required.',
})

const DRINK_UNSUPPORTED: BrewingUnsupportedState<'drink-potion'> = Object.freeze({
  _tag: 'Unsupported',
  operation: 'drink-potion',
  reason:
    'Drinking a potion changes player inventory and player effects together. mc-sim 0.6.0 cannot commit those owner changes atomically; the 0.7.0 plan-fragment API is required.',
})

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
    operations: Object.freeze({
      collectBottle: COLLECT_UNSUPPORTED,
      drinkPotion: DRINK_UNSUPPORTED,
      insertSelectedItem: INSERT_UNSUPPORTED,
    }),
    progress: projectProgress(snapshot.brewProgressSecs),
  })
}
